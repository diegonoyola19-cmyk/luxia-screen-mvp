import { supabase } from './supabase';
import type { SavedOrder } from '../domain/curtains/types';

export async function fetchActiveOrders(): Promise<SavedOrder[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('payload')
    .is('deleted_at', null);

  if (error) {
    console.warn('[supabaseOrders] fetchActiveOrders error:', error.message);
    throw error;
  }

  return (data || []).map((row) => row.payload as SavedOrder);
}

function mapOrderToRow(order: SavedOrder) {
  return {
    id: order.id,
    order_number: order.orderNumber || 'Unknown',
    client_name: null,
    status: order.status || 'draft',
    payload: order,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export async function upsertOrder(order: SavedOrder): Promise<void> {
  const row = mapOrderToRow(order);
  const { error } = await supabase
    .from('work_orders')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.warn('[supabaseOrders] upsertOrder error:', error.message);
    throw error;
  }
}

export async function upsertOrders(orders: SavedOrder[]): Promise<void> {
  if (orders.length === 0) return;
  const rows = orders.map(mapOrderToRow);
  const { error } = await supabase
    .from('work_orders')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.warn('[supabaseOrders] upsertOrders error:', error.message);
    throw error;
  }
}

export async function softDeleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.warn('[supabaseOrders] softDeleteOrder error:', error.message);
    throw error;
  }
}
