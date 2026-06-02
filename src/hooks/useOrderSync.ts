import { useEffect, useRef } from 'react';
import { useCalculatorStore } from '../features/calculadora-screen/store/useCalculatorStore';
import { fetchActiveOrders, upsertOrders } from '../lib/supabaseOrders';
import { supabase } from '../lib/supabase';

export function useOrderSync() {
  const isMigrating = useRef(false);
  const isSubscribed = useRef(false);

  useEffect(() => {
    async function initSync() {
      if (isMigrating.current) return;
      isMigrating.current = true;

      try {
        const store = useCalculatorStore.getState();
        
        // 1. Fetch remote orders
        const remoteOrders = await fetchActiveOrders();
        const remoteIds = new Set(remoteOrders.map(o => o.id));

        // 2. Local migration logic
        const localOrders = store.savedOrders;
        const now = Date.now();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

        const toMigrate = localOrders.filter(o => {
          if (remoteIds.has(o.id)) return false; // Ya esta en Supabase
          if (!o.createdAt) return false;
          const createdMs = new Date(o.createdAt).getTime();
          if (isNaN(createdMs)) return false;
          if (now - createdMs > ninetyDaysMs) return false; // Mas vieja de 90 dias
          return true;
        });

        if (toMigrate.length > 0) {
          console.log(`[useOrderSync] Migrating ${toMigrate.length} local orders to Supabase...`);
          // Para no ensuciar SavedOrder type con propiedades internas temporalmente lo ignoramos
          await upsertOrders(toMigrate);
        }

        // 3. Merge remote into local sin duplicar y priorizando remoto (last-write-wins)
        const merged = [...localOrders];
        let hasChanges = false;

        remoteOrders.forEach(ro => {
          const idx = merged.findIndex(lo => lo.id === ro.id);
          if (idx === -1) {
            merged.push(ro);
            hasChanges = true;
          } else {
            // Remoto siempre pisa local al inicializar (para sincronizar entre dispositivos)
            merged[idx] = ro;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          store.setSavedOrders(() => merged);
        }

        // 4. Suscripcion a Realtime
        if (!isSubscribed.current) {
          isSubscribed.current = true;
          supabase
            .channel('work_orders_realtime')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'work_orders' },
              (payload) => {
                const eventType = payload.eventType;
                const newRow = payload.new as any;
                const oldRow = payload.old as any;
                
                const storeState = useCalculatorStore.getState();

                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                  if (newRow.deleted_at) {
                    storeState.deleteSavedOrder(newRow.id);
                  } else {
                    const parsedPayload = newRow.payload;
                    const currentOrders = storeState.savedOrders;
                    const existingIdx = currentOrders.findIndex(o => o.id === newRow.id);
                    
                    const updated = [...currentOrders];
                    if (existingIdx >= 0) {
                      // Solo actualizar si hay un cambio real (optimistic update evita loops infinitos)
                      if (JSON.stringify(currentOrders[existingIdx]) !== JSON.stringify(parsedPayload)) {
                        updated[existingIdx] = parsedPayload;
                        updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                        storeState.setSavedOrders(() => updated);
                      }
                    } else {
                      updated.unshift(parsedPayload);
                      updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                      storeState.setSavedOrders(() => updated);
                    }
                  }
                } else if (eventType === 'DELETE') {
                  storeState.deleteSavedOrder(oldRow.id);
                }
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                 console.log('[useOrderSync] Realtime subscribed to work_orders');
              }
            });
        }

      } catch (err) {
        console.error('[useOrderSync] Error during sync init (fallback to local caching):', err);
      }
    }

    initSync();

    return () => {
      if (isSubscribed.current) {
        supabase.channel('work_orders_realtime').unsubscribe();
        isSubscribed.current = false;
      }
    };
  }, []);
}
