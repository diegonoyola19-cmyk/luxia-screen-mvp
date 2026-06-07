import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchActiveOrders, upsertOrder, softDeleteOrder } from '../supabaseOrders';
import { supabase } from '../supabase';

vi.mock('../supabase', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn()
  };
  return {
    supabase: {
      from: vi.fn(() => mockQuery)
    }
  };
});

describe('workOrders RBAC integration (handleSupabaseError)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws PermissionError on 42501 for fetchActiveOrders', async () => {
    const mockQuery = supabase.from('work_orders') as any;
    vi.mocked(mockQuery.is).mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' }
    } as any);

    const promise = fetchActiveOrders();
    await expect(promise).rejects.toThrow('Permiso denegado por políticas de seguridad (RLS).');
    await expect(promise).rejects.toHaveProperty('name', 'PermissionError');
  });

  it('throws PermissionError on 42501 for upsertOrder', async () => {
    const mockQuery = supabase.from('work_orders') as any;
    vi.mocked(mockQuery.upsert).mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' }
    } as any);

    const promise = upsertOrder({ id: '1' } as any);
    await expect(promise).rejects.toThrow('Permiso denegado por políticas de seguridad (RLS).');
    await expect(promise).rejects.toHaveProperty('name', 'PermissionError');
  });

  it('throws PermissionError on 42501 for softDeleteOrder', async () => {
    const mockQuery = supabase.from('work_orders') as any;
    vi.mocked(mockQuery.eq).mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' }
    } as any);

    const promise = softDeleteOrder('1');
    await expect(promise).rejects.toThrow('Permiso denegado por políticas de seguridad (RLS).');
    await expect(promise).rejects.toHaveProperty('name', 'PermissionError');
  });

  it('re-throws standard error for network failures (5xx)', async () => {
    const mockQuery = supabase.from('work_orders') as any;
    vi.mocked(mockQuery.is).mockResolvedValueOnce({
      data: null,
      error: { code: '500', message: 'Internal Server Error' }
    } as any);

    const promise = fetchActiveOrders();
    await expect(promise).rejects.toThrow('Internal Server Error');
  });
});
