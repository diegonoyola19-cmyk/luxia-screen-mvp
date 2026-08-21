import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/useAuthStore';
import type { SavedOrder } from '../../../domain/curtains/types';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { importSavedOrdersFile } from '../../../lib/orderTransfer';
import { downloadSageOrderEntry, getSageExportableLineCount } from '../../../lib/sageExport';
import { MaterialReviewModal } from './MaterialReviewModal';
import { validateOrderBeforeSage } from '../../../domain/orders/validateOrderBeforeSage';
import { logAppActivity } from '../../../lib/logAppActivity';
import './SavedOrdersTable.css';

import { getOrderReportRow, type OrderReportRow } from './orders/utils/orderReport';
import { sortOrders, matchesOrderSearch, type DateRange, type OrderSortMode, type OrderStatusFilter } from './orders/utils/orderSearch';
import { OrdersFilterBar } from './orders/OrdersFilterBar';
import { OrdersTable } from './orders/OrdersTable';
import { OrderDetailModal } from './orders/OrderDetailModal';
import { useOrderWorkflowActions } from '../../../hooks/useOrderWorkflowActions';
import type { OrderWorkflowContext } from '../../../domain/orders/orderWorkflow';

// ── Main Component ──────────────

export function SavedOrdersPanel() {
  const store = useCalculatorStore();
  const { cancelOrder } = useOrderWorkflowActions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reportRows = useMemo(() => store.savedOrders.map(getOrderReportRow), [store.savedOrders]);
  
  const { role } = useAuthStore();
  const isReadOnly = role === 'consulta';
  
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<OrderSortMode>('recent');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrderModal, setSelectedOrderModal] = useState<OrderReportRow | null>(null);
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 10;
  
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const reviewingOrder = useMemo(() => store.savedOrders.find(o => o.id === reviewingOrderId) ?? null, [store.savedOrders, reviewingOrderId]);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredQuery, sortMode, dateRange, statusFilter]);

  useEffect(() => {
    if (!deletingOrderId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeletingOrderId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deletingOrderId]);

  const filteredRows = useMemo(() => {
    const nextRows = reportRows.filter((row) =>
      matchesOrderSearch(row, deferredQuery, dateRange, statusFilter)
    );
    return sortOrders(nextRows, sortMode);
  }, [deferredQuery, reportRows, sortMode, dateRange, statusFilter]);

  const filteredOrders = useMemo(() => filteredRows.map((r) => r.order), [filteredRows]);

  const exportableSageOrders = useMemo(
    () => filteredOrders.filter((order) => getSageExportableLineCount([order]) > 0),
    [filteredOrders],
  );



  const onExportSage = () => {
    const errors: string[] = [];
    const exportedOrderIds: string[] = [];
    const validOrders: SavedOrder[] = [];

    for (const order of exportableSageOrders) {
      const validation = validateOrderBeforeSage(order);
      if (validation.ok) {
        validOrders.push(order);
        exportedOrderIds.push(order.id);
      } else {
        errors.push(`Orden ${order.orderNumber}: ${validation.errors.map(e => e.message).join(', ')}`);
      }
    }

    if (validOrders.length === 0) {
      store.setErrors((prev) => ({
        ...prev,
        general: errors.length > 0 ? errors.join(' | ') : 'No hay órdenes válidas para enviar a Sage.'
      }));
      return;
    }

    try {
      const currentRemainders = store.remainders || [];
      if (import.meta.env.DEV) {
        console.log("[SavedOrdersPanel] currentRemainders before", currentRemainders);
      }
      
      const { updatedRemainders, orderSnapshots } = downloadSageOrderEntry(validOrders, currentRemainders);
      
      if (import.meta.env.DEV) {
        console.log("[SavedOrdersPanel] updatedRemainders received", updatedRemainders);
      }
      
      store.setRemainders(updatedRemainders);
      
      store.markOrdersSentToSage(exportedOrderIds, orderSnapshots);
      if (errors.length > 0) {
        store.setErrors((prev) => ({
          ...prev,
          general: `Se enviaron ${validOrders.length} órdenes, pero hubo errores: ` + errors.join(' | ')
        }));
      }
    } catch (error: any) {
      store.setErrors((prev) => ({
        ...prev,
        general: error.message || 'No se pudo generar el archivo para Sage.'
      }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="orders-table-container" onClick={() => setActionMenuOpenId(null)}>
      <OrdersFilterBar
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onExportSage={onExportSage}
        exportableSageCount={exportableSageOrders.length}
        isReadOnly={isReadOnly}
      />

      <OrdersTable
        paginatedRows={paginatedRows}
        actionMenuOpenId={actionMenuOpenId}
        setActionMenuOpenId={setActionMenuOpenId}
        isReadOnly={isReadOnly}
        onViewDetails={(row) => {
          setSelectedOrderModal(row);
          store.setSelectedOrderId(row.order.id);
          setActionMenuOpenId(null);
        }}
        onReviewMaterials={(orderId) => {
          setReviewingOrderId(orderId);
          setActionMenuOpenId(null);
        }}
        onDelete={(orderId) => {
          setDeletingOrderId(orderId);
          setDeleteReason('');
          setActionMenuOpenId(null);
        }}
      />
        
        <div className="orders-pagination">
          <span>Mostrando {filteredRows.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} – {Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} de {filteredRows.length}</span>
          <div className="pagination-controls">
            <button 
              className="pagination-btn" 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <span className="material-symbols-outlined" style={{fontSize: 18}}>chevron_left</span>
            </button>
            <button 
              className="pagination-btn" 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              <span className="material-symbols-outlined" style={{fontSize: 18}}>chevron_right</span>
            </button>
          </div>
        </div>

      {selectedOrderModal && (
        <OrderDetailModal
          selectedRow={selectedOrderModal}
          onClose={() => setSelectedOrderModal(null)}
          isReadOnly={isReadOnly}
          onReviewMaterials={(orderId) => setReviewingOrderId(orderId)}
        />
      )}

      {reviewingOrder && (
        <MaterialReviewModal order={reviewingOrder} onClose={() => setReviewingOrderId(null)} />
      )}

    {deletingOrderId && (
        <div 
          className="modal-overlay" 
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingOrderId(null); }}
        >
          <div className="modal-content" style={{maxWidth: 400}}>
            <div className="modal-header">
              <h2>¿Eliminar orden {store.savedOrders.find(o => o.id === deletingOrderId)?.orderNumber}?</h2>
              <button className="modal-close-btn" onClick={() => setDeletingOrderId(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              <p>Esta acción eliminará la orden del historial local.</p>
              <p>No modificará Sage ni los archivos ya exportados.</p>
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Motivo de borrado (requerido)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Orden duplicada, error de captura"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={() => setDeletingOrderId(null)}>Cancelar</Button>
              <Button 
                type="button" 
                variant="danger" 
                style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                onClick={async () => {
                  if (!deleteReason.trim() || !deletingOrderId) return;
                  const orderToDelete = store.savedOrders.find(o => o.id === deletingOrderId);
                  setDeletingOrderId(null);
                  
                  if (orderToDelete) {
                    const syncStatus = store.syncMetadata[orderToDelete.id];
                    const context: OrderWorkflowContext = {
                      isReadOnly,
                      hasInventoryError: syncStatus?.status === 'error',
                      hasMaterialReview: orderToDelete.productionReview?.status === 'completed',
                      inventoryAvailabilityResult: syncStatus?.inventoryAvailabilityResult,
                    };
                    await cancelOrder(orderToDelete, context, deleteReason.trim());
                    logAppActivity({
                      event_type: 'order.deleted',
                      entity_type: 'order',
                      entity_id: orderToDelete.id,
                      metadata: {
                        orderNumber: orderToDelete.orderNumber,
                        curtainCount: orderToDelete.items.length,
                        status: orderToDelete.status,
                        deleteReason: deleteReason.trim()
                      }
                    });
                  }
                }}
                disabled={isReadOnly || !deleteReason.trim()}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            importSavedOrdersFile(file)
              .then((imported) => store.importOrders(imported))
              .catch(() => store.setErrors((prev) => ({ ...prev, general: 'Error importando.' })));
            event.target.value = '';
          }
        }}
      />
    </div>
  );
}
