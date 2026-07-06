/**
 * Mapea códigos de error técnicos de inventario a mensajes legibles para el usuario.
 */
export function getInventoryErrorMessage(errorCode?: string | null, fallbackMessage?: string | null): string {
  if (!errorCode) {
    return fallbackMessage || 'Error al sincronizar';
  }

  const codeMap: Record<string, string> = {
    'INSUFFICIENT_STOCK': 'Stock insuficiente en bodega',
    'ITEM_NOT_AVAILABLE': 'Material o retazo no disponible',
    'PERMISSION_DENIED': 'Sin permiso para consumir inventario',
    'INVALID_CONSUMPTION_PLAN': 'Plan de consumo inválido',
  };

  return codeMap[errorCode] || `Error de inventario: ${errorCode}`;
}
