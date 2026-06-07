import { describe, it, expect } from 'vitest';
import { selectGlobalFabricsForBodega, selectGlobalLinearsForBodega } from '../inventoryGlobalSelectors';
import type { InventoryItem } from '../../domain/inventory/types';

describe('inventoryGlobalSelectors', () => {
  it('selectGlobalFabricsForBodega filters and maps fabric scraps correctly', () => {
    const items: InventoryItem[] = [
      {
        id: '1',
        material_kind: 'fabric',
        type: 'scrap',
        status: 'available',
        sku: '123',
        location: 'A1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: { family: 'Screen', color: 'White', width_meters: 2.5, length_meters: 1.5 }
      },
      {
        id: '2',
        material_kind: 'fabric',
        type: 'roll', // Should be ignored
        status: 'available',
        sku: '124',
        location: 'A1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: {}
      }
    ];

    const result = selectGlobalFabricsForBodega(items);
    expect(result.length).toBe(1);
    expect(result[0].family).toBe('Screen');
    expect(result[0].widthMeters).toBe(2.5);
  });

  it('selectGlobalLinearsForBodega filters and maps tubes and bottoms correctly', () => {
    const items: InventoryItem[] = [
      {
        id: '1',
        material_kind: 'tube',
        type: 'scrap',
        status: 'available',
        sku: 'TUBE-1',
        location: 'A1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: { length_meters: 2.0 }
      },
      {
        id: '2',
        material_kind: 'bottomrail',
        type: 'scrap',
        status: 'available',
        sku: 'BOT-1',
        location: 'A1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: { length_meters: 1.5 }
      }
    ];

    const result = selectGlobalLinearsForBodega(items);
    expect(result.length).toBe(2);
    expect(result[0].itemType).toBe('Tubo');
    expect(result[1].itemType).toBe('Bottomrail');
  });
});
