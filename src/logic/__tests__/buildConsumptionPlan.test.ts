import { describe, it, expect } from 'vitest';
import { buildConsumptionPlan } from '../buildConsumptionPlan';
import { SavedOrder } from '../../domain/curtains/types';

describe('buildConsumptionPlan', () => {
  it('Orden con tela normal genera consumo category=fabric', () => {
    const order = {
      id: 'o1',
      orderNumber: 'ORD-1',
      items: [
        {
          id: 'i1',
          result: {
            selectedFabric: { itemCode: 'FAB-001' },
            recommendedRollWidthMeters: 3.0,
            fabricDownloadedM2: 6.0,
            fabricDownloadedYd2: 7.17, // 6.0 * 1.19599
            wastePieceWidthMeters: 0,
            wastePieceHeightMeters: 0
          }
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toEqual(expect.objectContaining({
      action: 'consume',
      category: 'fabric',
      itemCode: 'FAB-001',
      requiredQuantity: 2.0 * 3.0 * 1.1959900463, // cutLength * width * 1.195...
      unit: 'yd2',
      widthMeters: 3.0,
      source: 'fabric_selection',
      payload: expect.objectContaining({
        rollWidthMeters: 3.0,
        cutLengthMeters: 2.0,
        consumedAreaM2: 6.0,
        consumedAreaYd2: 2.0 * 3.0 * 1.1959900463
      })
    }));
  });

  it('Genera error si falta recommendedRollWidthMeters', () => {
    const order = {
      id: 'o2',
      items: [
        {
          result: {
            selectedFabric: { itemCode: 'FAB-002' },
            recommendedRollWidthMeters: 0,
            fabricDownloadedM2: 5.0,
            wastePieceWidthMeters: 0,
            wastePieceHeightMeters: 0
          }
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].code).toBe('MISSING_ROLL_WIDTH');
    expect(plan.warnings[0].severity).toBe('error');
  });

  it('Genera error si cutLengthMeters es 0', () => {
    const order = {
      id: 'o2b',
      items: [
        {
          result: {
            selectedFabric: { itemCode: 'FAB-002b' },
            recommendedRollWidthMeters: 2.5,
            fabricDownloadedM2: 0,
            wastePieceWidthMeters: 0,
            wastePieceHeightMeters: 0
          }
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].code).toBe('ZERO_FABRIC_CONSUMPTION');
    expect(plan.warnings[0].severity).toBe('error');
  });

  it('Orden con reusedWastePiece genera action=use_scrap', () => {
    const order = {
      items: [
        {
          reusedWastePiece: {
            id: 'scrap-123',
            fabricItemCode: 'FAB-SCRAP',
            widthMeters: 1.5
          }
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.items[0]).toEqual(expect.objectContaining({
      action: 'use_scrap',
      category: 'fabric',
      specificInventoryItemId: 'scrap-123',
      itemCode: 'FAB-SCRAP',
      unit: 'pcs',
      widthMeters: 1.5
    }));
  });

  it('materialLines genera consumos de component/tube/bottom según códigos reales', () => {
    const order = {
      items: [
        {
          result: { selectedFabric: { itemCode: 'FAB-01' }, fabricDownloadedM2: 1, recommendedRollWidthMeters: 1, wastePieceWidthMeters: 0, wastePieceHeightMeters: 0 },
          materialLines: [
            { itemCode: 'TUB-01', category: 'tube', quantity: 1.5, unit: 'ft', description: 'Tubo' },
            { itemCode: 'BOT-01', category: 'bottom', quantity: 1.5, unit: 'ft', description: 'Bottom' },
            { itemCode: 'CHA-01', category: 'chain', quantity: 2, unit: 'pcs', description: 'Cadena' }
          ]
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    
    // 1 fabric + 3 materials = 4 items
    expect(plan.items).toHaveLength(4);
    
    const tube = plan.items.find(i => i.itemCode === 'TUB-01');
    expect(tube?.category).toBe('tube');
    expect(tube?.action).toBe('consume');
    
    const bottom = plan.items.find(i => i.itemCode === 'BOT-01');
    expect(bottom?.category).toBe('bottom');
    
    const component = plan.items.find(i => i.itemCode === 'CHA-01');
    expect(component?.category).toBe('component');
  });

  it('Si falta itemCode, agrega warning', () => {
    const order = {
      items: [
        {
          result: { selectedFabric: { itemCode: 'FAB-01' }, fabricDownloadedM2: 1, recommendedRollWidthMeters: 1, wastePieceWidthMeters: 0, wastePieceHeightMeters: 0 },
          materialLines: [
            { itemCode: '', category: 'component', quantity: 1, unit: 'pcs', description: 'Unknown' }
          ]
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].code).toBe('MISSING_ITEM_CODE');
  });

  it('Si falta cantidad, agrega warning', () => {
    const order = {
      items: [
        {
          result: { selectedFabric: { itemCode: 'FAB-01' }, fabricDownloadedM2: 1, recommendedRollWidthMeters: 1, wastePieceWidthMeters: 0, wastePieceHeightMeters: 0 },
          materialLines: [
            { itemCode: 'COMP-1', category: 'component', quantity: NaN, unit: 'pcs', description: 'Unknown' }
          ]
        }
      ]
    } as unknown as SavedOrder;

    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].code).toBe('INVALID_QUANTITY');
  });

  it('No muta el SavedOrder original', () => {
    const order = {
      id: 'o1',
      items: [
        {
          result: { selectedFabric: { itemCode: 'F1' }, fabricDownloadedM2: 1, recommendedRollWidthMeters: 1, wastePieceWidthMeters: 0, wastePieceHeightMeters: 0 }
        }
      ]
    } as unknown as SavedOrder;

    const orderCopy = JSON.parse(JSON.stringify(order));
    buildConsumptionPlan(order);
    expect(order).toEqual(orderCopy);
  });

  it('Maneja orden sin items sin romper', () => {
    const order = { items: [] } as unknown as SavedOrder;
    const plan = buildConsumptionPlan(order);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].code).toBe('EMPTY_ORDER');
    expect(plan.items).toHaveLength(0);
  });
});
