import type { SavedOrder } from '../curtains/types';
import { normalizeOrderStatus, type SavedOrderStatus } from './orderStatus';
import type { InventoryAvailabilityResult } from './orderInventoryAvailability';

export type OrderAction =
  | 'view_details'
  | 'edit'
  | 'delete'
  | 'export_pdf'
  | 'export_sage'
  | 'send_to_production'
  | 'confirm_materials'
  | 'revert_to_draft';

export type OrderWorkflowContext = {
  isReadOnly: boolean;
  permissions?: string[];
  hasInventoryError?: boolean;
  inventoryAvailabilityResult?: InventoryAvailabilityResult;
  hasMaterialReview?: boolean;
  isSageReady?: boolean;
};

export function canPerformOrderAction(
  order: SavedOrder,
  action: OrderAction,
  context: OrderWorkflowContext
): { allowed: boolean; reason?: string } {
  const status = normalizeOrderStatus(order.status);
  
  if (action === 'view_details') {
    return { allowed: true };
  }

  if (action === 'export_pdf') {
    return { allowed: true }; // Currently PDF export is allowed for all
  }

  if (context.isReadOnly) {
    return { allowed: false, reason: 'El usuario tiene permisos de solo lectura' };
  }

  switch (action) {
    case 'edit':
      if (status !== 'draft') {
        return { allowed: false, reason: 'Solo se pueden editar órdenes en borrador' };
      }
      return { allowed: true };

    case 'delete':
      // TODO: Determinar si el borrado debe estar bloqueado por ciertos estados (ej. completed)
      return { allowed: true };

    case 'export_sage':
      // El workflow masivo lo decide OrdersFilterBar, pero a nivel de orden:
      if (status !== 'materials_checked') {
         return { allowed: false, reason: 'La orden debe estar revisada para exportarse a Sage' };
      }
      return { allowed: true };

    case 'send_to_production':
      if (status !== 'ready_for_production') {
        return { allowed: false, reason: 'La orden no está en estado Lista para Producción' };
      }
      if (context.inventoryAvailabilityResult && !context.inventoryAvailabilityResult.canProceed) {
        return { allowed: false, reason: context.inventoryAvailabilityResult.reasons[0] || 'Error de inventario' };
      } else if (context.hasInventoryError && !context.inventoryAvailabilityResult) {
        return { allowed: false, reason: 'La orden tiene errores de inventario' };
      }
      // TODO: Añadir validación de hasMaterialReview cuando el contexto esté implementado en los componentes
      return { allowed: true };

    case 'confirm_materials':
      const validStatusesForReview: SavedOrderStatus[] = ['draft', 'ready_for_production', 'in_production', 'materials_checked'];
      if (!validStatusesForReview.includes(status)) {
        return { allowed: false, reason: 'Estado no válido para revisar materiales' };
      }
      return { allowed: true };

    case 'revert_to_draft':
      // En la UI actual esto revierte de sent_to_sage a materials_checked. Mapearemos esto aquí.
      if (status !== 'sent_to_sage') {
        return { allowed: false, reason: 'Solo se puede revertir órdenes enviadas a Sage' };
      }
      return { allowed: true };

    default:
      return { allowed: false, reason: 'Acción desconocida' };
  }
}

export function getAllowedOrderActions(order: SavedOrder, context: OrderWorkflowContext): OrderAction[] {
  const actions: OrderAction[] = [
    'view_details',
    'edit',
    'delete',
    'export_pdf',
    'export_sage',
    'send_to_production',
    'confirm_materials',
    'revert_to_draft'
  ];

  return actions.filter(action => canPerformOrderAction(order, action, context).allowed);
}

export function canTransitionOrderStatus(
  order: SavedOrder,
  nextStatus: SavedOrderStatus,
  context: OrderWorkflowContext
): { allowed: boolean; reason?: string } {
  const currentStatus = normalizeOrderStatus(order.status);
  
  if (currentStatus === nextStatus) {
    return { allowed: true };
  }

  // Reglas básicas (TODO: expandir y auditar en Fase 2C)
  if (nextStatus === 'in_production') {
    if (context.isReadOnly) {
      return { allowed: false, reason: 'Permisos insuficientes' };
    }
    if (context.inventoryAvailabilityResult && !context.inventoryAvailabilityResult.canProceed) {
      return { allowed: false, reason: 'Error de inventario bloquea producción' };
    } else if (context.hasInventoryError && !context.inventoryAvailabilityResult) {
      return { allowed: false, reason: 'Error de inventario bloquea producción' };
    }
    if (currentStatus === 'ready_for_production' || currentStatus === 'draft') {
      return { allowed: true }; // Flujo de PDF o directo
    }
    return { allowed: false, reason: 'Transición inválida hacia in_production' };
  }

  if (nextStatus === 'materials_checked') {
    if (context.isReadOnly) {
      return { allowed: false, reason: 'Permisos insuficientes' };
    }
    if (currentStatus === 'sent_to_sage') {
      return { allowed: true }; // Revert
    }
  }

  // Por ahora permitimos las demás transiciones si no están específicamente bloqueadas
  // para no romper la aplicación.
  return { allowed: true };
}

export function getBlockedOrderReasons(order: SavedOrder, context: OrderWorkflowContext): string[] {
  const reasons: string[] = [];
  const status = normalizeOrderStatus(order.status);

  if (context.inventoryAvailabilityResult && !context.inventoryAvailabilityResult.canProceed) {
    reasons.push(...context.inventoryAvailabilityResult.reasons);
  } else if (context.hasInventoryError && !context.inventoryAvailabilityResult) {
    reasons.push('Error de inventario');
  }
  if (context.isReadOnly) {
    reasons.push('Usuario sin permisos (Solo lectura)');
  }
  if (status === 'completed') {
    reasons.push('Orden completada');
  }
  if (status === 'cancelled') {
    reasons.push('Orden eliminada o cancelada');
  }
  if (!context.hasMaterialReview && status === 'ready_for_production') {
    reasons.push('Faltan materiales confirmados');
  }

  return reasons;
}
