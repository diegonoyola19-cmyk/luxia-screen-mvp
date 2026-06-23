import { supabase } from '../lib/supabase';
import { mapVertiluxApiInventoryItem } from './mapVertiluxApiInventoryItem';
import { planSyncForItem, buildUpsertPayload, InventoryItemRecord } from './syncVertiluxInventoryPlan';
import luxiaItemCatalog from '../data/luxia-item-catalog.json';
import luxiaRollerCatalog from '../data/luxia-roller-catalog.json';

export async function syncApiCatalogToSupabase() {
  const { data: userResp } = await supabase.auth.getUser();
  const userId = userResp.user?.id;

  // 1. Fetch current API items from Supabase to reconcile
  const { data: existingItems, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, code, status, payload, source')
    .eq('source', 'vertilux_api');

  if (fetchErr) throw new Error(fetchErr.message);

  const existingByCode = new Map<string, InventoryItemRecord>();
  for (const row of (existingItems || [])) {
    existingByCode.set(row.code, row);
  }

  // 2. Combine and map catalogs
  const allApiItems = [...luxiaItemCatalog.items, ...luxiaRollerCatalog.items];
  
  // Create a Map to keep unique items by itemCode
  const uniqueApiItems = new Map<string, any>();
  for (const item of allApiItems) {
    if (!uniqueApiItems.has(item.itemCode)) {
      uniqueApiItems.set(item.itemCode, item);
    }
  }

  const inserts = [];
  const updates = [];

  // 3. Process each item
  for (const item of uniqueApiItems.values()) {
    const rawApiFormat = {
      ITEMNO: item.itemCode,
      DESCRIPTION: item.description,
      UNIT: item.unit,
      QTYONHAND: item.qtyOnHand,
      QTYSALORDR: item.qtyOnOrder, // Or something similar, but QTYSALORDR is usually sales order
      QTYONORDER: item.qtyOnOrder,
      QTYOFFSET: item.qtyOffset || 0
    };

    const mapped = mapVertiluxApiInventoryItem(rawApiFormat as any);
    if (!mapped.success) continue;

    const existing = existingByCode.get(item.itemCode);
    const plan = planSyncForItem(mapped, existing);
    
    if (plan.action !== 'skip') {
      const payload = buildUpsertPayload(plan, existing);
      if (payload) {
        if (userId && !(payload as any).created_by) {
           (payload as any).created_by = userId;
        }
        
        if (plan.action === 'insert') {
          inserts.push(payload);
        } else {
          updates.push(payload);
        }
      }
    }
  }

  // Helper to chunk and upsert
  const chunkAndUpsert = async (dataList: any[]) => {
    const chunkSize = 500;
    for (let i = 0; i < dataList.length; i += chunkSize) {
      const chunk = dataList.slice(i, i + chunkSize);
      const { error: upsertErr } = await supabase
        .from('inventory_items')
        .upsert(chunk, { onConflict: 'id' });
        
      if (upsertErr) {
        console.error('[syncApiCatalogToSupabase] Error en chunk', i, upsertErr);
        throw new Error(upsertErr.message);
      }
    }
  };

  // 4. Batch upsert into Supabase
  if (inserts.length > 0) await chunkAndUpsert(inserts);
  if (updates.length > 0) await chunkAndUpsert(updates);

  return inserts.length + updates.length;
}
