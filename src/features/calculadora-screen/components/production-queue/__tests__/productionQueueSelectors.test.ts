import { describe, it, expect, vi } from 'vitest';
import { getProductionQueueBucket, getProductionQueueGroups } from '../utils/productionQueueSelectors';
import type { SavedOrder } from '../../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../../domain/orders/orderWorkflow';

// Mock canTransitionOrderStatus to control the workflow rules in the test
vi.mock('../../../../../domain/orders/orderWorkflow', () => ({
  canTransitionOrderStatus: vi.fn((order: SavedOrder, nextStatus: string, context: OrderWorkflowContext) => {
    if (context.hasInventoryError && nextStatus === 'in_production') {
      return { allowed: false, reason: 'Error de inventario' };
    }
    if (context.isReadOnly && nextStatus === 'in_production') {
      return { allowed: false, reason: 'Solo lectura' };
    }
    if (order.status !== 'ready_for_production' && order.status !== 'materials_checked') {
      return { allowed: false, reason: 'Estado no permite pasar a produccion' };
    }
    return { allowed: true };
  }),
}));

function createMockOrder(id: string, status: string, createdAt: string = new Date().toISOString()): SavedOrder {
  return {
    id,
    orderNumber: `ORD-${id}`,
    status,
    createdAt,
    items: [],
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

    it('returns ready for ready_for_production orders when transition is allowed', () => {
      const order = createMockOrder('1', 'ready_for_production');
      expect(getProductionQueueBucket(order, { isReadOnly: false }, {})).toBe('ready');
    });

    it('returns blocked for ready_for_production orders when inventory error exists', () => {
      const order = createMockOrder('1', 'ready_for_production');
      expect(getProductionQueueBucket(order, { isReadOnly: false, hasInventoryError: true }, {})).toBe('blocked');
    });
  });

  describe('getProductionQueueGroups', () => {
    it('groups orders correctly and sorts by date descending', () => {
      const orders = [
        createMockOrder('1', 'draft', '2026-06-25T10:00:00Z'),
        createMockOrder('2', 'completed', '2026-06-25T11:00:00Z'),
        createMockOrder('3', 'in_production', '2026-06-25T12:00:00Z'),
        createMockOrder('4', 'ready_for_production', '2026-06-25T13:00:00Z'),
        createMockOrder('5', 'ready_for_production', '2026-06-25T14:00:00Z'), // newer
      ];

      const context = { isReadOnly: false };
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
  });
});
