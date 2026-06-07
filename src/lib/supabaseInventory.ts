import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import type { 
  InventoryItem, 
  InventoryMovement, 
  InventoryCategory, 
  InventoryStatus,
  CreateInventoryItemInput,
  CreateInventoryMovementInput
} from '../domain/inventory/types';

export function handleSupabaseError(error: any, context: string) {
  console.warn(`[supabaseInventory] ${context} error:`, error.message);
  if (error.code === '42501' || error.message?.toLowerCase().includes('row-level security') || error.message?.toLowerCase().includes('policy')) {
    const err = new Error('Permiso denegado por políticas de seguridad (RLS).');
    err.name = 'PermissionError';
    throw err;
  }
  throw error;
}

export async function fetchActiveInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .is('deleted_at', null);

  if (error) {
    handleSupabaseError(error, 'fetchActiveInventoryItems');
  }

  return (data || []) as InventoryItem[];
}

export async function fetchInventoryItemsByCategory(category: InventoryCategory): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('category', category)
    .is('deleted_at', null);

  if (error) {
    handleSupabaseError(error, 'fetchInventoryItemsByCategory');
  }

  return (data || []) as InventoryItem[];
}

export async function fetchInventoryItemById(id: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    handleSupabaseError(error, 'fetchInventoryItemById');
  }

  return (data as InventoryItem) || null;
}

export async function upsertInventoryItem(item: CreateInventoryItemInput): Promise<InventoryItem> {
  const userId = useAuthStore.getState().user?.id;
  
  const row = {
    ...item,
    created_by: userId || null,
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('inventory_items')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    handleSupabaseError(error, 'upsertInventoryItem');
  }

  return data as InventoryItem;
}

export async function updateInventoryItemStatus(id: string, status: InventoryStatus, payload?: Record<string, any>): Promise<InventoryItem> {
  const userId = useAuthStore.getState().user?.id;
  
  const updateData: any = {
    status,
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };
  
  if (payload) {
    updateData.payload = payload;
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update(updateData)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    handleSupabaseError(error, 'updateInventoryItemStatus');
  }

  return data as InventoryItem;
}

export async function softDeleteInventoryItem(id: string): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  
  const { error } = await supabase
    .from('inventory_items')
    .update({ 
      deleted_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
      status: 'deleted'
    })
    .eq('id', id);

  if (error) {
    handleSupabaseError(error, 'softDeleteInventoryItem');
  }
}

export async function createInventoryMovement(movement: CreateInventoryMovementInput): Promise<InventoryMovement> {
  const userId = useAuthStore.getState().user?.id;
  
  const row = {
    ...movement,
    created_by: userId || null
  };

  const { data, error } = await supabase
    .from('inventory_movements')
    .insert(row)
    .select()
    .single();

  if (error) {
    handleSupabaseError(error, 'createInventoryMovement');
  }

  return data as InventoryMovement;
}

export async function fetchMovementsForItem(itemId: string): Promise<InventoryMovement[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('inventory_item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    handleSupabaseError(error, 'fetchMovementsForItem');
  }

  return (data || []) as InventoryMovement[];
}

export async function fetchMovementsForOrder(orderId: string): Promise<InventoryMovement[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    handleSupabaseError(error, 'fetchMovementsForOrder');
  }

  return (data || []) as InventoryMovement[];
}
