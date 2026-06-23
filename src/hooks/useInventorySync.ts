import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  fetchActiveInventoryItems, 
  upsertInventoryItem,
  updateInventoryItemStatus,
  softDeleteInventoryItem,
  createInventoryMovement
} from '../lib/supabaseInventory';
import { useGlobalInventoryStore } from '../store/useGlobalInventoryStore';
import type { InventoryItem, InventoryMovement } from '../domain/inventory/types';

export function useInventorySync() {
  const isInitialized = useRef(false);
  const isSubscribed = useRef(false);

  useEffect(() => {
    let isFlushing = false;

    async function flushQueue() {
      if (isFlushing || !navigator.onLine) return;
      isFlushing = true;

      try {
        const store = useGlobalInventoryStore.getState();
        const pendingQueue = store.pendingQueue;

        if (pendingQueue.length === 0) return;

        store.setSyncStatus('syncing');

        for (const op of pendingQueue) {
          try {
            switch (op.type) {
              case 'upsert_item':
                await upsertInventoryItem(op.payload);
                break;
              case 'update_status':
                await updateInventoryItemStatus(op.itemId!, op.payload.status, op.payload.payload);
                break;
              case 'soft_delete':
                await softDeleteInventoryItem(op.itemId!);
                break;
              case 'create_movement':
                await createInventoryMovement(op.payload);
                break;
            }
            useGlobalInventoryStore.getState().removeOperation(op.id);
          } catch (err: any) {
            if (err?.name === 'PermissionError') {
              useGlobalInventoryStore.getState().markOperationError(op.id, 'Permiso denegado (RLS)');
            } else if (err?.status && err.status >= 400 && err.status < 500) {
              useGlobalInventoryStore.getState().markOperationError(op.id, err.message || 'Error de sync');
            } else {
              // Network error, break loop
              store.setSyncStatus('error', 'Error de red al sincronizar inventario');
              break;
            }
          }
        }
      } finally {
        isFlushing = false;
        const remaining = useGlobalInventoryStore.getState().pendingQueue;
        if (remaining.length === 0) {
          useGlobalInventoryStore.getState().setSyncStatus('synced');
        } else {
           // Si quedo alguna con error
           useGlobalInventoryStore.getState().setSyncStatus('error', 'Operaciones pendientes');
        }
      }
    }

    async function initSync() {
      if (isInitialized.current) return;
      isInitialized.current = true;

      const store = useGlobalInventoryStore.getState();
      store.setSyncStatus('syncing');

      try {
        // 1. Fetch remote items
        const remoteItems = await fetchActiveInventoryItems();
        store.setItems(remoteItems);
        
        // (Movements won't be fully fetched on init to save bandwidth, only on demand, but we can setup the queue)
        
        store.setLastSyncedAt(Date.now());
        store.setSyncStatus('synced');

        // Flush any offline pending ops
        flushQueue();

        // 2. Subscribe to realtime
        if (!isSubscribed.current) {
          isSubscribed.current = true;
          supabase
            .channel('inventory_realtime')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'inventory_items' },
              (payload) => {
                const eventType = payload.eventType;
                const newRow = payload.new as InventoryItem;
                const oldRow = payload.old as InventoryItem;
                
                const currentState = useGlobalInventoryStore.getState();

                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                  if (newRow.deleted_at || newRow.status === 'deleted') {
                    currentState.removeItemLocally(newRow.id);
                  } else {
                    currentState.upsertItemLocally(newRow);
                  }
                } else if (eventType === 'DELETE') {
                  currentState.removeItemLocally(oldRow.id);
                }
              }
            )
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'inventory_movements' },
              (payload) => {
                const newRow = payload.new as InventoryMovement;
                useGlobalInventoryStore.getState().addMovementLocally(newRow);
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                 console.log('[useInventorySync] Realtime subscribed to inventory tables');
              }
            });
        }
      } catch (err: any) {
        console.error('[useInventorySync] Error during init:', err);
        store.setSyncStatus('error', err.message || 'Error inicializando inventario');
      }
    }

    const handleNetworkChange = () => flushQueue();
    const handleSyncInventory = () => initSync();
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('sync-inventory', handleSyncInventory);

    initSync();

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('sync-inventory', handleSyncInventory);
      if (isSubscribed.current) {
        supabase.channel('inventory_realtime').unsubscribe();
        isSubscribed.current = false;
      }
    };
  }, []);
}
