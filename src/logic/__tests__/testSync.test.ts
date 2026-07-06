import { describe, it, expect, vi } from 'vitest';
import { syncApiCatalogToSupabase } from '../syncApiCatalogToSupabase';

const { mockFrom, mockSelect, mockEq } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn().mockImplementation(() => ({
    select: mockSelect,
    upsert: mockUpsert,
  }));
  return { mockFrom, mockSelect, mockEq };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
    from: mockFrom,
  },
}));

describe('Test Sync', () => {
  it('runs sync correctly with mocked supabase', async () => {
    const count = await syncApiCatalogToSupabase();
    expect(count).toBeGreaterThan(0);
    expect(mockFrom).toHaveBeenCalledWith('inventory_items');
    expect(mockSelect).toHaveBeenCalledWith('id, code, status, payload, source');
    expect(mockEq).toHaveBeenCalledWith('source', 'vertilux_api');
  });
});
