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

/**
 * Tabla de transiciones de estado válidas.
 * Solo las rutas listadas aquí están permitidas.
 * Cualquier transición no listada está BLOQUEADA por defecto.
 *
 * Estados terminales:
 *   - completed: ninguna transición de salida
 *   - cancelled: solo puede ir a draft (reactivar) — NO a in_production ni completed
 */
const ALLOWED_TRANSITIONS: Record<SavedOrderStatus, ReadonlyArray<SavedOrderStatus>> = {
  draft: ['ready_for_production'],
  ready_for_production: ['in_production', 'draft'],
  in_production: ['completed', 'sent_to_sage'],
  materials_checked: ['sent_to_sage', 'draft', 'ready_for_production'],
  sent_to_sage: ['materials_checked'],   // única transición: revertir
  completed: [],                          // estado terminal: sin salida
  cancelled: ['draft'],                  // sólo reactivar a draft; nunca a in_production/completed
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
    return { allowed: true };
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
      // Bloquear borrado cuando la orden ya está en producción o terminada
      if (status === 'in_production') {
        return { allowed: false, reason: 'No se puede eliminar una orden que está en producción' };
      }
      if (status === 'completed') {
        return { allowed: false, reason: 'No se puede eliminar una orden completada' };
      }
      return { allowed: true };

    case 'export_sage':
      if (status !== 'materials_checked') {
        return { allowed: false, reason: 'La orden debe estar revisada para exportarse a Sage' };
      }
      return { allowed: true };

    case 'send_to_production': {
      if (status !== 'ready_for_production') {
        return { allowed: false, reason: 'La orden no está en estado Lista para Producción' };
      }

      // Materiales confirmados son obligatorios
      if (!context.hasMaterialReview) {
        return { allowed: false, reason: 'La orden debe tener materiales confirmados antes de pasar a producción' };
      }

      // inventoryAvailabilityResult es obligatorio (no puede ser undefined)
      if (!context.inventoryAvailabilityResult) {
        return { allowed: false, reason: 'Se requiere verificar disponibilidad de inventario antes de pasar a producción' };
      }

      if (!context.inventoryAvailabilityResult.canProceed) {
        return {
          allowed: false,
          reason: context.inventoryAvailabilityResult.reasons[0] || 'Inventario insuficiente para proceder'
        };
      }

      return { allowed: true };
    }

    case 'confirm_materials': {
      // Solo estados previos a producción son válidos para confirmar materiales
      const validStatusesForReview: SavedOrderStatus[] = ['draft', 'ready_for_production', 'materials_checked'];
      if (!validStatusesForReview.includes(status)) {
        return { allowed: false, reason: `No se pueden confirmar materiales en estado "${status}"` };
      }
      return { allowed: true };
    }

    case 'revert_to_draft':
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

  // Misma posición: no hay transición real
  if (currentStatus === nextStatus) {
    return { allowed: true };
  }

  // Verificar que la transición existe en la allowlist
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedNext.includes(nextStatus)) {
    return {
      allowed: false,
      reason: `Transición inválida: "${currentStatus}" → "${nextStatus}" no está permitida`
    };
  }

  // Restricciones adicionales de contexto sobre transiciones permitidas
  if (nextStatus === 'in_production') {
    if (context.isReadOnly) {
      return { allowed: false, reason: 'Permisos insuficientes' };
    }
    if (context.inventoryAvailabilityResult && !context.inventoryAvailabilityResult.canProceed) {
      return { allowed: false, reason: 'Error de inventario bloquea producción' };
    }
    if (!context.inventoryAvailabilityResult && context.hasInventoryError) {
      return { allowed: false, reason: 'Error de inventario bloquea producción' };
    }
  }

  if (nextStatus === 'materials_checked') {
    if (context.isReadOnly) {
      return { allowed: false, reason: 'Permisos insuficientes' };
    }
  }

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
