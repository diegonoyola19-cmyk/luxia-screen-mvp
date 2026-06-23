import type { MapVertiluxResult } from './mapVertiluxApiInventoryItem';

export type InventoryItemRecord = {
  id: string;
  code: string;
  status: string;
  payload: any;
  movements_count?: number;
};

export type SyncPlanResult =
  | { action: 'insert'; item: MapVertiluxResult & { success: true } }
  | { action: 'update'; id: string; item: MapVertiluxResult & { success: true } }
  | { action: 'reconcile'; id: string; item: MapVertiluxResult & { success: true } }
  | { action: 'skip'; reason: string; mappedResult: MapVertiluxResult };

export function planSyncForItem(
  mappedResult: MapVertiluxResult,
  existingItem?: InventoryItemRecord
): SyncPlanResult {
  if (!mappedResult.success) {
    return { action: 'skip', reason: mappedResult.reason, mappedResult };
  }

  if (!existingItem) {
    return { action: 'insert', item: mappedResult as any };
  }

  const hasMovements = (existingItem.movements_count ?? 0) > 0;

  if (hasMovements) {
    return { action: 'reconcile', id: existingItem.id, item: mappedResult as any };
  }

  return { action: 'update', id: existingItem.id, item: mappedResult as any };
}

export function buildUpsertPayload(plan: SyncPlanResult, existingItem?: InventoryItemRecord) {
  const basePayload = {
    category: plan.item?.item?.category,
    kind: plan.item?.item?.kind,
    status: plan.item?.item?.status,
    code: plan.item?.item?.code,
    source: 'vertilux_api',
  };

  if (plan.action === 'insert') {
    return {
      ...basePayload,
      payload: plan.item.item.payload,
    };
  }

  if (plan.action === 'update') {
    return {
      ...basePayload,
      id: plan.id,
      payload: plan.item.item.payload,
    };
  }

  if (plan.action === 'reconcile' && existingItem) {
    const newPayload = { ...existingItem.payload };
    newPayload.apiQtyOnHand = plan.item.item.payload.apiQtyOnHand;
    newPayload.apiQtySalesOrder = plan.item.item.payload.apiQtySalesOrder;
    newPayload.apiQtyOnOrder = plan.item.item.payload.apiQtyOnOrder;
    newPayload.apiQtyOffset = plan.item.item.payload.apiQtyOffset;
    newPayload.apiAvailableRaw = plan.item.item.payload.apiAvailableRaw;
    
    if ('apiAvailableYd2' in plan.item.item.payload) {
      newPayload.apiAvailableYd2 = plan.item.item.payload.apiAvailableYd2;
    }
    
    newPayload.lastApiSyncAt = plan.item.item.payload.lastApiSyncAt;
    newPayload.syncNeedsReconciliation = true;
    newPayload.reconciliationReason = 'LOCAL_MOVEMENTS_EXIST';

    return {
      ...basePayload,
      id: plan.id,
      payload: newPayload,
    };
  }

  return null;
}
