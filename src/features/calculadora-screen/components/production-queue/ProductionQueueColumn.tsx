import type { SavedOrder } from '../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import type { InventoryValidationContext } from '../../../../domain/orders/orderInventoryAvailability';
import type { OrderReportRow } from '../orders/utils/orderReport';
import { ProductionQueueCard } from './ProductionQueueCard';

interface Props {
  title: string;
  orders: SavedOrder[];
  context: OrderWorkflowContext;
  inventoryContext: InventoryValidationContext;
  onViewDetails: (row: OrderReportRow) => void;
}

export function ProductionQueueColumn({ title, orders, context, inventoryContext, onViewDetails }: Props) {
  return (
    <div className="production-queue-column">
      <div className="production-queue-column__header">
        <h3 className="production-queue-column__title">{title}</h3>
        <span className="production-queue-column__count">{orders.length}</span>
      </div>
      <div className="production-queue-column__content">
        {orders.map((order) => (
          <ProductionQueueCard 
            key={order.id} 
            order={order} 
            context={context} 
            inventoryContext={inventoryContext}
            onViewDetails={onViewDetails} 
          />
        ))}
        {orders.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
            No hay órdenes
          </div>
        )}
      </div>
    </div>
  );
}
