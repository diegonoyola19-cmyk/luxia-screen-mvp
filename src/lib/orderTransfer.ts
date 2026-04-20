import type { SavedOrder } from '../domain/curtains/types';

interface OrdersExportPayload {
  exportedAt: string;
  version: 1;
  orders: SavedOrder[];
}

export function downloadSavedOrders(orders: SavedOrder[]) {
  const payload: OrdersExportPayload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    orders,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `luxia-ordenes-${dateTag}.json`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function importSavedOrdersFile(file: File): Promise<SavedOrder[]> {
  const rawValue = await file.text();
  const parsedValue = JSON.parse(rawValue) as
    | OrdersExportPayload
    | SavedOrder[];

  const orders = Array.isArray(parsedValue)
    ? parsedValue
    : Array.isArray(parsedValue.orders)
      ? parsedValue.orders
      : [];

  return orders
    .filter(isSavedOrderLike)
    .map((order) => ({
      ...order,
      customerName: typeof order.customerName === 'string' ? order.customerName : '',
      items: Array.isArray(order.items) ? order.items : [],
    }));
}

function isSavedOrderLike(value: unknown): value is SavedOrder {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SavedOrder>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.orderNumber === 'string' &&
    typeof candidate.createdAt === 'string' &&
    Array.isArray(candidate.items)
  );
}
