import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { SavedOrder } from '../domain/curtains/types';
import type { OrderWorkflowContext } from '../domain/orders/orderWorkflow';
import {
  sendOrderToProduction,
  cancelOrder,
  completeOrder,
  type WorkflowActionResult
} from '../domain/orders/orderWorkflowActions';

export function useOrderWorkflowActions() {
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());

  const isProcessing = useCallback(
    (orderId: string) => processingOrderIds.has(orderId),
    [processingOrderIds]
  );

  const executeAction = useCallback(
    async (
      orderId: string,
      actionFn: () => Promise<WorkflowActionResult>,
      successMsg: string
    ): Promise<WorkflowActionResult | null> => {
      // Prevención estricta de doble clic / ejecución concurrente por ID de orden
      if (processingOrderIds.has(orderId)) {
        return null;
      }

      setProcessingOrderIds((prev) => new Set(prev).add(orderId));
      try {
        const result = await actionFn();
        toast.success(successMsg);
        return result;
      } catch (err: any) {
        const errorMsg = err?.message || 'Error al procesar la acción de orden';
        console.error(`[useOrderWorkflowActions] Action failed for order ${orderId}:`, err);
        toast.error(errorMsg, { duration: 8000 });
        return null;
      } finally {
        setProcessingOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [processingOrderIds]
  );

  const handleSendToProduction = useCallback(
    (order: SavedOrder, context: OrderWorkflowContext) => {
      return executeAction(
        order.id,
        () => sendOrderToProduction(order, context),
        `Orden ${order.orderNumber} enviada a producción con reserva de inventario exitosa`
      );
    },
    [executeAction]
  );

  const handleCancelOrder = useCallback(
    (order: SavedOrder, context: OrderWorkflowContext, reason?: string) => {
      return executeAction(
        order.id,
        () => cancelOrder(order, context, { reason }),
        `Orden ${order.orderNumber} cancelada y reservas de inventario liberadas`
      );
    },
    [executeAction]
  );

  const handleCompleteOrder = useCallback(
    (order: SavedOrder, context: OrderWorkflowContext) => {
      return executeAction(
        order.id,
        () => completeOrder(order, context),
        `Orden ${order.orderNumber} completada y reservas consumidas en inventario`
      );
    },
    [executeAction]
  );

  return {
    isProcessing,
    processingOrderIds,
    sendToProduction: handleSendToProduction,
    cancelOrder: handleCancelOrder,
    completeOrder: handleCompleteOrder
  };
}
