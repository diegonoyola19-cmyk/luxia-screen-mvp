import { describe, it, expect } from 'vitest';
import { validateOrderBeforeSage } from '../validateOrderBeforeSage';
import type { SavedOrder } from '../../curtains/types';

describe('validateOrderBeforeSage', () => {
  const getBaseOrder = (): SavedOrder => ({
    id: 'o1',
    orderNumber: '100',
    createdAt: new Date().toISOString(),
    status: 'materials_checked',
    items: [
      {
        id: 'i1',
        createdAt: new Date().toISOString(),
        title: 'C1',
        input: {
          curtainType: 'screen',
          fabricFamily: 'A',
          fabricOpenness: '1%',
          fabricColor: 'White',
          widthMeters: 1,
          heightMeters: 1
        },
        result: {} as any
      }
    ],
    productionReview: {
      reviewedAt: new Date().toISOString(),
      status: 'completed',
      adjustments: [],
      finalMaterialLines: [
        { sku: 'SKU1', description: 'T', quantity: 1, unit: 'EA' }
      ]
    }
  });

  it('allows valid orders', () => {
    const order = getBaseOrder();
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails if order is empty', () => {
    const order = getBaseOrder();
    order.items = [];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('EMPTY_ORDER');
  });

  it('fails if status is not materials_checked or review is not completed', () => {
    const order = getBaseOrder();
    order.status = 'in_production';
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('MATERIAL_REVIEW_REQUIRED');

    order.status = 'materials_checked';
    order.productionReview!.status = 'draft';
    const result2 = validateOrderBeforeSage(order);
    expect(result2.ok).toBe(false);
    expect(result2.errors[0].code).toBe('MATERIAL_REVIEW_REQUIRED');
  });

  it('fails if there are no final material lines', () => {
    const order = getBaseOrder();
    order.productionReview!.finalMaterialLines = [];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('MISSING_FINAL_MATERIAL_LINES');
  });

  it('fails if SKU is empty', () => {
    const order = getBaseOrder();
    order.productionReview!.finalMaterialLines[0].sku = '  ';
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('EMPTY_SKU');
  });

  it('fails if SKU contains placeholders', () => {
    const order = getBaseOrder();
    order.productionReview!.finalMaterialLines[0].sku = 'XXX';
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('UNRESOLVED_SKU_PLACEHOLDER');
  });

  it('fails if special fabrication is not authorized', () => {
    const order = getBaseOrder();
    order.items[0].input.specialFabrication = true;
    order.items[0].input.riskAcceptedByCustomer = false;
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('SPECIAL_FABRICATION_NOT_AUTHORIZED');
  });

  it('allows special fabrication if authorized (but gives warning)', () => {
    const order = getBaseOrder();
    order.items[0].input.specialFabrication = true;
    order.items[0].input.riskAcceptedByCustomer = true;
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(true);
    expect(result.warnings.map(w => w.code)).toContain('SPECIAL_FABRICATION');
  });

  // FABRIC TESTS
  it('allows valid orders with fabric lines', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: 'FAB1', description: 'T', quantity: 1, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(true);
  });

  it('fails if there are no final fabric lines but order requires fabric', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('MISSING_FINAL_FABRIC_LINES');
  });

  it('fails if fabric SKU is empty', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: '  ', description: 'T', quantity: 1, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('EMPTY_FABRIC_SKU');
  });

  it('fails if fabric quantity is <= 0', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: 'FAB1', description: 'T', quantity: 0, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('INVALID_FABRIC_QUANTITY');
  });
});
