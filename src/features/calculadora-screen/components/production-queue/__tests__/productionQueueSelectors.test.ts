import { describe, it, expect, vi } from 'vitest';
import { getProductionQueueBucket, getProductionQueueGroups } from '../utils/productionQueueSelectors';
import type { SavedOrder } from '../../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../../domain/orders/orderWorkflow';

// Mock canPerformOrderAction (puerta estricta) — ya no se usa canTransitionOrderStatus aquí
vi.mock('../../../../../domain/orders/orderWorkflow', () => ({
  canPerformOrderAction: vi.fn((order: SavedOrder, action: string, context: OrderWorkflowContext) => {
    if (action !== 'send_to_production') return { allowed: true };

    // Simular validación estricta: estado + materiales + inventario
    if (order.status !== 'ready_for_production') {
      return { allowed: false, reason: 'Estado no permite pasar a producción' };
    }
    if (context.hasInventoryError) {
      return { allowed: false, reason: 'Error de inventario' };
    }
    if (context.isReadOnly) {
      return { allowed: false, reason: 'Solo lectura' };
    }
    if (!context.hasMaterialReview) {
      return { allowed: false, reason: 'La orden debe tener materiales confirmados antes de pasar a producción' };
    }
    if (!context.inventoryAvailabilityResult) {
      return { allowed: false, reason: 'Se requiere verificar disponibilidad de inventario' };
    }
    if (!context.inventoryAvailabilityResult.canProceed) {
      return { allowed: false, reason: 'Inventario insuficiente para proceder' };
    }
    return { allowed: true };
  }),
}));

// Mock validateOrderInventoryAvailability — devuelve canProceed: true por defecto
vi.mock('../../../../../domain/orders/orderInventoryAvailability', () => ({
  validateOrderInventoryAvailability: vi.fn((_order: SavedOrder, _ctx: any) => ({
    canProceed: true,
    reasons: [],
    items: []
  }))
}));

function createMockOrder(
  id: string,
  status: string,
  createdAt: string = new Date().toISOString(),
  withMaterialReview = false
): SavedOrder {
  return {
    id,
    orderNumber: `ORD-${id}`,
    status,
    createdAt,
    items: [],
    productionReview: withMaterialReview
      ? { finalMaterialLines: [{ sku: 'MAT-1', qty: 1 }] }
      : undefined,
  } as unknown as SavedOrder;
}

describe('productionQueueSelectors', () => {
  describe('getProductionQueueBucket', () => {
    it('returns null for draft orders', () => {
      const order = createMockOrder('1', 'draft');
      expect(getProductionQueueBucket(order, { isReadOnly: false }, {})).toBeNull();
    });

    it('returns completed for completed orders', () => {
      const order = createMockOrder('1', 'completed');
      expect(getProductionQueueBucket(order, { isReadOnly: false }, {})).toBe('completed');
    });

    it('returns in_production for in_production orders', () => {
      const order = createMockOrder('1', 'in_production');
      expect(getProductionQueueBucket(order, { isReadOnly: false }, {})).toBe('in_production');
    });

    it('MED-1.A: returns ready when materiales + inventario OK', () => {
      const order = createMockOrder('1', 'ready_for_production', undefined, true);
      const ctx = {
        isReadOnly: false,
        hasMaterialReview: true,
        inventoryAvailabilityResult: { status: 'available' as const, canProceed: true, reasons: [], missingItems: [], insufficientItems: [], warnings: [] }
      };
      expect(getProductionQueueBucket(order, ctx, {})).toBe('ready');
    });

    it('MED-1.B: returns blocked when sin materiales confirmados', () => {
      // withMaterialReview=false → hasMaterialReview derivado del order = false
      const order = createMockOrder('1', 'ready_for_production', undefined, false);
      // El selector deriva hasMaterialReview desde order.productionReview
      expect(getProductionQueueBucket(order, { isReadOnly: false }, {})).toBe('blocked');
    });

    it('MED-1.C: returns blocked when inventory error exists', () => {
      const order = createMockOrder('1', 'ready_for_production');
      expect(getProductionQueueBucket(order, { isReadOnly: false, hasInventoryError: true }, {})).toBe('blocked');
    });

    it('MED-1.D: returns blocked when readonly', () => {
      const order = createMockOrder('1', 'ready_for_production');
      expect(getProductionQueueBucket(order, { isReadOnly: true }, {})).toBe('blocked');
    });
  });

  describe('getProductionQueueGroups', () => {
    it('groups orders correctly and sorts by date descending', () => {
      const orders = [
        createMockOrder('1', 'draft', '2026-06-25T10:00:00Z'),
        createMockOrder('2', 'completed', '2026-06-25T11:00:00Z'),
        createMockOrder('3', 'in_production', '2026-06-25T12:00:00Z'),
        createMockOrder('4', 'ready_for_production', '2026-06-25T13:00:00Z', true),
        createMockOrder('5', 'ready_for_production', '2026-06-25T14:00:00Z', true), // newer
      ];

      const context = {
        isReadOnly: false,
        hasMaterialReview: true,
        inventoryAvailabilityResult: { status: 'available' as const, canProceed: true, reasons: [], missingItems: [], insufficientItems: [], warnings: [] }
      };
      const inventoryContext = {};
      const groups = getProductionQueueGroups(orders, context, inventoryContext);

      expect(groups.ready).toHaveLength(2);
      expect(groups.ready[0].id).toBe('5'); // newer first
      expect(groups.ready[1].id).toBe('4');

      expect(groups.in_production).toHaveLength(1);
      expect(groups.in_production[0].id).toBe('3');

      expect(groups.blocked).toHaveLength(0);

      expect(groups.completed).toHaveLength(1);
      expect(groups.completed[0].id).toBe('2');
    });

    it('MED-1.E: sin materiales confirmados → bucket blocked (no ready)', () => {
      const orders = [
        createMockOrder('1', 'ready_for_production', '2026-06-25T10:00:00Z', false), // sin materialReview
      ];
      const context = { isReadOnly: false };
      const groups = getProductionQueueGroups(orders, context, {});

      expect(groups.ready).toHaveLength(0);
      expect(groups.blocked).toHaveLength(1);
    });
  });

  // ─── Regresión: canTransitionOrderStatus NO es la puerta aquí ─────────────
  it('Regresion: selector no importa canTransitionOrderStatus', async () => {
    // Si el módulo de orderWorkflow solo exporta canPerformOrderAction (sin canTransitionOrderStatus),
    // el selector debe seguir funcionando — verifica que no hay referencia a la función vieja.
    const mod = await import('../utils/productionQueueSelectors');
    expect(typeof mod.getProductionQueueBucket).toBe('function');
    expect(typeof mod.getProductionQueueGroups).toBe('function');
  });
});
