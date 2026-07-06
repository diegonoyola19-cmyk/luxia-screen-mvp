import type { SavedOrder } from '../../../../../domain/curtains/types';
import { normalizeOrderStatus, SavedOrderStatus } from '../../../../../domain/orders/orderStatus';
import { formatDate } from '../../../../../lib/format';
import type { Tone } from '../../../../../logic/rollerEngineV3';

export function colorFromSKU(sku: string): string | null {
  if (sku.includes('AL-CLW')) return 'White';
  if (sku.includes('AL-CLI')) return 'Ivory';
  if (sku.includes('AL-CLA')) return 'Grey';
  if (sku.includes('AL-CLZ')) return 'Bronze';
  if (sku.includes('CH-WH') || sku.includes('CH-007')) return 'White';
  if (sku.includes('CH-IV') || sku.includes('CH-003')) return 'Ivory';
  if (sku.includes('CH-006')) return 'Grey';
  if (sku.includes('CH-012')) return 'Bronze';
  if (sku.includes('V20WH')) return 'White';
  if (sku.includes('V20IV')) return 'Ivory';
  if (sku.includes('V20GR')) return 'Grey';
  if (sku.includes('V20BR')) return 'Bronze';
  if (sku.includes('CA-001WH')) return 'White';
  if (sku.includes('CA-001IY') || sku.includes('CA-001IV')) return 'Ivory';
  if (sku.includes('CA-001GY')) return 'Grey';
  if (sku.includes('CA-001BZ')) return 'Bronze';
  if (sku.includes('CA-100WH')) return 'White';
  if (sku.includes('CA-100IV')) return 'Ivory';
  if (sku.includes('CA-100GR')) return 'Grey';
  if (sku.includes('CA-100BZ')) return 'Bronze';
  if (sku.includes('RE-005')) return 'White';
  if (sku.includes('RE-112')) return 'Ivory';
  if (sku.includes('RE-026')) return 'Grey';
  if (sku.includes('RE-105')) return 'Bronze';
  return null;
}

export function bomDisplayLabel(componente: string, skuFinal: string): string {
  const color = colorFromSKU(skuFinal);
  const short = componente
    .replace('Tubo de 38mm NEO', 'Tubo NEO')
    .replace('Tubo de 38mm Normal', 'Tubo Normal')
    .replace('Tubo de 50 mm', 'Tubo 50mm')
    .replace('Tubo de 50mm', 'Tubo 50mm')
    .replace('Soporte lado del control', 'Soporte Control')
    .replace('Soporte del lado del end plug', 'Soporte End Plug')
    .replace('Control de cortina VTX30', 'Control VTX30')
    .replace('Control de cortina', 'Control')
    .replace('Pesa de cadena', 'Pesa')
    .replace('Tapaderas de bottomrail', 'Tapaderas')
    .replace('Topes de cadena', 'Topes')
    .replace('Adaptador para tubo de 50mm', 'Adaptador 50mm');
  return color ? `${short} ${color}` : short;
}

export function getOrderStatus(order: SavedOrder) {
  return normalizeOrderStatus(order.status);
}

export function getOrderStatusLabel(order: SavedOrder) {
  const st = getOrderStatus(order);
  switch (st) {
    case 'draft': return 'Borrador';
    case 'ready_for_production': return 'Lista para producción';
    case 'in_production': return 'En producción';
    case 'materials_checked': return 'Materiales revisados';
    case 'sent_to_sage': return 'Enviada a Sage';
    case 'completed': return 'Completada';
    case 'cancelled': return 'Cancelada';
    default: return 'Pendiente';
  }
}

export function getRelativeDateLabel(value: string) {
  const orderDate = new Date(value);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())) /
      dayMs,
  );

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  return formatDate(value);
}

export function getClientReference(order: SavedOrder) {
  return order.orderNumber || 'Sin referencia';
}

export function getMainFabricLabel(order: SavedOrder) {
  const fabrics = Array.from(new Set(order.items.map((i: any) => i.result?.selectedFabric?.color).filter(Boolean)));
  if (fabrics.length === 0) return 'Sin tela';
  if (fabrics.length === 1) return `Tela: ${fabrics[0]}`;
  return 'Múltiples telas';
}
