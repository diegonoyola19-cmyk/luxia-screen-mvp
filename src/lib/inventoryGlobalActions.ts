import { InventoryItem, InventoryMovement } from '../domain/inventory/types';

export interface ManualScrapInput {
  code: string;
  family?: string;
  color?: string;
  widthMeters: number;
  lengthMeters: number;
  notes?: string;
  orderNumber?: string;
  userId?: string;
}

export function createGlobalScrapPayload(input: ManualScrapInput): { item: InventoryItem; movement: InventoryMovement } {
  const now = new Date().toISOString();
  const itemId = crypto.randomUUID();

  const item: InventoryItem = {
    id: itemId,
    code: input.code,
    sku: input.code, // or some default logic
    material_kind: 'fabric',
    type: 'scrap',
    status: 'available',
    location: 'Bodega Principal', // default location
    created_at: now,
    updated_at: now,
    payload: {
      width_meters: input.widthMeters,
      length_meters: input.lengthMeters,
      family: input.family,
      color: input.color,
      notes: input.notes,
      source_order_number: input.orderNumber,
      source: 'manual',
      created_from: 'inventory-panel',
      created_by: input.userId
    }
  };

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_item_id: itemId,
    action: 'create_scrap',
    quantity: input.lengthMeters,
    unit: 'm',
    notes: input.notes || 'Registro manual de retazo',
    created_by: input.userId || 'system',
    created_at: now,
    payload: {
      width_meters: input.widthMeters,
      length_meters: input.lengthMeters,
      code: input.code,
      color: input.color
    }
  };

  return { item, movement };
}

export function createGlobalDiscardPayload(item: InventoryItem, userId?: string, reason?: string): { updatedStatus: 'discarded'; movement: InventoryMovement } {
  const now = new Date().toISOString();

  const quantity = item.payload?.length_meters || 1;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_item_id: item.id,
    action: 'discard',
    quantity: quantity,
    unit: item.material_kind === 'fabric' ? 'm' : 'pieza',
    notes: reason || 'Baja manual de inventario',
    created_by: userId || 'system',
    created_at: now,
    payload: {
      previous_status: item.status,
      new_status: 'discarded',
      item_code: item.code || item.sku,
      item_snapshot: item
    }
  };

  return { updatedStatus: 'discarded', movement };
}
