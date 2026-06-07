import { useAuthStore } from '../store/useAuthStore';
import { 
  ProductionInventory, 
  InventoryMovement as LocalMovement 
} from '../domain/curtains/types';
import type { 
  InventoryItem, 
  CreateInventoryItemInput, 
  CreateInventoryMovementInput,
  InventoryCategory,
  InventoryStatus
} from '../domain/inventory/types';
import { 
  upsertInventoryItem, 
  createInventoryMovement 
} from './supabaseInventory';
import { STORAGE_KEYS } from '../domain/curtains/constants';

const MIGRATION_FLAG_KEY = 'luxia_inventory_migration_status';

export interface MigrationStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  itemsMigrated?: number;
  movementsMigrated?: number;
  error?: string;
}

export function getInventoryMigrationStatus(): MigrationStatus {
  const raw = window.localStorage.getItem(MIGRATION_FLAG_KEY);
  if (!raw) return { status: 'pending' };
  try {
    return JSON.parse(raw);
  } catch {
    return { status: 'pending' };
  }
}

export function markInventoryMigrationStatus(status: MigrationStatus) {
  window.localStorage.setItem(MIGRATION_FLAG_KEY, JSON.stringify(status));
}

export function readLocalProductionInventorySnapshot(): { inventory: ProductionInventory, movements: LocalMovement[] } {
  const invRaw = window.localStorage.getItem(STORAGE_KEYS.productionInventory);
  const movRaw = window.localStorage.getItem(STORAGE_KEYS.inventoryMovements);

  let inventory: ProductionInventory = { fabrics: [], tubes: [], bottoms: [], components: [] };
  let movements: LocalMovement[] = [];

  if (invRaw) {
    try { inventory = { ...inventory, ...JSON.parse(invRaw) }; } catch (e) {}
  }
  if (movRaw) {
    try { movements = JSON.parse(movRaw); } catch (e) {}
  }

  return { inventory, movements };
}

function ensureValidUUID(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : crypto.randomUUID();
}

export function mapLocalInventoryItemToGlobalItem(
  localItem: any, 
  category: InventoryCategory, 
  deviceId: string
): CreateInventoryItemInput {
  
  const id = ensureValidUUID(localItem.id || '');
  
  let kind: any = localItem.kind || 'unit';
  if (category === 'component') kind = 'unit';

  const status: InventoryStatus = localItem.status || 'available';

  return {
    id,
    category,
    kind,
    code: localItem.code || localItem.name || 'UNKNOWN',
    status,
    created_from_order_id: null,
    source: 'migration',
    payload: {
      ...localItem, // Keep all local fields for safety
      migratedFrom: 'localStorage',
      migratedAt: new Date().toISOString(),
      migratedBy: useAuthStore.getState().user?.email || 'unknown',
      sourceDeviceId: deviceId,
      originalLocalId: localItem.id,
      originalCategory: category
    }
  };
}

export function mapLocalMovementToGlobalMovement(
  localMovement: LocalMovement,
  deviceId: string
): CreateInventoryMovementInput {
  
  const id = ensureValidUUID(localMovement.id || '');
  
  // Safe mapping of action to allowed values
  let action: any = localMovement.action;
  const allowedActions = ['import', 'adjust', 'reserve', 'consume', 'create_scrap', 'use_scrap', 'discard', 'transfer', 'rollback'];
  if (!allowedActions.includes(action)) {
    action = 'adjust';
  }

  return {
    id,
    inventory_item_id: null, 
    order_id: null,
    category: (localMovement.category as InventoryCategory) || 'fabric',
    action,
    item_code: localMovement.itemCode || 'UNKNOWN',
    quantity: localMovement.quantity || 0,
    unit: localMovement.unit || 'units',
    notes: localMovement.notes || `Migrated from local storage on ${new Date().toISOString()}`,
    payload: {
      ...localMovement,
      migratedFrom: 'localStorage',
      sourceDeviceId: deviceId,
      originalAction: localMovement.action
    }
  };
}

export async function runInventoryMigration(): Promise<void> {
  const currentStatus = getInventoryMigrationStatus();
  if (currentStatus.status === 'completed') {
    console.log('[inventoryMigration] Already completed.');
    return;
  }

  const deviceId = window.localStorage.getItem('luxia_device_id') || crypto.randomUUID();
  window.localStorage.setItem('luxia_device_id', deviceId);

  markInventoryMigrationStatus({ status: 'in_progress', startedAt: Date.now() });

  try {
    const { inventory, movements } = readLocalProductionInventorySnapshot();
    let itemsMigrated = 0;
    let movementsMigrated = 0;

    // Map all items
    const allItemsToUpsert: CreateInventoryItemInput[] = [
      ...inventory.fabrics.map(i => mapLocalInventoryItemToGlobalItem(i, 'fabric', deviceId)),
      ...inventory.tubes.map(i => mapLocalInventoryItemToGlobalItem(i, 'tube', deviceId)),
      ...inventory.bottoms.map(i => mapLocalInventoryItemToGlobalItem(i, 'bottom', deviceId)),
      ...inventory.components.map(i => mapLocalInventoryItemToGlobalItem(i, 'component', deviceId)),
    ];

    // Map all movements
    const allMovementsToInsert: CreateInventoryMovementInput[] = movements.map(m => mapLocalMovementToGlobalMovement(m, deviceId));

    // Upload items
    for (const item of allItemsToUpsert) {
      await upsertInventoryItem(item);
      itemsMigrated++;
    }

    // Upload movements
    for (const mov of allMovementsToInsert) {
      try {
         await createInventoryMovement(mov);
         movementsMigrated++;
      } catch (err: any) {
         if (err?.code === '23505') { // unique violation
            // Ignore if already migrated
         } else {
            throw err;
         }
      }
    }

    // Mark completed
    markInventoryMigrationStatus({ 
      status: 'completed', 
      completedAt: Date.now(),
      itemsMigrated,
      movementsMigrated
    });

  } catch (error: any) {
    console.error('[inventoryMigration] Error migrating:', error);
    markInventoryMigrationStatus({ 
      status: 'failed', 
      error: error?.message || 'Unknown migration error'
    });
    throw error;
  }
}
