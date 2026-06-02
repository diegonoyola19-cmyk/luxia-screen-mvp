import { useEffect, useRef } from 'react';
import { useCalculatorStore } from '../features/calculadora-screen/store/useCalculatorStore';
import { fetchActiveOrders, upsertOrders, upsertOrder, softDeleteOrder } from '../lib/supabaseOrders';
import { supabase } from '../lib/supabase';

export function useOrderSync() {
  const isMigrating = useRef(false);
  const isSubscribed = useRef(false);

  useEffect(() => {
    let isFlushing = false;

    async function flushQueue() {
      if (isFlushing || !navigator.onLine) return;
      isFlushing = true;
      try {
        const store = useCalculatorStore.getState();
        const meta = store.syncMetadata;
        const savedOrders = store.savedOrders;

        const pendingEntries = Object.entries(meta).filter(([_, status]) => status.status === 'pending');
        if (pendingEntries.length === 0) return;

        for (const [orderId, status] of pendingEntries) {
          try {
            if (status.pendingAction === 'upsert') {
              const orderToUpsert = savedOrders.find(o => o.id === orderId);
              if (orderToUpsert) {
                await upsertOrder(orderToUpsert);
                useCalculatorStore.getState().markOrderSynced(orderId);
              } else {
                // If the order is not in local state but it's pending upsert, it's an anomaly. Clear it.
                useCalculatorStore.getState().clearOrderSyncMetadata(orderId);
              }
            } else if (status.pendingAction === 'delete') {
              await softDeleteOrder(orderId);
              useCalculatorStore.getState().clearOrderSyncMetadata(orderId);
            }
          } catch (err: any) {
            // Network errors will be handled naturally (they throw TypeError or similar for fetch)
            if (err?.status && err.status >= 400 && err.status < 500) {
               useCalculatorStore.getState().markOrderSyncError(orderId, err.message || 'Error de sincronización');
            } else {
               // Posible error de red o servidor, pausar cola para reintentar luego
               console.warn('[useOrderSync] Deteniendo cola por error de red o 5xx', err);
               break; 
            }
          }
        }
      } finally {
        isFlushing = false;
      }
    }

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
          if (remoteIds.has(o.id)) return false; 
          if (!o.createdAt) return false;
          const createdMs = new Date(o.createdAt).getTime();
          if (isNaN(createdMs)) return false;
          if (now - createdMs > ninetyDaysMs) return false; 
          return true;
        });

        if (toMigrate.length > 0) {
          console.log(`[useOrderSync] Migrating ${toMigrate.length} local orders to Supabase...`);
          await upsertOrders(toMigrate);
          // Marcar migradas como synced
          toMigrate.forEach(o => useCalculatorStore.getState().markOrderSynced(o.id));
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
            // Check if local is pending. If local is pending, keep local for now, let flushQueue push it.
            // If local is NOT pending, remote wins.
            const isPending = store.syncMetadata[ro.id]?.status === 'pending';
            if (!isPending) {
              merged[idx] = ro;
              hasChanges = true;
              useCalculatorStore.getState().markOrderSynced(ro.id);
            }
          }
        });

        if (hasChanges) {
          merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          store.setSavedOrders(() => merged);
        }

        // Lanzar vaciado de cola inicial
        flushQueue();

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
                    storeState.removeOrderLocally(newRow.id);
                    storeState.clearOrderSyncMetadata(newRow.id);
                  } else {
                    const parsedPayload = newRow.payload;
                    const currentOrders = storeState.savedOrders;
                    const existingIdx = currentOrders.findIndex(o => o.id === newRow.id);
                    
                    const updated = [...currentOrders];
                    if (existingIdx >= 0) {
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
                    storeState.markOrderSynced(newRow.id);
                  }
                } else if (eventType === 'DELETE') {
                  storeState.removeOrderLocally(oldRow.id);
                  storeState.clearOrderSyncMetadata(oldRow.id);
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
        console.error('[useOrderSync] Error during sync init:', err);
      }
    }

    const handleNetworkChange = () => flushQueue();
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('sync-orders', handleNetworkChange);

    initSync();

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('sync-orders', handleNetworkChange);
      if (isSubscribed.current) {
        supabase.channel('work_orders_realtime').unsubscribe();
        isSubscribed.current = false;
      }
    };
  }, []);
}
