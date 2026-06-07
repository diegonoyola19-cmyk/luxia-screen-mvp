import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import { 
  fetchActiveInventoryItems, 
  fetchInventoryItemsByCategory,
  upsertInventoryItem,
  updateInventoryItemStatus,
  softDeleteInventoryItem,
  createInventoryMovement,
  handleSupabaseError
} from '../supabaseInventory';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('supabaseInventory', () => {
  let mockSelect: any;
  let mockInsert: any;
  let mockUpsert: any;
  let mockUpdate: any;
  let mockEq: any;
  let mockIs: any;
  let mockSingle: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSingle = vi.fn().mockResolvedValue({ data: { id: '1' }, error: null });
    mockSelect = vi.fn().mockReturnValue({
      single: mockSingle,
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
    });

    mockIs = vi.fn().mockReturnValue({ single: mockSingle, select: mockSelect });
    mockEq = vi.fn().mockReturnValue({ is: mockIs, single: mockSingle, select: mockSelect });

    mockSelect.mockReturnValue({ eq: mockEq, is: mockIs, single: mockSingle });

    mockUpdate = vi.fn().mockReturnValue({
      eq: mockEq,
      is: mockIs,
      select: mockSelect,
    });

    mockUpsert = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    mockInsert = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
      upsert: mockUpsert,
      insert: mockInsert,
    });
  });

  describe('handleSupabaseError', () => {
    it('throws PermissionError on 42501', () => {
      expect(() => handleSupabaseError({ code: '42501', message: 'new row violates row-level security policy' }, 'test'))
        .toThrowError('Permiso denegado por políticas de seguridad (RLS).');
    });

    it('re-throws standard error for network failures (5xx)', () => {
      expect(() => handleSupabaseError({ code: '500', message: 'Internal Server Error' }, 'test'))
        .toThrowError('Internal Server Error');
    });
  });

  describe('fetchActiveInventoryItems', () => {
    it('fetches items that are not soft-deleted', async () => {
      mockIs.mockResolvedValueOnce({ data: [{ id: '1' }], error: null });

      const result = await fetchActiveInventoryItems();

      expect(supabase.from).toHaveBeenCalledWith('inventory_items');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
      expect(result).toHaveLength(1);
    });
  });

  describe('fetchInventoryItemsByCategory', () => {
    it('fetches items filtered by category', async () => {
      mockIs.mockResolvedValueOnce({ data: [{ id: '1', category: 'fabric' }], error: null });

      const result = await fetchInventoryItemsByCategory('fabric');

      expect(supabase.from).toHaveBeenCalledWith('inventory_items');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('category', 'fabric');
      expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
      expect(result[0].category).toBe('fabric');
    });
  });

  describe('upsertInventoryItem', () => {
    it('upserts item data', async () => {
      const input = {
        id: 'new-id',
        category: 'fabric' as const,
        kind: 'roll' as const,
        code: 'FAB-01',
        status: 'available' as const,
        payload: { widthMeters: 2.5 },
        created_from_order_id: null,
        source: 'api'
      };

      await upsertInventoryItem(input);

      expect(supabase.from).toHaveBeenCalledWith('inventory_items');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...input,
        }),
        { onConflict: 'id', ignoreDuplicates: false }
      );
    });

    it('throws PermissionError on 42501 for upsertInventoryItem', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'RLS' } });

      await expect(upsertInventoryItem({} as any)).rejects.toThrow('Permiso denegado por políticas de seguridad (RLS).');
    });
  });

  describe('updateInventoryItemStatus', () => {
    it('updates status and payload', async () => {
      await updateInventoryItemStatus('1', 'used', { reason: 'cut' });

      expect(supabase.from).toHaveBeenCalledWith('inventory_items');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'used',
          payload: { reason: 'cut' },
        })
      );
      expect(mockEq).toHaveBeenCalledWith('id', '1');
    });
  });

  describe('softDeleteInventoryItem', () => {
    it('updates deleted_at and sets status to deleted', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });
      
      await softDeleteInventoryItem('item-123');

      expect(supabase.from).toHaveBeenCalledWith('inventory_items');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
        })
      );
      // Ensure deleted_at was included
      const updateArg = mockUpdate.mock.calls[0][0];
      expect(updateArg.deleted_at).toBeDefined();
      expect(mockEq).toHaveBeenCalledWith('id', 'item-123');
    });
  });

  describe('createInventoryMovement', () => {
    it('inserts a new movement', async () => {
      const input = {
        id: 'mov-1',
        inventory_item_id: 'item-1',
        order_id: null,
        category: 'fabric' as const,
        action: 'import' as const,
        item_code: 'FAB-01',
        quantity: 10,
        unit: 'm',
        notes: null,
        payload: {}
      };

      await createInventoryMovement(input);

      expect(supabase.from).toHaveBeenCalledWith('inventory_movements');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...input,
        })
      );
    });
  });
});
