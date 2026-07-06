import { useMemo } from 'react';
import type { SavedOrder } from '../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import type { InventoryValidationContext } from '../../../../domain/orders/orderInventoryAvailability';
import { validateOrderInventoryAvailability } from '../../../../domain/orders/orderInventoryAvailability';
import { getClientReference, getOrderStatusLabel } from '../orders/utils/orderDisplay';
import { canPerformOrderAction, canTransitionOrderStatus, getBlockedOrderReasons } from '../../../../domain/orders/orderWorkflow';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import { getOrderReportRow } from '../orders/utils/orderReport';
import { logOrderSentToProduction } from '../orders/utils/orderActivityMetadata';
import type { OrderReportRow } from '../orders/utils/orderReport';
import { formatDate } from '../../../../lib/format';

interface Props {
  order: SavedOrder;
  context: OrderWorkflowContext;
  inventoryContext: InventoryValidationContext;
  onViewDetails: (row: OrderReportRow) => void;
}

export function ProductionQueueCard({ order, context, inventoryContext, onViewDetails }: Props) {
  const store = useCalculatorStore();
  
  const clientReference = getClientReference(order);
  const dateFormatted = formatDate(order.createdAt);
  const statusLabel = getOrderStatusLabel(order);
  
  const inventoryResult = validateOrderInventoryAvailability(order, inventoryContext);
  const localContext = { ...context, inventoryAvailabilityResult: inventoryResult };
  
  const blockReasons = getBlockedOrderReasons(order, localContext);
  const hasInventoryError = localContext.hasInventoryError;
  
  // Transition check
  const transitionToProduction = canTransitionOrderStatus(order, 'in_production', localContext);
  const canSendToProduction = order.status === 'ready_for_production' && transitionToProduction.allowed;

  const handleSendToProduction = () => {
    if (!canSendToProduction) return;
    store.updateSavedOrderStatus(order.id, 'in_production');
    logOrderSentToProduction(order, 'production_queue');
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
        >
          Ver Detalles
        </button>
        {canSendToProduction && (
          <button 
            className="production-queue-card__btn production-queue-card__btn--primary" 
            onClick={handleSendToProduction}
          >
            Pasar a Producción
          </button>
        )}
      </div>
    </div>
  );
}
