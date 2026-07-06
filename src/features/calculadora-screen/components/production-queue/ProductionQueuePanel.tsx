import { useMemo, useState } from 'react';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useGlobalInventoryStore } from '../../../../store/useGlobalInventoryStore';
import type { OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import type { InventoryValidationContext } from '../../../../domain/orders/orderInventoryAvailability';
import { getProductionQueueGroups } from './utils/productionQueueSelectors';
import { ProductionQueueColumn } from './ProductionQueueColumn';
import { OrderDetailModal } from '../orders/OrderDetailModal';
import type { OrderReportRow } from '../orders/utils/orderReport';
import './ProductionQueue.css';

export function ProductionQueuePanel() {
  const store = useCalculatorStore();
  const { hasPermission } = useAuthStore();
  const { items: inventoryItems, syncStatus, lastError } = useGlobalInventoryStore();
  const [selectedRow, setSelectedRow] = useState<OrderReportRow | null>(null);

  const context = useMemo<OrderWorkflowContext>(() => {
    return {
      isReadOnly: !hasPermission('orders.edit'),
    };
  }, [hasPermission]);

  const inventoryContext = useMemo<InventoryValidationContext>(() => {
    return {
      inventoryItems,
      isSyncError: syncStatus === 'error',
      syncErrorMessage: lastError || undefined,
    };
  }, [inventoryItems, syncStatus, lastError]);

  const groups = useMemo(() => {
    return getProductionQueueGroups(store.savedOrders, context, inventoryContext);
  }, [store.savedOrders, context, inventoryContext]);

  return (
    <div className="production-queue-panel">
      <div className="production-queue-board">
        <ProductionQueueColumn 
          title="Listas para producción" 
          orders={groups.ready} 
          context={context} 
          inventoryContext={inventoryContext}
          onViewDetails={setSelectedRow} 
        />
        <ProductionQueueColumn 
          title="En producción" 
          orders={groups.in_production} 
          context={context} 
          inventoryContext={inventoryContext}
          onViewDetails={setSelectedRow} 
        />
        <ProductionQueueColumn 
          title="Bloqueadas" 
          orders={groups.blocked} 
          context={context} 
          inventoryContext={inventoryContext}
          onViewDetails={setSelectedRow} 
        />
        <ProductionQueueColumn 
          title="Completadas" 
          orders={groups.completed} 
          context={context} 
          inventoryContext={inventoryContext}
          onViewDetails={setSelectedRow} 
        />
      </div>

      {selectedRow && (
        <OrderDetailModal
          selectedRow={selectedRow}
          onClose={() => setSelectedRow(null)}
          isReadOnly={context.isReadOnly}
          onReviewMaterials={() => {}} // No review materials from here for now
        />
      )}
    </div>
  );
}
