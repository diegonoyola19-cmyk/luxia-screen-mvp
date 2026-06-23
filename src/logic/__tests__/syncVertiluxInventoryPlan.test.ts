import { describe, it, expect } from 'vitest';
import { planSyncForItem, buildUpsertPayload, InventoryItemRecord } from '../syncVertiluxInventoryPlan';
import { MapVertiluxResult } from '../mapVertiluxApiInventoryItem';

describe('syncVertiluxInventoryPlan', () => {
  const mockMappedSuccess: MapVertiluxResult = {
    success: true,
    item: {
      category: 'fabric',
      kind: 'roll',
      status: 'available',
      code: 'TEST-123',
      payload: {
        source: 'vertilux_api',
        sourceItemNo: 'TEST-123',
        description: 'Test Fabric',
        apiUnit: 'YD',
        apiQtyOnHand: 100,
        apiQtySalesOrder: 10,
        apiQtyOnOrder: 0,
        apiQtyOffset: null,
        apiAvailableRaw: 90,
        apiAvailableYd2: 120,
        available_yd2: 120,
        width_meters: 2.5,
        length_meters: 40,
        family: 'Screen',
        openness: '5%',
        color: 'White',
        isVirtualRoll: true,
        lastApiSyncAt: '2026-06-11T12:00:00Z'
      }
    }
  };

  const mockMappedFail: MapVertiluxResult = {
    success: false,
    status: 'skipped',
    reason: 'UNIT_AMBIGUOUS',
    code: 'TEST-EA',
    description: 'Test EA'
  };

  it('1. item nuevo -> plan insert', () => {
    const plan = planSyncForItem(mockMappedSuccess, undefined);
    expect(plan.action).toBe('insert');
    
    const upsertPayload = buildUpsertPayload(plan);
    expect(upsertPayload).not.toBeNull();
    expect(upsertPayload!.code).toBe('TEST-123');
    expect(upsertPayload!.payload.available_yd2).toBe(120);
  });

  it('2. item existente sin movimientos -> plan update available_yd2', () => {
    const existing: InventoryItemRecord = {
      id: 'uuid-1',
      code: 'TEST-123',
      status: 'available',
      payload: { available_yd2: 50 },
      movements_count: 0
    };
    const plan = planSyncForItem(mockMappedSuccess, existing);
    expect(plan.action).toBe('update');
    
    const upsertPayload = buildUpsertPayload(plan, existing);
    expect((upsertPayload as any)!.id).toBe('uuid-1');
    expect(upsertPayload!.payload.available_yd2).toBe(120); // API overwrites
  });

  it('3. item existente con movimientos -> plan reconciliation, no overwrite available_yd2', () => {
    const existing: InventoryItemRecord = {
      id: 'uuid-2',
      code: 'TEST-123',
      status: 'available',
      payload: { available_yd2: 50, local_custom_field: 'keep' },
      movements_count: 2
    };
    const plan = planSyncForItem(mockMappedSuccess, existing);
    expect(plan.action).toBe('reconcile');
    
    const upsertPayload = buildUpsertPayload(plan, existing);
    expect((upsertPayload as any)!.id).toBe('uuid-2');
    // Important: available_yd2 is NOT overwritten
    expect(upsertPayload!.payload.available_yd2).toBe(50);
    expect(upsertPayload!.payload.local_custom_field).toBe('keep');
    // But API metadata is updated
    expect(upsertPayload!.payload.apiAvailableYd2).toBe(120);
    expect(upsertPayload!.payload.syncNeedsReconciliation).toBe(true);
    expect(upsertPayload!.payload.reconciliationReason).toBe('LOCAL_MOVEMENTS_EXIST');
  });

  it('4. skipped UNIT_AMBIGUOUS aparece en summary / skip plan', () => {
    const plan = planSyncForItem(mockMappedFail);
    expect(plan.action).toBe('skip');
    if (plan.action === 'skip') {
      expect(plan.reason).toBe('UNIT_AMBIGUOUS');
    }
    const upsertPayload = buildUpsertPayload(plan);
    expect(upsertPayload).toBeNull();
  });
});
