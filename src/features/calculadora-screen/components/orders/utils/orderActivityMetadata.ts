import { logAppActivity } from '../../../../../lib/logAppActivity';
import type { SavedOrder } from '../../../../../domain/curtains/types';
import { getClientReference } from './orderDisplay';

export type ProductionSource = 'production_queue' | 'order_actions_menu' | 'order_detail_modal';

/**
 * Logs the action of sending an order to production.
 * This is non-blocking and fire-and-forget.
 */
export function logOrderSentToProduction(order: SavedOrder, source: ProductionSource) {
  logAppActivity({
    event_type: 'order.sent_to_production',
    entity_type: 'order',
    entity_id: order.id,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientReference: getClientReference(order),
      previousStatus: order.status,
      nextStatus: 'in_production',
      source
    }
  });
}
