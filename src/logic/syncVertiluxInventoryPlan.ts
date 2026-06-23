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
  if (plan.action === 'skip') return null;
  const p = plan as Exclude<SyncPlanResult, {action: 'skip'}>;

  const basePayload = {
    category: p.item?.item?.category,
    kind: p.item?.item?.kind,
    status: p.item?.item?.status,
    code: p.item?.item?.code,
    source: 'vertilux_api',
  };

  if (plan.action === 'insert') {
    return {
      ...basePayload,
      payload: p.item.item.payload,
    };
  }

  if (plan.action === 'update') {
    return {
      ...basePayload,
      id: (p as any).id,
      payload: p.item.item.payload,
    };
  }

  if (plan.action === 'reconcile' && existingItem) {
    const existingPayload = existingItem.payload || {};
    const newApiPayload = p.item.item.payload;

    return {
      ...basePayload,
      id: (p as any).id,
      payload: {
        ...existingPayload, // Keep local fields (e.g., local movements available_yd2)
        ...newApiPayload,   // Overlay new API data (e.g., apiAvailableYd2)
        available_yd2: existingPayload.available_yd2, // Force keep local available_yd2
        syncNeedsReconciliation: true,
        reconciliationReason: 'LOCAL_MOVEMENTS_EXIST'
      },
    };
  }

  return null;
}
