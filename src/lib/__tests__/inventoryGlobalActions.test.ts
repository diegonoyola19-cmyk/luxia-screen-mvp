import { describe, it, expect, vi } from 'vitest';
import { createGlobalScrapPayload, createGlobalDiscardPayload } from '../inventoryGlobalActions';
import type { InventoryItem } from '../../domain/inventory/types';

describe('inventoryGlobalActions', () => {
  it('createGlobalScrapPayload genera item fabric/scrap/status available', () => {
    const input = {
      code: 'RET-001',
      family: 'Roller',
      color: 'White',
      widthMeters: 2.0,
      lengthMeters: 1.5,
      notes: 'Test note',
      userId: 'user-1'
    };

    const { item, movement } = createGlobalScrapPayload(input);

    expect(item.material_kind).toBe('fabric');
    expect(item.type).toBe('scrap');
    expect(item.status).toBe('available');
    expect(item.code).toBe('RET-001');
    expect(item.payload?.width_meters).toBe(2.0);
    expect(item.payload?.source).toBe('manual');
    expect(item.payload?.created_by).toBe('user-1');
  });

  it('createGlobalScrapPayload genera movement create_scrap', () => {
    const input = {
      code: 'RET-001',
      widthMeters: 2.0,
      lengthMeters: 1.5,
      userId: 'user-1'
    };

    const { item, movement } = createGlobalScrapPayload(input);

    expect(movement.action).toBe('create_scrap');
    expect(movement.inventory_item_id).toBe(item.id);
    expect(movement.quantity).toBe(1.5);
    expect(movement.unit).toBe('m');
    expect(movement.created_by).toBe('user-1');
  });

  it('createGlobalDiscardPayload genera update status discarded', () => {
    const item: InventoryItem = {
      id: 'item-1',
      code: 'RET-001',
      sku: 'sku',
      material_kind: 'fabric',
      type: 'scrap',
      status: 'available',
      location: 'bodega',
      created_at: '2023',
      updated_at: '2023',
      payload: { length_meters: 1.5 }
    };

    const { updatedStatus } = createGlobalDiscardPayload(item, 'user-1', 'Razón baja');

    expect(updatedStatus).toBe('discarded');
  });

  it('createGlobalDiscardPayload genera movement discard con snapshot', () => {
    const item: InventoryItem = {
      id: 'item-1',
      code: 'RET-001',
      sku: 'sku',
      material_kind: 'fabric',
      type: 'scrap',
      status: 'available',
      location: 'bodega',
      created_at: '2023',
      updated_at: '2023',
      payload: { length_meters: 1.5 }
    };

    const { movement } = createGlobalDiscardPayload(item, 'user-1', 'Razón baja');

    expect(movement.action).toBe('discard');
    expect(movement.inventory_item_id).toBe('item-1');
    expect(movement.quantity).toBe(1.5);
    expect(movement.notes).toBe('Razón baja');
    expect(movement.payload?.item_snapshot).toEqual(item);
  });
});
