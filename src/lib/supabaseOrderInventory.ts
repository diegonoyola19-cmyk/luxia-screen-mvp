import { supabase } from './supabase';
import { toast } from 'sonner';
import type { SavedOrder } from '../domain/curtains/types';
import type { ConsumptionPlan } from '../logic/buildConsumptionPlan';

export class OrderInventoryRpcError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'OrderInventoryRpcError';
  }
}

export class OrderInventoryPermissionError extends OrderInventoryRpcError {
  constructor(message: string = 'Permiso denegado para afectar inventario') {
    super(message, 'PERMISSION_DENIED');
    this.name = 'OrderInventoryPermissionError';
  }
}

export class InsufficientStockError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_STOCK');
    this.name = 'InsufficientStockError';
  }
}

export class InvalidConsumptionPlanError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INVALID_CONSUMPTION_PLAN');
    this.name = 'InvalidConsumptionPlanError';
  }
}

export class InvalidOrderError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INVALID_ORDER');
    this.name = 'InvalidOrderError';
  }
}

export class InventoryItemUnavailableError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'ITEM_NOT_AVAILABLE');
    this.name = 'InventoryItemUnavailableError';
  }
}

function mapRpcError(error: any): never {
  const msg = error.message || '';
  const code = error.code || '';

  if (code === '42501' || msg.includes('PERMISSION_DENIED')) {
    throw new OrderInventoryPermissionError(msg);
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    throw new InsufficientStockError(msg);
  }
  if (msg.includes('INVALID_CONSUMPTION_PLAN')) {
    throw new InvalidConsumptionPlanError(msg);
  }
  if (msg.includes('INVALID_ORDER')) {
    throw new InvalidOrderError(msg);
  }
  if (msg.includes('ITEM_NOT_AVAILABLE')) {
    throw new InventoryItemUnavailableError(msg);
  }

  throw new OrderInventoryRpcError(msg || 'Error desconocido al procesar inventario de la orden', code);
}

export async function processOrderInventoryTransaction(
  orderPayload: SavedOrder,
  consumptionPlan: ConsumptionPlan
): Promise<boolean> {
  const { error } = await supabase.rpc('process_order_inventory_tx', {
    p_order_payload: orderPayload,
    p_consumption_plan: consumptionPlan
  });

  if (error) {
    mapRpcError(error);
  }

  return true;
}

export async function commitIssueSnapshotToInventory(order: SavedOrder): Promise<void> {
  if (!order.productionReview?.issueSnapshot) return;

  const snapshot = order.productionReview.issueSnapshot;
  if (!snapshot.createdRemainders || snapshot.createdRemainders.length === 0) return;

  // Insert linear remainders as kind='unit' in inventory_items
  const itemsToInsert = snapshot.createdRemainders.map(r => {
    // Generate an ID if needed, or use the one from remainder
    const itemId = r.id.startsWith('rem-') ? crypto.randomUUID() : r.id;
    return {
      id: itemId,
      category: r.sku.includes('TU-') ? 'tube' : 'bottom',
      kind: 'unit',
      code: r.sku,
      status: 'available',
      created_from_order_id: order.id,
      source: 'production_cut',
      payload: {
        length_feet: r.remainingLengthFt,
        length_meters: r.remainingLengthFt / 3.28084,
        available_quantity: 1, // It's a single unit of this specific length
        unit: 'FT',
        code: r.sku,
        description: r.description
      }
    };
  });

  const { error } = await supabase.from('inventory_items').insert(itemsToInsert);

  if (error) {
    console.error('[commitIssueSnapshotToInventory] Error inserting remainders:', error);
    toast.error(`No se pudieron guardar los tubos en Bodega: ${error.message}`);
    // Not throwing here to avoid breaking the Sage export entirely if just one remainder fails
    // or if RLS has issues, but ideally it should succeed.
  } else {
    // Insert movements
    const movements = itemsToInsert.map(item => ({
      inventory_item_id: item.id,
      order_id: order.id,
      category: item.category,
      action: 'create_scrap',
      item_code: item.code,
      quantity: item.payload.length_feet,
      unit: 'FT',
      notes: 'Sobrante generado desde corte de producción'
    }));
    await supabase.from('inventory_movements').insert(movements);
  }
}

