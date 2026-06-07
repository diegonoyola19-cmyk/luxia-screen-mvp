import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import type { SavedOrder } from '../domain/curtains/types';

function handleSupabaseError(error: any, context: string) {
  console.warn(`[supabaseOrders] ${context} error:`, error.message);
  if (error.code === '42501' || error.message?.toLowerCase().includes('row-level security') || error.message?.toLowerCase().includes('policy')) {
    const err = new Error('Permiso denegado por políticas de seguridad (RLS).');
    err.name = 'PermissionError';
    throw err;
  }
  throw error;
}

export async function fetchActiveOrders(): Promise<SavedOrder[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('payload')
    .is('deleted_at', null);

  if (error) {
    handleSupabaseError(error, 'fetchActiveOrders');
  }

  return (data || []).map((row) => row.payload as SavedOrder);
}

function mapOrderToRow(order: SavedOrder) {
  const userId = useAuthStore.getState().user?.id;
  
  return {
    id: order.id,
    order_number: order.orderNumber || 'Unknown',
    client_name: null,
    status: order.status || 'draft',
    payload: order,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: userId || null,
    updated_by: userId || null
  };
}

export async function upsertOrder(order: SavedOrder): Promise<void> {
  const row = mapOrderToRow(order);
  const { error } = await supabase
    .from('work_orders')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    handleSupabaseError(error, 'upsertOrder');
  }
}

export async function upsertOrders(orders: SavedOrder[]): Promise<void> {
  if (orders.length === 0) return;
  const rows = orders.map(mapOrderToRow);
  const { error } = await supabase
    .from('work_orders')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    handleSupabaseError(error, 'upsertOrders');
  }
}

export async function softDeleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    handleSupabaseError(error, 'softDeleteOrder');
  }
}
