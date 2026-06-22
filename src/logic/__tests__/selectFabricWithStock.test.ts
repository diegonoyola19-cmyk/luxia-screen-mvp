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
    expect(result.warnings[0].message).toBe('No hay stock en ancho 2.5m. Se usará ancho 3m porque cubre el requerimiento.');
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

  it('12. Encuentra stock cuando catálogo 1.83 equivale a API 1.8288', () => {
    const pinpointeFabric: FabricSelectionSnapshot = {
      family: 'Pinpointe',
      openness: 'Blackout',
      color: 'e Blackout FR White/Snow Flakes',
      itemCode: '00026790072',
      description: 'Rollux NEW Pinpointe Blackout FR White/Snow Flakes 72"',
      imageUrl: null,
      widthMeters: 1.83,
      costPerYd2: 3.104
    };

    const result = selectFabricWithStock({
      preferredFabric: pinpointeFabric,
      candidateFabrics: [pinpointeFabric],
      inventoryItems: [
        createInventoryItem('pinpointe-72-api', 1.8288, 516.09, 'available', 'roll', 'Pinpointe', 'Blackout', 'e Blackout FR White/Snow Flakes')
      ],
      cutLengthMeters: 1.4
    });

    expect(result.reason).toBe('preferred_width_available');
    expect(result.selectedInventoryItemId).toBe('pinpointe-72-api');
    expect(result.selectedWidthMeters).toBe(1.83);
  });

  it('13. Encuentra stock cuando catálogo 2.5 equivale a API 2.500122', () => {
    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: [
        createInventoryItem('roll-250-api', 2.500122, req250 + 1)
      ],
      cutLengthMeters
    });

    expect(result.reason).toBe('preferred_width_available');
    expect(result.selectedInventoryItemId).toBe('roll-250-api');
  });

  it('14. Encuentra stock sustituto cuando catálogo 3 equivale a API 2.999994', () => {
    const result = selectFabricWithStock({
      preferredFabric,
      candidateFabrics,
      inventoryItems: [
        createInventoryItem('roll-250-low', 2.500122, req250 - 1),
        createInventoryItem('roll-300-api', 2.999994, req300 + 1)
      ],
      cutLengthMeters
    });

    expect(result.reason).toBe('substituted_to_larger_width');
    expect(result.selectedInventoryItemId).toBe('roll-300-api');
    expect(result.selectedWidthMeters).toBe(3);
  });

  it('15. No considera 1.83 equivalente a 2.5', () => {
    const narrowFabric: FabricSelectionSnapshot = {
      ...preferredFabric,
      itemCode: 'SCR-183',
      widthMeters: 1.83
    };

    const result = selectFabricWithStock({
      preferredFabric: narrowFabric,
      candidateFabrics: [narrowFabric],
      inventoryItems: [
        createInventoryItem('roll-250-api', 2.500122, 100)
      ],
      cutLengthMeters
    });

    expect(result.reason).toBe('no_stock_available');
    expect(result.selectedInventoryItemId).toBeUndefined();
  });

  it('16. Caso Pinpointe Blackout White/Snow Flakes pasa con ancho API convertido', () => {
    const pinpointe183: FabricSelectionSnapshot = {
      family: 'Pinpointe',
      openness: 'Blackout',
      color: 'e Blackout FR White/Snow Flakes',
      itemCode: '00026790072',
      description: 'Rollux NEW Pinpointe Blackout FR White/Snow Flakes 72"',
      imageUrl: null,
      widthMeters: 1.83,
      costPerYd2: 3.104
    };
    const pinpointe250: FabricSelectionSnapshot = {
      ...pinpointe183,
      itemCode: '00026790098',
      widthMeters: 2.5,
      description: 'Rollux NEW Pinpointe Blackout FR White/Snow Flakes 98.43"'
    };

    const result = selectFabricWithStock({
      preferredFabric: pinpointe183,
      candidateFabrics: [pinpointe183, pinpointe250],
      inventoryItems: [
        createInventoryItem('pinpointe-72-api', 1.8288, 516.09, 'available', 'roll', 'Pinpointe', 'Blackout', 'e Blackout FR White/Snow Flakes'),
        createInventoryItem('pinpointe-98-api', 2.500122, 968.62, 'available', 'roll', 'Pinpointe', 'Blackout', 'e Blackout FR White/Snow Flakes')
      ],
      cutLengthMeters: 1.4
    });

    expect(result.reason).toBe('preferred_width_available');
    expect(result.selectedInventoryItemId).toBe('pinpointe-72-api');
  });

  it('17. Caso Screen 5% Brown/Chocolate pasa con ancho API convertido', () => {
    const brown250: FabricSelectionSnapshot = {
      family: 'Screen',
      openness: '5%',
      color: 'Brown/Chocolate',
      itemCode: '00046202598',
      description: 'VX Screen 3000-5 Brown/ Chocolate 98.43"',
      imageUrl: null,
      widthMeters: 2.5,
      costPerYd2: 2.5906
    };
    const brown300: FabricSelectionSnapshot = {
      ...brown250,
      itemCode: '00046202518',
      widthMeters: 3,
      description: 'VX Screen 3000-5 Brown/ Chocolate 118.11"'
    };

    const result = selectFabricWithStock({
      preferredFabric: brown250,
      candidateFabrics: [brown250, brown300],
      inventoryItems: [
        createInventoryItem('brown-250-api', 2.500122, 775.71, 'available', 'roll', 'Screen', '5%', 'Brown/Chocolate'),
        createInventoryItem('brown-300-api', 2.999994, 776.71, 'available', 'roll', 'Screen', '5%', 'Brown/Chocolate')
      ],
      cutLengthMeters: 1.3
    });

    expect(result.reason).toBe('preferred_width_available');
    expect(result.selectedInventoryItemId).toBe('brown-250-api');
  });
});
