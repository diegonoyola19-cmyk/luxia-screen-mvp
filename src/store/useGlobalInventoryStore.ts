import { create } from 'zustand';
import type { InventoryItem, InventoryMovement } from '../domain/inventory/types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export type PendingActionType = 'upsert_item' | 'update_status' | 'soft_delete' | 'create_movement';

export interface PendingOperation {
  id: string; // unique ID for the operation
  type: PendingActionType;
  payload: any;
  itemId?: string; // related item ID
  timestamp: number;
  retryCount: number;
  error?: string;
}

interface GlobalInventoryState {
  items: InventoryItem[];
  movements: InventoryMovement[];
  
  syncStatus: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  
  pendingQueue: PendingOperation[];

  // Actions for items
  setItems: (items: InventoryItem[]) => void;
  upsertItemLocally: (item: InventoryItem) => void;
  removeItemLocally: (id: string) => void;
  
  // Actions for movements
  setMovements: (movements: InventoryMovement[]) => void;
  addMovementLocally: (movement: InventoryMovement) => void;

  // Sync actions
  setSyncStatus: (status: SyncStatus, error?: string) => void;
  setLastSyncedAt: (timestamp: number) => void;

  // Queue actions
  enqueueOperation: (op: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>) => void;
  removeOperation: (opId: string) => void;
  markOperationError: (opId: string, error: string) => void;
}

export const useGlobalInventoryStore = create<GlobalInventoryState>((set) => ({
  items: [],
  movements: [],
  
  syncStatus: 'idle',
  lastError: null,
  lastSyncedAt: null,
  
  pendingQueue: [],

  setItems: (items) => set({ items }),
  
  upsertItemLocally: (item) => set((state) => {
    const existing = state.items.findIndex(i => i.id === item.id);
    if (existing >= 0) {
      const newItems = [...state.items];
      newItems[existing] = item;
      return { items: newItems };
    }
    return { items: [item, ...state.items] };
  }),

  removeItemLocally: (id) => set((state) => ({
    items: state.items.filter(i => i.id !== id)
  })),

  setMovements: (movements) => set({ movements }),
  
  addMovementLocally: (movement) => set((state) => ({
    movements: [movement, ...state.movements]
  })),

  setSyncStatus: (status, error) => set({ 
    syncStatus: status, 
    lastError: error || null 
  }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  enqueueOperation: (op) => set((state) => ({
    pendingQueue: [...state.pendingQueue, {
      ...op,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0
    }]
  })),

  removeOperation: (opId) => set((state) => ({
    pendingQueue: state.pendingQueue.filter(op => op.id !== opId)
  })),

  markOperationError: (opId, error) => set((state) => ({
    pendingQueue: state.pendingQueue.map(op => 
      op.id === opId ? { ...op, error, retryCount: op.retryCount + 1 } : op
    )
  }))
}));
