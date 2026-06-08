import { describe, it, expect } from 'vitest';
import { selectFabricWithStock } from '../selectFabricWithStock';
import { FabricSelectionSnapshot } from '../../lib/priceCatalog';
import { InventoryItem } from '../../domain/inventory/types';

describe('selectFabricWithStock', () => {
  const preferredFabric: FabricSelectionSnapshot = {
    family: 'Screen',
    openness: '5%',
    color: 'White',
    itemCode: 'SCR-5-WHT-250',
    description: 'Screen 5% White 2.50m',
    imageUrl: null,
    widthMeters: 2.5,
    costPerYd2: 10
  };

  const largerFabric: FabricSelectionSnapshot = {
    family: 'Screen',
    openness: '5%',
    color: 'White',
    itemCode: 'SCR-5-WHT-300',
    description: 'Screen 5% White 3.00m',
    imageUrl: null,
    widthMeters: 3.0,
    costPerYd2: 10
  };

  const otherFabric: FabricSelectionSnapshot = {
    family: 'Screen',
    openness: '1%', // Distinto openness
    color: 'White',
    itemCode: 'SCR-1-WHT-300',
    description: 'Screen 1% White 3.00m',
    imageUrl: null,
    widthMeters: 3.0,
    costPerYd2: 12
  };

  const candidateFabrics = [preferredFabric, largerFabric, otherFabric];

  const createInventoryItem = (
    id: string,
    widthMeters: number,
    availableYd2: number | undefined,
    status: 'available' | 'used' | 'discarded' = 'available',
    kind: 'roll' | 'scrap' = 'roll',
    family = 'Screen',
    openness = '5%',
    color = 'White',
    isDeleted = false
  ): InventoryItem => ({
    id,
    category: 'fabric',
    kind,
    code: `CODE-${id}`,
    status,
    deleted_at: isDeleted ? '2026-01-01' : null,
    created_from_order_id: null,
    source: 'test',
    payload: {
      family,
      openness,
      color,
      width_meters: widthMeters,
      available_yd2: availableYd2,
      length_meters: availableYd2 ? availableYd2 / (widthMeters * 1.1959900463) : undefined
    }
  });

  const cutLengthMeters = 2.0;
  // 2.50m roll require: 2.5 * 2.0 * 1.1959900463 = 5.9799502315
  // 3.00m roll require: 3.0 * 2.0 * 1.1959900463 = 7.1759402778
  const req250 = 2.5 * 2.0 * 1.1959900463;
  const req300 = 3.0 * 2.0 * 1.1959900463;

  it('1. Usa 2.50m si available_yd2 alcanza', () => {
    const inventory = [
      createInventoryItem('roll-250', 2.5, req250 + 1)
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.selectedWidthMeters).toBe(2.5);
    expect(result.wasSubstituted).toBe(false);
    expect(result.reason).toBe('preferred_width_available');
    expect(result.selectedInventoryItemId).toBe('roll-250');
    expect(result.warnings).toHaveLength(0);
    expect(result.requiredYd2).toBeCloseTo(req250, 4);
  });

  it('2. Usa 3.00m si 2.50m no alcanza y 3.00m sí', () => {
    const inventory = [
      createInventoryItem('roll-250', 2.5, req250 - 1), // Insuficiente
      createInventoryItem('roll-300', 3.0, req300 + 1)  // Suficiente
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.selectedWidthMeters).toBe(3.0);
    expect(result.wasSubstituted).toBe(true);
    expect(result.reason).toBe('substituted_to_larger_width');
    expect(result.substitutedWidthMeters).toBe(3.0);
    expect(result.selectedInventoryItemId).toBe('roll-300');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('FABRIC_SUBSTITUTED');
  });

  it('3. No usa 3.00m si pertenece a otra familia/color/openness', () => {
    const inventory = [
      createInventoryItem('roll-250', 2.5, req250 - 1), // Insuficiente
      createInventoryItem('roll-300-other', 3.0, req300 + 1, 'available', 'roll', 'Screen', '1%', 'White') // Diferente openness
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.wasSubstituted).toBe(false);
    expect(result.reason).toBe('no_stock_available');
    expect(result.warnings.some(w => w.code === 'INSUFFICIENT_STOCK')).toBe(true);
  });

  it('4. Ignora items used/discarded o deleted', () => {
    const inventory = [
      createInventoryItem('roll-250-used', 2.5, req250 + 1, 'used'),
      createInventoryItem('roll-250-deleted', 2.5, req250 + 1, 'available', 'roll', 'Screen', '5%', 'White', true)
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.reason).toBe('no_stock_available');
  });

  it('5. Ignora scraps', () => {
    const inventory = [
      createInventoryItem('scrap-250', 2.5, req250 + 1, 'available', 'scrap')
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.reason).toBe('no_stock_available');
  });

  it('6. Ignora items sin available_yd2 y genera warning', () => {
    const inventory = [
      createInventoryItem('roll-250-no-yd2', 2.5, undefined) // Sin available_yd2
    ];

    // Asumimos que length_meters es suficiente pero selectFabricWithStock lo debe ignorar
    inventory[0].payload.length_meters = 10;

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.reason).toBe('no_stock_available');
    expect(result.warnings.some(w => w.code === 'MISSING_AVAILABLE_YD2')).toBe(true);
  });

  it('7. No usa length_meters para decidir disponibilidad', () => {
    const inventory = [
      createInventoryItem('roll-250-fake', 2.5, req250 - 1) // available_yd2 insuficiente
    ];
    // Modificamos length_meters a un valor gigante (falso/corrupto)
    inventory[0].payload.length_meters = 1000;

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    // Debe fallar porque available_yd2 es quien manda
    expect(result.reason).toBe('no_stock_available');
  });

  it('8. Elige el ancho superior más cercano, no el más grande', () => {
    const mediumFabric: FabricSelectionSnapshot = { ...preferredFabric, itemCode: 'SCR-280', widthMeters: 2.8 };
    const candidates = [preferredFabric, mediumFabric, largerFabric];
    
    const req280 = 2.8 * cutLengthMeters * 1.1959900463;

    const inventory = [
      createInventoryItem('roll-250', 2.5, req250 - 1),
      createInventoryItem('roll-300', 3.0, req300 + 1), // Este alcanza pero está más lejos
      createInventoryItem('roll-280', 2.8, req280 + 1)  // Este es el más cercano
    ];

    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics: candidates,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(result.selectedWidthMeters).toBe(2.8);
    expect(result.selectedInventoryItemId).toBe('roll-280');
    expect(result.reason).toBe('substituted_to_larger_width');
  });

  it('9. Devuelve warning error si no hay stock', () => {
    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: [],
      cutLengthMeters
    });

    expect(result.reason).toBe('no_stock_available');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe('error');
    expect(result.warnings[0].code).toBe('INSUFFICIENT_STOCK');
  });

  it('10. Devuelve invalid_input si cutLengthMeters <= 0', () => {
    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: [createInventoryItem('roll-250', 2.5, 100)],
      cutLengthMeters: 0
    });

    expect(result.reason).toBe('invalid_input');
    expect(result.wasSubstituted).toBe(false);
    expect(result.warnings[0].code).toBe('INVALID_INPUT');
  });

  it('11. No muta candidateFabrics ni inventoryItems', () => {
    const candidatesCopy = [...candidateFabrics];
    const inventory = [createInventoryItem('roll-250', 2.5, req250 + 1)];
    const inventoryCopy = JSON.parse(JSON.stringify(inventory));

    selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: inventory,
      cutLengthMeters
    });

    expect(candidateFabrics).toEqual(candidatesCopy);
    expect(inventory).toEqual(inventoryCopy);
  });
});
