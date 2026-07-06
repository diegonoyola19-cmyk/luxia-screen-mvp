import type { SavedOrder } from '../../../../../domain/curtains/types';
import { canTransitionOrderStatus, type OrderWorkflowContext } from '../../../../../domain/orders/orderWorkflow';
import { normalizeOrderStatus } from '../../../../../domain/orders/orderStatus';
import { validateOrderInventoryAvailability, type InventoryValidationContext } from '../../../../../domain/orders/orderInventoryAvailability';

export type ProductionQueueBucket = 'ready' | 'in_production' | 'blocked' | 'completed';

export function getProductionQueueBucket(order: SavedOrder, context: OrderWorkflowContext, inventoryContext: InventoryValidationContext): ProductionQueueBucket | null {
  const status = normalizeOrderStatus(order.status);
  
  if (status === 'draft') return null;

  if (status === 'completed') return 'completed';
  if (status === 'in_production') return 'in_production';

  const inventoryResult = validateOrderInventoryAvailability(order, inventoryContext);
  const localContext = { ...context, inventoryAvailabilityResult: inventoryResult };

  // For orders not yet in production
  const transition = canTransitionOrderStatus(order, 'in_production', localContext);
  
  if (transition.allowed) {
    return 'ready';
  } else {
    return 'blocked';
  }
}

export function getProductionQueueGroups(orders: SavedOrder[], context: OrderWorkflowContext, inventoryContext: InventoryValidationContext): Record<ProductionQueueBucket, SavedOrder[]> {
  const groups: Record<ProductionQueueBucket, SavedOrder[]> = {
    ready: [],
    in_production: [],
    blocked: [],
    completed: []
  };

  for (const order of orders) {
    const bucket = getProductionQueueBucket(order, context, inventoryContext);
    if (bucket) {
      groups[bucket].push(order);
    }
  }

  // Optionally sort orders (e.g., by date descending)
  const sortByDateDesc = (a: SavedOrder, b: SavedOrder) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  groups.ready.sort(sortByDateDesc);
  groups.in_production.sort(sortByDateDesc);
  groups.blocked.sort(sortByDateDesc);
  groups.completed.sort(sortByDateDesc);

  // Limit completed orders to avoid saturating the view
  groups.completed = groups.completed.slice(0, 50);

  return groups;
}
