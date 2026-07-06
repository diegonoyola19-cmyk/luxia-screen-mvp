import type { SavedOrder } from '../../../../../domain/curtains/types';
import type { OrderReportRow } from './orderReport';
import { getOrderStatus, getOrderStatusLabel } from './orderDisplay';
import type { SavedOrderStatus } from '../../../../../domain/orders/orderStatus';

export type OrderSortMode = 'recent' | 'waste' | 'cost' | 'curtains';
export type OrderStatusFilter = 'all' | SavedOrderStatus;
export type DateRange = 'all' | 'today' | 'week' | 'month';

export function matchesOrderSearch(row: OrderReportRow, query: string, dateRange: DateRange, statusFilter: OrderStatusFilter): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const orderDate = new Date(row.order.createdAt);
  if (dateRange === 'today' && orderDate < today) return false;
  if (dateRange === 'week' && orderDate < startOfWeek) return false;
  if (dateRange === 'month' && orderDate < startOfMonth) return false;

  const orderStatus = getOrderStatus(row.order);
  if (statusFilter !== 'all' && orderStatus !== statusFilter) return false;

  if (!query) {
    return true;
  }

  const searchable = [
    row.order.orderNumber || '',
    row.order.id,
    getOrderStatusLabel(row.order),
    row.order.items.length.toString(),
    row.order.items
      .map((item: any) =>
        item.result?.selectedFabric
          ? `${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
          : '',
      )
      .join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return searchable.includes(query);
}

export function sortOrders(rows: OrderReportRow[], sortMode: OrderSortMode): OrderReportRow[] {
  return [...rows].sort((left, right) => {
    switch (sortMode) {
      case 'waste':
        return right.wastePercentage - left.wastePercentage;
      case 'cost':
        return right.summary.totalOrderCost - left.summary.totalOrderCost;
      case 'curtains':
        return right.summary.curtains - left.summary.curtains;
      default: {
        const lDate = new Date(left.order.createdAt || 0).getTime();
        const rDate = new Date(right.order.createdAt || 0).getTime();
        return (isNaN(rDate) ? 0 : rDate) - (isNaN(lDate) ? 0 : lDate);
      }
    }
  });
}
