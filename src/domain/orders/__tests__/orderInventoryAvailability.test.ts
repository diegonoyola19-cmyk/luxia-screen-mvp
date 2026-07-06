import { describe, it, expect } from 'vitest';
import { validateOrderInventoryAvailability, type InventoryValidationContext } from '../orderInventoryAvailability';
import type { SavedOrder } from '../../curtains/types';
import type { InventoryItem } from '../../inventory/types';

function createDummyOrder(materialLines?: any[], finalMaterialLines?: any[]): SavedOrder {
  return {
    id: 'test-order-1',
    orderNumber: 'ORD-001',
    createdAt: new Date().toISOString(),
    status: 'draft',
    items: [
      {
        id: 'item-1',
        title: 'Cortina 1',
        materialLines: materialLines || undefined,
      }
    ],
    productionReview: finalMaterialLines ? {
      status: 'completed',
      finalMaterialLines,
    } : undefined,
  } as any;
}

function createDummyInventory(code: string, qty: number, unit: string = 'EA'): InventoryItem {
  return {
    id: `inv-${code}`,
    code,
    status: 'available',
    payload: {
      available_quantity: qty,
      unit,
    }
  } as any;
}

describe('orderInventoryAvailability', () => {
  it('devuelve sync_error y canProceed false si hay error de sync', () => {
    const order = createDummyOrder();
    const context: InventoryValidationContext = { isSyncError: true };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('sync_error');
    expect(result.canProceed).toBe(false);
    expect(result.reasons[0]).toContain('Error de sincronización');
  });

  it('devuelve missing_material_lines si la orden no tiene lineas de material', () => {
    const order = createDummyOrder([]);
    const context: InventoryValidationContext = { inventoryItems: [] };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('missing_material_lines');
    expect(result.canProceed).toBe(false);
    expect(result.reasons[0]).toContain('No hay líneas');
  });

  it('devuelve available y canProceed true si hay stock suficiente', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 10, 'EA')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
    expect(result.insufficientItems).toHaveLength(0);
    expect(result.missingItems).toHaveLength(0);
  });

  it('devuelve missing_sku si el SKU no existe en bodega', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const context: InventoryValidationContext = { inventoryItems: [] };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('missing_sku');
    expect(result.canProceed).toBe(false);
    expect(result.missingItems).toHaveLength(1);
    expect(result.missingItems[0].sku).toBe('COMP-1');
  });

  it('devuelve insufficient_stock si el stock es menor al requerido', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 3, 'EA')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);
    expect(result.insufficientItems).toHaveLength(1);
    expect(result.insufficientItems[0].available).toBe(3);
    expect(result.insufficientItems[0].required).toBe(5);
  });

  it('agrupa materiales del mismo SKU antes de validar', () => {
    const order = createDummyOrder([
      { itemCode: 'COMP-1', quantity: 3, unit: 'EA' },
      { itemCode: 'COMP-1', quantity: 4, unit: 'EA' }
    ]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 6, 'EA')] // Faltará 1 (3+4=7)
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('insufficient_stock');
    expect(result.insufficientItems[0].required).toBe(7);
  });

  it('devuelve incompatible_unit si las unidades no son compatibles', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'M' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 10, 'EA')] // M vs EA
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('incompatible_unit');
    expect(result.canProceed).toBe(false);
  });

  it('convierte correctamente FT a M y valida stock suficiente', () => {
    // Requerimos 1 Metro. Bodega tiene 4 Pies (1.21 Metros). Debe alcanzar.
    const order = createDummyOrder([{ itemCode: 'TUBO-1', quantity: 1, unit: 'M' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('TUBO-1', 4, 'FT')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });

  it('usa finalMaterialLines de la revision si existen', () => {
    // materialLines original pide COMP-1, pero finalMaterialLines pide COMP-2
    const order = createDummyOrder(
      [{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }], // Item
      [{ sku: 'COMP-2', quantity: 5, unit: 'EA', description: 'Comp 2' }] // Review
    );
    
    // Si tenemos COMP-1 en bodega pero no COMP-2, fallara porque usa finalMaterialLines
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 10, 'EA')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('missing_sku');
    expect(result.missingItems[0].sku).toBe('COMP-2');
  });

  it('normaliza SKUs con espacios adicionales y capitalizacion', () => {
    const order = createDummyOrder([{ itemCode: ' cOmP-1 ', quantity: 5, unit: 'EA' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory('COMP-1', 10, 'EA')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });

  it('normaliza SKUs de bodega con espacios adicionales y capitalizacion', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const context: InventoryValidationContext = {
      inventoryItems: [createDummyInventory(' cOmP-1 ', 10, 'EA')]
    };
    const result = validateOrderInventoryAvailability(order, context);

    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });

  it('es una funcion pura y no muta los objetos', () => {
    const order = createDummyOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const originalOrder = JSON.parse(JSON.stringify(order));
    const inv = [createDummyInventory('COMP-1', 10, 'EA')];
    const originalInv = JSON.parse(JSON.stringify(inv));

    validateOrderInventoryAvailability(order, { inventoryItems: inv });

    expect(order).toEqual(originalOrder);
    expect(inv).toEqual(originalInv);
  });
});
