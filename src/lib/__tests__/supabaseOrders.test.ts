import { describe, it, expect, vi } from 'vitest';
import { fetchActiveOrders, upsertOrder, softDeleteOrder } from '../supabaseOrders';
import { supabase } from '../supabase';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [{ payload: { id: '1', orderNumber: '100' } }], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe('supabaseOrders', () => {
  it('fetchActiveOrders maps payload', async () => {
    const orders = await fetchActiveOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('1');
  });

  it('upsertOrder formats row correctly', async () => {
    await upsertOrder({ id: '2', orderNumber: '200', createdAt: '2023-01-01', items: [] } as any);
    expect(supabase.from).toHaveBeenCalledWith('work_orders');
  });

  it('softDeleteOrder updates deleted_at', async () => {
    await softDeleteOrder('1');
    expect(supabase.from).toHaveBeenCalledWith('work_orders');
  });
});
