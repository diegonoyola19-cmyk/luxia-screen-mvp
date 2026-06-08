import { describe, it, expect } from 'vitest';
import { selectGlobalFabricsForBodega, selectGlobalLinearsForBodega } from '../inventoryGlobalSelectors';
import type { InventoryItem } from '../../domain/inventory/types';

describe('inventoryGlobalSelectors', () => {
  it('selectGlobalFabricsForBodega filters and maps fabric scraps correctly', () => {
    const items: InventoryItem[] = [
      {
        id: '1',
        category: 'fabric',
        kind: 'scrap',
        code: '123',
        status: 'available',
        created_from_order_id: null,
        source: 'migration',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: { family: 'Screen', color: 'White', width_meters: 2.5, length_meters: 1.5 }
      },
      {
        id: '2',
        category: 'fabric',
        kind: 'roll',   // Should be ignored (not 'scrap')
        code: '124',
        status: 'available',
        created_from_order_id: null,
        source: 'migration',
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
        category: 'tube',
        kind: 'bar',
        code: 'TUBE-1',
        status: 'available',
        created_from_order_id: null,
        source: 'migration',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        payload: { length_meters: 2.0 }
      },
      {
        id: '2',
        category: 'bottom',
        kind: 'bar',
        code: 'BOT-1',
        status: 'available',
        created_from_order_id: null,
        source: 'migration',
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
