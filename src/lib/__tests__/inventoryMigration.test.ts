import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getInventoryMigrationStatus, 
  markInventoryMigrationStatus,
  readLocalProductionInventorySnapshot,
  mapLocalInventoryItemToGlobalItem,
  mapLocalMovementToGlobalMovement,
  runInventoryMigration
} from '../inventoryMigration';
import * as supabaseInventory from '../supabaseInventory';

vi.mock('../supabaseInventory', () => ({
  upsertInventoryItem: vi.fn(),
  createInventoryMovement: vi.fn(),
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { email: 'test@test.com' } }))
  }
}));

describe('inventoryMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe('getInventoryMigrationStatus & markInventoryMigrationStatus', () => {
    it('returns pending by default', () => {
      expect(getInventoryMigrationStatus().status).toBe('pending');
    });

    it('saves and reads status correctly', () => {
      markInventoryMigrationStatus({ status: 'completed', itemsMigrated: 5 });
      const status = getInventoryMigrationStatus();
      expect(status.status).toBe('completed');
      expect(status.itemsMigrated).toBe(5);
    });
  });

  describe('readLocalProductionInventorySnapshot', () => {
    it('returns empty structures if nothing in localStorage', () => {
      const { inventory, movements } = readLocalProductionInventorySnapshot();
      expect(inventory.fabrics).toEqual([]);
      expect(inventory.tubes).toEqual([]);
      expect(inventory.bottoms).toEqual([]);
      expect(inventory.components).toEqual([]);
      expect(movements).toEqual([]);
    });

    it('reads and parses existing localStorage data', () => {
      window.localStorage.setItem('luxia-screen-production-inventory', JSON.stringify({
        fabrics: [{ id: 'f1', code: 'FAB' }],
        tubes: [{ id: 't1', code: 'TUB' }]
      }));
      window.localStorage.setItem('luxia-screen-inventory-movements', JSON.stringify([
        { id: 'm1', action: 'import' }
      ]));

      const { inventory, movements } = readLocalProductionInventorySnapshot();
      expect(inventory.fabrics[0].id).toBe('f1');
      expect(inventory.tubes[0].id).toBe('t1');
      expect(movements[0].id).toBe('m1');
    });
  });

  describe('mapLocalInventoryItemToGlobalItem', () => {
    it('preserves fields and injects metadata', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const local = { id: validUuid, code: 'F-01', kind: 'roll', status: 'available', widthMeters: 2 };
      const mapped = mapLocalInventoryItemToGlobalItem(local, 'fabric', 'dev-1');

      expect(mapped.id).toBe(validUuid);
      expect(mapped.category).toBe('fabric');
      expect(mapped.code).toBe('F-01');
      expect(mapped.payload.migratedFrom).toBe('localStorage');
      expect(mapped.payload.widthMeters).toBe(2);
      expect(mapped.payload.sourceDeviceId).toBe('dev-1');
      expect(mapped.payload.migratedBy).toBe('unknown');
    });

    it('generates UUID if missing or invalid', () => {
      const local = { id: 'invalid-id', code: 'T-01' };
      const mapped = mapLocalInventoryItemToGlobalItem(local, 'tube', 'dev-1');
      
      expect(mapped.id).not.toBe('invalid-id');
      expect(mapped.id).toHaveLength(36); // UUID length
    });
  });

  describe('mapLocalMovementToGlobalMovement', () => {
    it('maps correctly and validates action', () => {
      const local = { id: 'uuid-2', action: 'weird_action', itemCode: 'F-01', itemLabel: 'Tela F-01', quantity: 5, category: 'fabric', unit: 'm', createdAt: '' };
      const mapped = mapLocalMovementToGlobalMovement(local, 'dev-1');

      expect(mapped.action).toBe('adjust'); // fallback for weird_action
      expect(mapped.quantity).toBe(5);
      expect(mapped.payload.originalAction).toBe('weird_action');
    });
  });

  describe('runInventoryMigration', () => {
    it('aborts if already completed', async () => {
      markInventoryMigrationStatus({ status: 'completed' });
      await runInventoryMigration();
      expect(supabaseInventory.upsertInventoryItem).not.toHaveBeenCalled();
    });

    it('migrates items and movements successfully', async () => {
      window.localStorage.setItem('luxia-screen-production-inventory', JSON.stringify({
        fabrics: [{ id: 'f1', code: 'FAB' }]
      }));
      window.localStorage.setItem('luxia-screen-inventory-movements', JSON.stringify([
        { id: 'm1', action: 'import' }
      ]));

      (supabaseInventory.upsertInventoryItem as any).mockResolvedValue({});
      (supabaseInventory.createInventoryMovement as any).mockResolvedValue({});

      await runInventoryMigration();

      expect(supabaseInventory.upsertInventoryItem).toHaveBeenCalledTimes(1);
      expect(supabaseInventory.createInventoryMovement).toHaveBeenCalledTimes(1);

      const status = getInventoryMigrationStatus();
      expect(status.status).toBe('completed');
      expect(status.itemsMigrated).toBe(1);
      expect(status.movementsMigrated).toBe(1);
    });

    it('falla limpiamente si Supabase lanza PermissionError y marca status failed', async () => {
      window.localStorage.setItem('luxia-screen-production-inventory', JSON.stringify({
        fabrics: [{ id: 'f1', code: 'FAB' }]
      }));

      const err = new Error('RLS');
      err.name = 'PermissionError';
      (supabaseInventory.upsertInventoryItem as any).mockRejectedValue(err);

      await expect(runInventoryMigration()).rejects.toThrow('RLS');

      const status = getInventoryMigrationStatus();
      expect(status.status).toBe('failed');
      expect(status.error).toBe('RLS');
    });
  });
});
