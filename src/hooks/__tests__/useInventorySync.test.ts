import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInventorySync } from '../useInventorySync';
import { useGlobalInventoryStore } from '../../store/useGlobalInventoryStore';
import * as supabaseInventory from '../../lib/supabaseInventory';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabaseInventory', () => ({
  fetchActiveInventoryItems: vi.fn(),
  upsertInventoryItem: vi.fn(),
  updateInventoryItemStatus: vi.fn(),
  softDeleteInventoryItem: vi.fn(),
  createInventoryMovement: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => {
        if (cb) cb('SUBSCRIBED');
      }),
      unsubscribe: vi.fn(),
    })),
  },
}));

describe('useInventorySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGlobalInventoryStore.setState({
      items: [],
      movements: [],
      syncStatus: 'idle',
      lastError: null,
      lastSyncedAt: null,
      pendingQueue: []
    });
    
    // reset navigator online status
    Object.defineProperty(window.navigator, 'onLine', {
      writable: true,
      value: true
    });
  });

  it('fetches items on init and sets sync status', async () => {
    const mockItems = [{ id: '1', status: 'available' }];
    (supabaseInventory.fetchActiveInventoryItems as any).mockResolvedValueOnce(mockItems);

    renderHook(() => useInventorySync());

    // Allow promises to resolve
    await vi.waitFor(() => {
      expect(useGlobalInventoryStore.getState().items).toHaveLength(1);
    });

    expect(useGlobalInventoryStore.getState().syncStatus).toBe('synced');
  });

  it('handles network error silently and does not crash app', async () => {
    (supabaseInventory.fetchActiveInventoryItems as any).mockRejectedValueOnce(new Error('Network error'));

    renderHook(() => useInventorySync());

    await vi.waitFor(() => {
      expect(useGlobalInventoryStore.getState().syncStatus).toBe('error');
    });

    expect(useGlobalInventoryStore.getState().lastError).toBe('Network error');
    // Store items remain empty but app didn't crash
    expect(useGlobalInventoryStore.getState().items).toHaveLength(0);
  });

  it('flushes pending queue on init', async () => {
    (supabaseInventory.fetchActiveInventoryItems as any).mockResolvedValueOnce([]);
    (supabaseInventory.upsertInventoryItem as any).mockResolvedValueOnce({});
    
    useGlobalInventoryStore.getState().enqueueOperation({
      type: 'upsert_item',
      payload: { id: 'op-1', code: 'test' }
    });

    renderHook(() => useInventorySync());

    await vi.waitFor(() => {
      expect(supabaseInventory.upsertInventoryItem).toHaveBeenCalledWith({ id: 'op-1', code: 'test' });
      // Queue should be empty after success
      expect(useGlobalInventoryStore.getState().pendingQueue).toHaveLength(0);
    });
  });

  it('handles PermissionError correctly without losing queue', async () => {
    (supabaseInventory.fetchActiveInventoryItems as any).mockResolvedValueOnce([]);
    
    const permErr = new Error('RLS');
    permErr.name = 'PermissionError';
    (supabaseInventory.softDeleteInventoryItem as any).mockRejectedValueOnce(permErr);
    
    useGlobalInventoryStore.getState().enqueueOperation({
      type: 'soft_delete',
      itemId: 'item-1',
      payload: null
    });

    renderHook(() => useInventorySync());

    await vi.waitFor(() => {
      expect(supabaseInventory.softDeleteInventoryItem).toHaveBeenCalledWith('item-1');
      // Queue should NOT be empty, it marks error
      const q = useGlobalInventoryStore.getState().pendingQueue;
      expect(q).toHaveLength(1);
      expect(q[0].error).toContain('Permiso denegado');
    });
  });

  it('stops queue flush if navigator is offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      writable: true,
      value: false
    });
    
    useGlobalInventoryStore.getState().enqueueOperation({
      type: 'upsert_item',
      payload: {}
    });

    renderHook(() => useInventorySync());

    // Should not call upsert because offline
    expect(supabaseInventory.upsertInventoryItem).not.toHaveBeenCalled();
    expect(useGlobalInventoryStore.getState().pendingQueue).toHaveLength(1);
  });
});
