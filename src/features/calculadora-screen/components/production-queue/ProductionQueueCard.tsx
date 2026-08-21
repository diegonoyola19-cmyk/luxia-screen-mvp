import { useMemo } from 'react';
import type { SavedOrder } from '../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import type { InventoryValidationContext } from '../../../../domain/orders/orderInventoryAvailability';
import { validateOrderInventoryAvailability } from '../../../../domain/orders/orderInventoryAvailability';
import { getClientReference, getOrderStatusLabel } from '../orders/utils/orderDisplay';
import { canPerformOrderAction, getBlockedOrderReasons } from '../../../../domain/orders/orderWorkflow';
import { getOrderReportRow } from '../orders/utils/orderReport';
import { logOrderSentToProduction } from '../orders/utils/orderActivityMetadata';
import type { OrderReportRow } from '../orders/utils/orderReport';
import { formatDate } from '../../../../lib/format';
import { useOrderWorkflowActions } from '../../../../hooks/useOrderWorkflowActions';

interface Props {
  order: SavedOrder;
  context: OrderWorkflowContext;
  inventoryContext: InventoryValidationContext;
  onViewDetails: (row: OrderReportRow) => void;
}

export function ProductionQueueCard({ order, context, inventoryContext, onViewDetails }: Props) {
  const { isProcessing, sendToProduction } = useOrderWorkflowActions();
  const isBusy = isProcessing(order.id);

  const clientReference = getClientReference(order);
  const dateFormatted = formatDate(order.createdAt);
  const statusLabel = getOrderStatusLabel(order);
  
  const inventoryResult = validateOrderInventoryAvailability(order, inventoryContext);

  // Construir contexto completo con todos los campos que canPerformOrderAction necesita
  const localContext = {
    ...context,
    inventoryAvailabilityResult: inventoryResult,
    // hasMaterialReview refleja si la orden tiene una revisión de materiales finalizada
    hasMaterialReview: !!(order as any).productionReview?.finalMaterialLines?.length,
  };

  const blockReasons = getBlockedOrderReasons(order, localContext);
  const hasInventoryError = localContext.hasInventoryError;

  // Puerta estricta: usa canPerformOrderAction que exige estado + materiales + inventario
  const sendToProductionAction = canPerformOrderAction(order, 'send_to_production', localContext);
  const canSendToProduction = sendToProductionAction.allowed;

  const handleSendToProduction = async () => {
    if (!canSendToProduction || isBusy) return;
    const result = await sendToProduction(order, localContext);
    if (result?.success) {
      logOrderSentToProduction(order, 'production_queue');
    }
  };

  const handleViewDetails = () => {
    onViewDetails(getOrderReportRow(order));
  };

  return (
    <div className="production-queue-card">
      <div className="production-queue-card__header">
        <span className="production-queue-card__id">{order.orderNumber}</span>
        <span className="production-queue-card__date">{dateFormatted}</span>
      </div>
      
      <div className="production-queue-card__client" title={clientReference}>
        {clientReference}
      </div>
      
      <div className="production-queue-card__details">
        <span>{order.items.length} persiana{order.items.length !== 1 && 's'}</span>
        <span>•</span>
        <span>{statusLabel}</span>
      </div>

      {hasInventoryError && (
        <div className="production-queue-card__block-reasons" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
          ⚠️ Error de inventario
        </div>
      )}

      {blockReasons.length > 0 && !hasInventoryError && (
        <div className="production-queue-card__block-reasons">
          {blockReasons[0]}
        </div>
      )}

      <div className="production-queue-card__actions">
        <button 
          className="production-queue-card__btn" 
          onClick={handleViewDetails}
          disabled={isBusy}
        >
          Ver Detalles
        </button>
        {canSendToProduction && (
          <button 
            className="production-queue-card__btn production-queue-card__btn--primary" 
            onClick={handleSendToProduction}
            disabled={isBusy}
          >
            {isBusy ? 'Reservando...' : 'Pasar a Producción'}
          </button>
        )}
      </div>
    </div>
  );
}
