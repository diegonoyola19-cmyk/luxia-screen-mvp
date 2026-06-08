import { supabase } from './supabase';
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
