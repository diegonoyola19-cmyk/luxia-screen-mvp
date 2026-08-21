import type { SavedOrder } from '../curtains/types';
import { normalizeOrderStatus, type SavedOrderStatus } from './orderStatus';
import { canTransitionOrderStatus, canPerformOrderAction, type OrderWorkflowContext } from './orderWorkflow';
import {
  reserveOrderInventory,
  releaseOrderInventory,
  consumeOrderInventoryReservations
} from '../../lib/supabaseOrderInventory';
import { useCalculatorStore } from '../../features/calculadora-screen/store/useCalculatorStore';
import { upsertOrder } from '../../lib/supabaseOrders';

export interface WorkflowActionResult {
  success: boolean;
  orderId: string;
  status: SavedOrderStatus;
  message?: string;
  reservationStatus?: string;
}

/**
 * Transición ready_for_production -> in_production
 * Ejecuta la reserva atómica en base de datos ANTES de cambiar el estado de la orden.
 * Si la actualización de estado falla post-reserva:
 *   - Revierte el estado local de Zustand al estado original.
 *   - Ejecuta compensación (release_order_inventory).
 *   - Si la compensación también falla, no oculta ninguno de los dos errores.
 */
export async function sendOrderToProduction(
  order: SavedOrder,
  context: OrderWorkflowContext,
  options?: { userId?: string }
): Promise<WorkflowActionResult> {
  const transitionCheck = canTransitionOrderStatus(order, 'in_production', context);
  if (!transitionCheck.allowed) {
    throw new Error(transitionCheck.reason || 'Transición a producción no permitida');
  }

  const actionCheck = canPerformOrderAction(order, 'send_to_production', context);
  if (!actionCheck.allowed) {
    throw new Error(actionCheck.reason || 'No se cumplen los requisitos para enviar a producción');
  }

  const originalStatus: SavedOrderStatus = normalizeOrderStatus(order.status);

  // 1. Reservar inventario PRIMERO
  const reservationResult = await reserveOrderInventory(order.id, options?.userId);

  // 2. Actualizar estado a 'in_production' solo tras reserva exitosa
  try {
    const store = useCalculatorStore.getState();
    store.updateSavedOrderStatus(order.id, 'in_production');

    const updatedOrder = store.savedOrders.find(o => o.id === order.id) || {
      ...order,
      status: 'in_production' as SavedOrderStatus,
      updatedAt: new Date().toISOString()
    };
    await upsertOrder(updatedOrder);

    return {
      success: true,
      orderId: order.id,
      status: 'in_production',
      reservationStatus: reservationResult.status
    };
  } catch (statusUpdateError: any) {
    // Revertir Zustand local a estado original para no desincronizar UI con Supabase
    useCalculatorStore.getState().updateSavedOrderStatus(order.id, originalStatus);

    // COMPENSACIÓN: Liberar reservas si falla el cambio de estado en persistencia
    console.error(
      `[sendOrderToProduction] Error actualizando estado a in_production para orden ${order.id}. Iniciando compensación (release_order_inventory)...`,
      statusUpdateError
    );
    try {
      await releaseOrderInventory(order.id, options?.userId, 'compensation_status_update_failed');
    } catch (compensationError: any) {
      console.error(
        `[sendOrderToProduction] Error en compensación de reserva para orden ${order.id}:`,
        compensationError
      );
      // NO ocultar ninguno de los dos errores: lanzar error compuesto
      throw new Error(
        `Fallo al guardar estado de producción (${statusUpdateError?.message || statusUpdateError}) Y falló la compensación de reserva (${compensationError?.message || compensationError})`
      );
    }
    throw statusUpdateError;
  }
}

/**
 * Transición * -> cancelled
 * Libera cualquier reserva activa de la orden y actualiza el estado a 'cancelled'.
 * La operación es idempotente en base de datos.
 * Si el cambio de estado falla en persistencia, revierte el estado local de Zustand.
 */
export async function cancelOrder(
  order: SavedOrder,
  context: OrderWorkflowContext,
  options?: { userId?: string; reason?: string }
): Promise<WorkflowActionResult> {
  const transitionCheck = canTransitionOrderStatus(order, 'cancelled', context);
  if (!transitionCheck.allowed) {
    throw new Error(transitionCheck.reason || 'No se puede cancelar la orden');
  }

  const originalStatus: SavedOrderStatus = normalizeOrderStatus(order.status);

  // 1. Liberar reservas (idempotente en SQL)
  const releaseResult = await releaseOrderInventory(
    order.id,
    options?.userId,
    options?.reason || 'user_cancelled'
  );

  // 2. Actualizar estado a 'cancelled'
  try {
    const store = useCalculatorStore.getState();
    store.updateSavedOrderStatus(order.id, 'cancelled');

    const updatedOrder = store.savedOrders.find(o => o.id === order.id) || {
      ...order,
      status: 'cancelled' as SavedOrderStatus,
      updatedAt: new Date().toISOString()
    };
    await upsertOrder(updatedOrder);

    return {
      success: true,
      orderId: order.id,
      status: 'cancelled',
      reservationStatus: releaseResult.status
    };
  } catch (statusUpdateError: any) {
    // Revertir Zustand local si la persistencia falla
    useCalculatorStore.getState().updateSavedOrderStatus(order.id, originalStatus);
    console.error(`[cancelOrder] Falló la actualización de estado a cancelled para orden ${order.id}:`, statusUpdateError);
    throw statusUpdateError;
  }
}

/**
 * Transición in_production -> completed
 * Consume atómicamente el inventario reservado y actualiza el estado a 'completed'.
 * Si el consumo falla, la orden permanece en 'in_production'.
 * Si ya fue consumido ('already_consumed'), es idempotente y permite finalizar el estado sin descontar nuevamente.
 */
export async function completeOrder(
  order: SavedOrder,
  context: OrderWorkflowContext,
  options?: { userId?: string }
): Promise<WorkflowActionResult> {
  const transitionCheck = canTransitionOrderStatus(order, 'completed', context);
  if (!transitionCheck.allowed) {
    throw new Error(transitionCheck.reason || 'No se puede marcar la orden como completada');
  }

  const originalStatus: SavedOrderStatus = normalizeOrderStatus(order.status);

  // 1. Consumir reservas de inventario (idempotente: si ya se consumió, retorna ok: true, status: 'already_consumed')
  const consumeResult = await consumeOrderInventoryReservations(order.id, options?.userId);

  // 2. Actualizar estado a 'completed' solo si el consumo fue exitoso
  try {
    const store = useCalculatorStore.getState();
    store.updateSavedOrderStatus(order.id, 'completed');

    const updatedOrder = store.savedOrders.find(o => o.id === order.id) || {
      ...order,
      status: 'completed' as SavedOrderStatus,
      updatedAt: new Date().toISOString()
    };
    await upsertOrder(updatedOrder);

    return {
      success: true,
      orderId: order.id,
      status: 'completed',
      reservationStatus: consumeResult.status
    };
  } catch (statusUpdateError: any) {
    // Revertir Zustand local si la persistencia falla (el consumo SQL es idempotente para el próximo reintento)
    useCalculatorStore.getState().updateSavedOrderStatus(order.id, originalStatus);
    console.error(`[completeOrder] Falló la actualización de estado a completed para orden ${order.id}:`, statusUpdateError);
    throw statusUpdateError;
  }
}

