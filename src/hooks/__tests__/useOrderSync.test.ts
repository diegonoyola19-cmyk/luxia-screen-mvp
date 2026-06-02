import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderSync } from '../useOrderSync';
import { useCalculatorStore } from '../../features/calculadora-screen/store/useCalculatorStore';
import * as supabaseOrders from '../../lib/supabaseOrders';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabaseOrders', () => ({
  fetchActiveOrders: vi.fn().mockResolvedValue([]),
  upsertOrders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  },
}));

describe('useOrderSync hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCalculatorStore.setState({ savedOrders: [] });
  });

  it('migrates only orders <= 90 days with valid createdAt', async () => {
    const now = Date.now();
    const validDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();

    const orders: any[] = [
      { id: '1', createdAt: validDate },
      { id: '2', createdAt: oldDate },
      { id: '3', createdAt: 'invalid' },
      { id: '4' }, // missing createdAt
    ];

    useCalculatorStore.setState({ savedOrders: orders });

    renderHook(() => useOrderSync());

    // Wait for microtasks
    await new Promise(process.nextTick);

    expect(supabaseOrders.upsertOrders).toHaveBeenCalledTimes(1);
    const upserted = vi.mocked(supabaseOrders.upsertOrders).mock.calls[0][0];
    expect(upserted).toHaveLength(1);
    expect(upserted[0].id).toBe('1');
  });

  it('merges remote orders without duplicating', async () => {
    const local = { id: '1', createdAt: new Date().toISOString() };
    const remote = { id: '1', createdAt: new Date().toISOString(), status: 'in_production' };
    
    useCalculatorStore.setState({ savedOrders: [local as any] });
    vi.mocked(supabaseOrders.fetchActiveOrders).mockResolvedValue([remote as any]);

    renderHook(() => useOrderSync());

    await new Promise(process.nextTick);

    const store = useCalculatorStore.getState();
    expect(store.savedOrders).toHaveLength(1);
    expect(store.savedOrders[0].status).toBe('in_production');
  });
});
