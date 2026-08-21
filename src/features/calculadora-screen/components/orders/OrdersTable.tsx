import type { OrderReportRow } from './utils/orderReport';
import { getClientReference, getMainFabricLabel, getOrderStatus, getOrderStatusLabel } from './utils/orderDisplay';
import { formatDate } from '../../../../lib/format';
import { getInventoryErrorMessage } from '../../../../lib/inventoryErrorMessages';
import { OrderActionsMenu } from './OrderActionsMenu';

import { useCalculatorStore } from '../../store/useCalculatorStore';
import { useGlobalInventoryStore } from '../../../../store/useGlobalInventoryStore';
import { validateOrderInventoryAvailability } from '../../../../domain/orders/orderInventoryAvailability';
import { logOrderSentToProduction } from './utils/orderActivityMetadata';
import { useOrderWorkflowActions } from '../../../../hooks/useOrderWorkflowActions';
import type { OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';

interface Props {
  paginatedRows: OrderReportRow[];
  actionMenuOpenId: string | null;
  setActionMenuOpenId: (id: string | null) => void;
  isReadOnly: boolean;
  onViewDetails: (row: OrderReportRow) => void;
  onReviewMaterials: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

export function OrdersTable({
  paginatedRows,
  actionMenuOpenId,
  setActionMenuOpenId,
  isReadOnly,
  onViewDetails,
  onReviewMaterials,
  onDelete
}: Props) {
  const store = useCalculatorStore();
  const { sendToProduction } = useOrderWorkflowActions();
  const { items: inventoryItems, syncStatus, lastError } = useGlobalInventoryStore();
  
  const inventoryContext = {
    inventoryItems,
    isSyncError: syncStatus === 'error',
    syncErrorMessage: lastError || undefined,
  };

  return (
    <div className="orders-data-table-wrapper">
      <table className="orders-data-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Cliente / Referencia</th>
            <th>Quantity</th>
            <th>Date</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedRows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                No hay órdenes que coincidan con los filtros.
              </td>
            </tr>
          ) : (
            paginatedRows.map((row) => {
              const status = getOrderStatus(row.order);
              const isMenuOpen = actionMenuOpenId === row.order.id;
              const inventoryResult = validateOrderInventoryAvailability(row.order, inventoryContext);

              let syncIcon = null;
              const rowSyncStatus = store.syncMetadata[row.order.id];
              if (rowSyncStatus) {
                if (rowSyncStatus.status === 'pending') {
                  syncIcon = <span title="Pendiente de subir" style={{ marginLeft: 6, fontSize: '14px' }}>⏳</span>;
                } else if (rowSyncStatus.status === 'error') {
                  const titleStr = getInventoryErrorMessage(rowSyncStatus.inventoryErrorCode, rowSyncStatus.errorMessage);
                  syncIcon = <span title={"Error: " + titleStr} style={{ marginLeft: 6, fontSize: '14px' }}>🔴</span>;
                }
              }

              return (
                <tr key={row.order.id}>
                  <td className="cell-order-id">
                    {row.order.orderNumber || `#${row.order.id.slice(0, 6)}`}
                    {syncIcon}
                  </td>
                  <td className="cell-client">
                    <span className="cell-client-name">{getClientReference(row.order)}</span>
                    <span className="cell-client-sub">{row.summary.curtains} persianas · {getMainFabricLabel(row.order)}</span>
                  </td>
                  <td>{row.summary.curtains}</td>
                  <td className="cell-date">{formatDate(row.order.createdAt)}</td>
                  <td>
                    <span className={`status-pill status-${status}`}>
                      {getOrderStatusLabel(row.order)}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <OrderActionsMenu
                      isOpen={isMenuOpen}
                      order={row.order}
                      context={{
                        isReadOnly,
                        hasInventoryError: rowSyncStatus?.status === 'error',
                        inventoryAvailabilityResult: inventoryResult,
                        hasMaterialReview: row.order.productionReview?.status === 'completed'
                      }}
                      onToggleMenu={(e) => {
                        e.stopPropagation();
                        setActionMenuOpenId(isMenuOpen ? null : row.order.id);
                      }}
                      onViewDetails={() => onViewDetails(row)}
                      onEditOrder={() => {
                        store.setOrderDraft(() => ({
                          orderNumber: row.order.orderNumber,
                          items: row.order.items
                        }));
                        alert('Orden cargada. Por favor navega a la pestaña de Cotizador para continuar.');
                        setActionMenuOpenId(null);
                      }}
                      onViewPdf={async () => {
                        setActionMenuOpenId(null);
                        try {
                          const { generateOrderMaterialsPdf } = await import('../../../../lib/pdf/generateOrderMaterialsPdf');
                          await generateOrderMaterialsPdf(row.order, store.productionInventory, store.inventoryMovements);
                          if (isReadOnly) return;
                        } catch (err: any) { alert(err.message); }
                      }}
                      onStartProduction={async () => {
                        setActionMenuOpenId(null);
                        const syncStatus = store.syncMetadata[row.order.id];
                        const context: OrderWorkflowContext = {
                          isReadOnly,
                          hasInventoryError: syncStatus?.status === 'error',
                          hasMaterialReview: row.order.productionReview?.status === 'completed',
                          inventoryAvailabilityResult: syncStatus?.inventoryAvailabilityResult,
                        };
                        const result = await sendToProduction(row.order, context);
                        if (result?.success) {
                          logOrderSentToProduction(row.order, 'order_actions_menu');
                        }
                      }}
                      onReviewMaterials={() => onReviewMaterials(row.order.id)}
                      onRevertToReviewed={() => {
                        store.updateSavedOrderStatus(row.order.id, 'materials_checked');
                        setActionMenuOpenId(null);
                      }}
                      onDelete={() => onDelete(row.order.id)}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
