import { describe, it, expect } from 'vitest';
import { generateFinalMaterialLines, ProductionMaterialAdjustment, generateFinalFabricLines, ProductionFabricAdjustment } from '../materialReview';

describe('generateFinalMaterialLines', () => {
  it('includes confirmed lines exactly as calculated', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'confirmed',
        calculatedSku: 'SKU1',
        calculatedDescription: 'Tubo',
        calculatedQuantity: 10,
        calculatedUnit: 'm'
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sku: 'SKU1',
      description: 'Tubo',
      quantity: 10,
      unit: 'm'
    });
  });

  it('substitutes SKU and Description when action is substituted', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'substituted',
        calculatedSku: 'SKU1',
        actualSku: 'SKU_NEW',
        actualDescription: 'Tubo Nuevo',
        actualQuantity: 10,
        actualUnit: 'm'
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sku: 'SKU_NEW',
      description: 'Tubo Nuevo',
      quantity: 10,
      unit: 'm'
    });
  });

  it('updates quantity when action is quantity_adjusted', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'quantity_adjusted',
        calculatedSku: 'SKU1',
        actualSku: 'SKU1',
        actualDescription: 'Tubo',
        actualQuantity: 15, // changed
        actualUnit: 'm'
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result[0].quantity).toBe(15);
  });

  it('adds new lines when action is added', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'added',
        actualSku: 'SKU_EXTRA',
        actualDescription: 'Componente Extra',
        actualQuantity: 5,
        actualUnit: 'EA'
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('SKU_EXTRA');
  });

  it('removes lines when action is removed', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'removed',
        calculatedSku: 'SKU1'
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result).toHaveLength(0);
  });

  it('groups lines by SKU and unit correctly', () => {
    const adjustments: ProductionMaterialAdjustment[] = [
      {
        id: '1',
        action: 'confirmed',
        calculatedSku: 'SKU1',
        calculatedDescription: 'A',
        calculatedQuantity: 10,
        calculatedUnit: 'm'
      },
      {
        id: '2',
        action: 'quantity_adjusted',
        actualSku: 'SKU1', // Same SKU and Unit
        actualDescription: 'A',
        actualQuantity: 5,
        actualUnit: 'm'
      },
      {
        id: '3',
        action: 'confirmed',
        calculatedSku: 'SKU1',
        calculatedDescription: 'A',
        calculatedQuantity: 2,
        calculatedUnit: 'EA' // Different Unit
      }
    ];

    const result = generateFinalMaterialLines(adjustments);
    expect(result).toHaveLength(2); // Should group the first two, leave third separate
    
    const metricItem = result.find(r => r.unit === 'm');
    const eaItem = result.find(r => r.unit === 'EA');

    expect(metricItem?.quantity).toBe(15);
    expect(eaItem?.quantity).toBe(2);
  });
});




describe('generateFinalFabricLines', () => {
  it('converts calculated width/height to Y2 for confirmed action', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'confirmed',
        calculatedFabricSku: 'FAB1',
        calculatedAreaY2: 3.58797,
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('FAB1');
    expect(result[0].unit).toBe('Y2');
    
    // 2 * 1.5 = 3 m2 -> 3 * 1.19599 = 3.58797 -> 3.588
    expect(result[0].quantity).toBe(3.588);
  });

  it('uses actualAreaY2 if provided', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'consumption_adjusted',
        actualFabricSku: 'FAB1',
        actualAreaY2: 5.5,
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5.5);
  });

  it('ignores removed items', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'removed',
        calculatedFabricSku: 'FAB1'
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(0);
  });
});
