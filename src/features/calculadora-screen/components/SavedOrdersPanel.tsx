import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/useAuthStore';
import type { SavedOrder } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeOrdersProduction, summarizeProduction } from '../../../lib/production';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { downloadSavedOrders, importSavedOrdersFile } from '../../../lib/orderTransfer';
import { downloadCsvReport } from '../../../lib/csvExport';
import { downloadSageOrderEntry, getSageExportableLineCount } from '../../../lib/sageExport';
import { generateRollerBOM, type BOMItem } from '../../../logic/generateRollerBOM';
import { getHWDesc, type Tone } from '../../../logic/rollerEngineV3';
import { MaterialReviewModal } from './MaterialReviewModal';
import { validateOrderBeforeSage } from '../../../domain/orders/validateOrderBeforeSage';
import { normalizeOrderStatus, SavedOrderStatus } from '../../../domain/orders/orderStatus';
import { supabase } from '../../../lib/supabase';
import './SavedOrdersTable.css';

// ── BOM display helpers ──────────────
const M_TO_FT = 3.28084;

function colorFromSKU(sku: string): string | null {
  if (sku.includes('AL-CLW')) return 'White';
  if (sku.includes('AL-CLI')) return 'Ivory';
  if (sku.includes('AL-CLA')) return 'Grey';
  if (sku.includes('AL-CLZ')) return 'Bronze';
  if (sku.includes('CH-WH') || sku.includes('CH-007')) return 'White';
  if (sku.includes('CH-IV') || sku.includes('CH-003')) return 'Ivory';
  if (sku.includes('CH-006')) return 'Grey';
  if (sku.includes('CH-012')) return 'Bronze';
  if (sku.includes('V20WH')) return 'White';
  if (sku.includes('V20IV')) return 'Ivory';
  if (sku.includes('V20GR')) return 'Grey';
  if (sku.includes('V20BR')) return 'Bronze';
  if (sku.includes('CA-001WH')) return 'White';
  if (sku.includes('CA-001IY') || sku.includes('CA-001IV')) return 'Ivory';
  if (sku.includes('CA-001GY')) return 'Grey';
  if (sku.includes('CA-001BZ')) return 'Bronze';
  if (sku.includes('CA-100WH')) return 'White';
  if (sku.includes('CA-100IV')) return 'Ivory';
  if (sku.includes('CA-100GR')) return 'Grey';
  if (sku.includes('CA-100BZ')) return 'Bronze';
  if (sku.includes('RE-005')) return 'White';
  if (sku.includes('RE-112')) return 'Ivory';
  if (sku.includes('RE-026')) return 'Grey';
  if (sku.includes('RE-105')) return 'Bronze';
  return null;
}

function bomDisplayLabel(componente: string, skuFinal: string): string {
  const color = colorFromSKU(skuFinal);
  const short = componente
    .replace('Tubo de 38mm NEO', 'Tubo NEO')
    .replace('Tubo de 38mm Normal', 'Tubo Normal')
    .replace('Tubo de 50 mm', 'Tubo 50mm')
    .replace('Tubo de 50mm', 'Tubo 50mm')
    .replace('Soporte lado del control', 'Soporte Control')
    .replace('Soporte del lado del end plug', 'Soporte End Plug')
    .replace('Control de cortina VTX30', 'Control VTX30')
    .replace('Control de cortina', 'Control')
    .replace('Pesa de cadena', 'Pesa')
    .replace('Tapaderas de bottomrail', 'Tapaderas')
    .replace('Topes de cadena', 'Topes')
    .replace('Adaptador para tubo de 50mm', 'Adaptador 50mm');
  return color ? `${short} ${color}` : short;
}

interface OrderReportRow {
  order: SavedOrder;
  summary: ReturnType<typeof summarizeProduction>;
  wastePercentage: number;
  reusePercentage: number;
}

type OrderSortMode = 'recent' | 'waste' | 'cost' | 'curtains';
type OrderStatusFilter = 'all' | SavedOrderStatus;
type DateRange = 'all' | 'today' | 'week' | 'month';

function getOrderStatus(order: SavedOrder) {
  return normalizeOrderStatus(order.status);
}

function getOrderStatusLabel(order: SavedOrder) {
  const st = getOrderStatus(order);
  switch (st) {
    case 'draft': return 'Borrador';
    case 'ready_for_production': return 'Lista para producción';
    case 'in_production': return 'En producción';
    case 'materials_checked': return 'Materiales revisados';
    case 'sent_to_sage': return 'Enviada a Sage';
    case 'completed': return 'Completada';
    case 'cancelled': return 'Cancelada';
    default: return 'Pendiente';
  }
}

function getReusePercentage(reusedArea: number, curtainArea: number) {
  return curtainArea === 0 ? 0 : (reusedArea / curtainArea) * 100;
}

function deriveAutoTone(fabricColor: string): Tone {
  const c = fabricColor.toLowerCase();
  if (c.includes('grey') || c.includes('gray') || c.includes('stone') || c.includes('smoke')) return 'grey';
  if (c.includes('ivory') || c.includes('beige') || c.includes('sand') || c.includes('linen') ||
      c.includes('bisque') || c.includes('taupe') || c.includes('off white') || c.includes('fawn')) return 'ivory';
  if (c.includes('bronze') || c.includes('brown') || c.includes('ebony') || c.includes('chocolate') ||
      c.includes('gold') || c.includes('custard')) return 'bronze';
  return 'white';
}

function getOrderReportRow(order: SavedOrder): OrderReportRow {
  const summary = summarizeProduction(order.items);
  const reusedArea = order.items.reduce(
    (sum, item) => sum + (item.reusedWastePiece?.areaM2 ?? 0),
    0,
  );

  return {
    order,
    summary,
    wastePercentage:
      summary.fabricDownloadedM2 === 0
        ? 0
        : (summary.fabricWasteM2 / summary.fabricDownloadedM2) * 100,
    reusePercentage: getReusePercentage(reusedArea, summary.curtainAreaM2),
  };
}

function getRelativeDateLabel(value: string) {
  const orderDate = new Date(value);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())) /
      dayMs,
  );

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  return formatDate(value);
}

// ── Nuevos Componentes Visuales ──────────────

function StatusBadge({ status }: { status: SavedOrderStatus | string }) {
  let badgeClass = 'badge-status--draft';
  switch (status) {
    case 'draft': badgeClass = 'badge-status--draft'; break;
    case 'ready_for_production': badgeClass = 'badge-status--ready'; break;
    case 'in_production': badgeClass = 'badge-status--production'; break;
    case 'materials_checked': badgeClass = 'badge-status--checked'; break;
    case 'sent_to_sage': badgeClass = 'badge-status--sage'; break;
    case 'completed': badgeClass = 'badge-status--completed'; break;
    case 'cancelled': badgeClass = 'badge-status--cancelled'; break;
  }

  let label = 'Pendiente';
  switch (status) {
    case 'draft': label = 'Borrador'; break;
    case 'ready_for_production': label = 'Lista para prod.'; break;
    case 'in_production': label = 'En producción'; break;
    case 'materials_checked': label = 'Revisado'; break;
    case 'sent_to_sage': label = 'Sage'; break;
    case 'completed': label = 'Completada'; break;
    case 'cancelled': label = 'Cancelada'; break;
  }

  return <span className={`badge-status ${badgeClass}`}>{label}</span>;
}

function inventoryErrorLabel(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_STOCK':   return 'Stock insuficiente en bodega';
    case 'ITEM_NOT_AVAILABLE':   return 'Material o retazo no disponible';
    case 'PERMISSION_DENIED':    return 'Sin permiso para consumir inventario';
    case 'INVALID_CONSUMPTION_PLAN': return 'Plan de consumo inválido';
    default: return `Error de inventario: ${code}`;
  }
}

function OrderListItem({ row, isActive, syncStatus, onClick }: { row: OrderReportRow, isActive: boolean, syncStatus?: import('../store/types').SyncStatus, onClick: () => void }) {
  const status = getOrderStatus(row.order);

  let syncIcon = null;
  if (syncStatus) {
    if (syncStatus.status === 'pending') {
      syncIcon = <span title="Pendiente de subir" style={{ marginLeft: 6, fontSize: '0.9em' }}>⏳</span>;
    } else if (syncStatus.status === 'error') {
      const errorTitle = syncStatus.inventoryErrorCode
        ? inventoryErrorLabel(syncStatus.inventoryErrorCode)
        : syncStatus.errorMessage || 'No se pudo sincronizar';
      syncIcon = <span title={`Error: ${errorTitle}`} style={{ marginLeft: 6, fontSize: '0.9em' }}>🔴</span>;
    }
  }

  return (
    <div className={`order-list-card ${isActive ? 'order-list-card--active' : ''}`} onClick={onClick}>
      <div className="order-list-card__top">
        <span className="order-list-card__title">
          {row.order.orderNumber || `#${row.order.id.slice(0, 6)}`}
          {syncIcon}
        </span>
        <StatusBadge status={status} />
      </div>
      <div className="order-list-card__meta">
        {getRelativeDateLabel(row.order.createdAt)} • {formatDate(row.order.createdAt)}
      </div>
      <div className="order-list-card__metrics">
        <div><span className="val">{row.summary.curtains}</span> piezas</div>
        <div><span className="val">{formatNumber(row.wastePercentage)}%</span> merma</div>
        <div><span className="val">${formatNumber(row.summary.totalOrderCost)}</span></div>
      </div>
    </div>
  );
}


// ── Main Component ──────────────

export function SavedOrdersPanel() {
  const store = useCalculatorStore();
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

  // Accordion states
  const [accBOM, setAccBOM] = useState(true);
  const [accPieces, setAccPieces] = useState(false);

  const filteredRows = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const nextRows = reportRows.filter((row) => {
      const orderDate = new Date(row.order.createdAt);
      if (dateRange === 'today' && orderDate < today) return false;
      if (dateRange === 'week' && orderDate < startOfWeek) return false;
      if (dateRange === 'month' && orderDate < startOfMonth) return false;

      const orderStatus = getOrderStatus(row.order);
      if (statusFilter !== 'all' && orderStatus !== statusFilter) return false;

      if (!deferredQuery) {
        return true;
      }

      const searchable = [
        row.order.orderNumber || '',
        row.order.id,
        getOrderStatusLabel(row.order),
        row.order.items.length.toString(),
        row.order.items
          .map((item) =>
            item.result.selectedFabric
              ? `${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
              : '',
          )
          .join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(deferredQuery);
    });

    return nextRows.sort((left, right) => {
      switch (sortMode) {
        case 'waste':
          return right.wastePercentage - left.wastePercentage;
        case 'cost':
          return right.summary.totalOrderCost - left.summary.totalOrderCost;
        case 'curtains':
          return right.summary.curtains - left.summary.curtains;
        default: {
          const lDate = new Date(left.order.createdAt || 0).getTime();
          const rDate = new Date(right.order.createdAt || 0).getTime();
          return (isNaN(rDate) ? 0 : rDate) - (isNaN(lDate) ? 0 : lDate);
        }
      }
    });
  }, [deferredQuery, reportRows, sortMode, dateRange, statusFilter]);

  const filteredOrders = useMemo(() => filteredRows.map((r) => r.order), [filteredRows]);
  const globalSummary = useMemo(() => summarizeOrdersProduction(filteredOrders), [filteredOrders]);

  const exportableSageOrders = useMemo(
    () => filteredOrders.filter((order) => getSageExportableLineCount([order]) > 0),
    [filteredOrders],
  );

  const selectedRow =
    filteredRows.find((row) => row.order.id === store.selectedOrderId) ??
    filteredRows[0] ??
    null;

  const orderBOM = useMemo((): BOMItem[] => {
    if (!selectedRow) return [];
    const aggregated = new Map<string, BOMItem>();
    
    const isV3 = selectedRow.order.items.some(i => i.materialLines && i.materialLines.length > 0);

    if (isV3) {
      for (const item of selectedRow.order.items) {
        if (!item.materialLines) continue;
        for (const line of item.materialLines) {
          const sku = line.sageItemCode || line.itemCode;
          const existing = aggregated.get(sku);
          if (existing) {
            aggregated.set(sku, {
              ...existing,
              cantidadCalculada: parseFloat((existing.cantidadCalculada + line.quantity).toFixed(3)),
            });
          } else {
            aggregated.set(sku, {
              componente: line.description,
              skuBase: sku,
              skuFinal: sku,
              unidad: line.unit,
              cantidadCalculada: line.quantity,
              regla: ''
            });
          }
        }
      }
      return Array.from(aggregated.values());
    }

    for (const item of selectedRow.order.items) {
      const tone = item.input.hardwareTone ?? deriveAutoTone(item.input.fabricColor ?? '');
      const mounting = item.input.mountingSystem ?? 'standard';
      try {
        const bom = generateRollerBOM(
          item.input.widthMeters,
          item.input.heightMeters,
          tone as import('../../../logic/generateRollerBOM').Tone,
          mounting
        );
        for (const bomItem of bom.items) {
          const existing = aggregated.get(bomItem.skuFinal);
          if (existing) {
            aggregated.set(bomItem.skuFinal, {
              ...existing,
              cantidadCalculada: parseFloat((existing.cantidadCalculada + bomItem.cantidadCalculada).toFixed(3)),
            });
          } else {
            aggregated.set(bomItem.skuFinal, { ...bomItem });
          }
        }
      } catch { /* skip */ }
    }
    return Array.from(aggregated.values());
  }, [selectedRow]);

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

  const getClientReference = (order: SavedOrder) => {
    // clientName y clientReference no existen en el modelo base actual.
    // Usamos orderNumber u otro identificador si lo hubiera.
    return order.orderNumber || 'Sin referencia';
  };

  const getMainFabricLabel = (order: SavedOrder) => {
    const fabrics = Array.from(new Set(order.items.map(i => i.result.selectedFabric?.color).filter(Boolean)));
    if (fabrics.length === 0) return 'Sin tela';
    if (fabrics.length === 1) return `Tela: ${fabrics[0]}`;
    return 'Múltiples telas';
  };

  // Helper for rendering modal details
  const renderOrderDetails = () => {
    if (!selectedOrderModal) return null;
    const row = selectedOrderModal;
    const orderStatus = getOrderStatus(row.order);

    return (
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedOrderModal(null); }}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Detalles: {row.order.orderNumber || `#${row.order.id.slice(0, 6)}`}</h2>
            <button className="modal-close-btn" onClick={() => setSelectedOrderModal(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="modal-body">
            <div className="order-kpi-row" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <div className="order-kpi-card" style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
                <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Piezas</span>
                <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700 }}>{row.summary.curtains}</span>
              </div>
              <div className="order-kpi-card" style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
                <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Costo Mat.</span>
                <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700 }}>${formatNumber(row.summary.totalOrderCost)}</span>
              </div>
              <div className={`order-kpi-card ${row.wastePercentage > 40 ? 'order-kpi-card--critical' : ''}`} style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
                <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Merma ✂️</span>
                <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700, color: row.wastePercentage > 40 ? 'var(--danger)' : 'inherit' }}>{formatNumber(row.wastePercentage)}%</span>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined">build</span> Herrajes / BOM
              </h3>
              {orderBOM.length > 0 ? (
                <table className="orders-data-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'right' }}>Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderBOM.map((item: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{bomDisplayLabel(item.componente, item.skuFinal)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{item.skuFinal}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {item.unidad === 'm' ? `${(item.cantidadCalculada * M_TO_FT).toFixed(2)} ft` : `${item.cantidadCalculada} EA`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--muted)' }}>No hay componentes calculados.</p>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined">straighten</span> Dimensiones de Piezas
              </h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {row.order.items.map((item: any, index: number) => (
                  <div key={item.id} style={{ border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', background: 'var(--surface-container)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      Cortina {index + 1} - {formatNumber(item.input.widthMeters)} x {formatNumber(item.input.heightMeters)} m
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                      {item.result.selectedFabric ? `${item.result.selectedFabric.itemCode} - ${item.result.selectedFabric.color}` : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '13px' }}>
                      {item.reusedWastePiece ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>✓ Usa retazo ({formatNumber(item.reusedWastePiece.widthMeters)} x {formatNumber(item.reusedWastePiece.heightMeters)}m)</span>
                      ) : (
                        <span>Rollo: {formatNumber(item.result.recommendedRollWidthMeters)}m | Merma: {formatNumber(item.result.wastePercentage)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" variant="secondary" onClick={async () => {
              try {
                const { generateOrderMaterialsPdf } = await import('../../../lib/pdf/generateOrderMaterialsPdf');
                await generateOrderMaterialsPdf(row.order, store.productionInventory, store.inventoryMovements);
                if (isReadOnly) return;
                let newStatus = orderStatus;
                if (orderStatus === 'ready_for_production') {
                  newStatus = 'in_production';
                } else if (orderStatus === 'draft') {
                  const hasValidMaterialLines = row.order.items.some(
                    (item) => item.materialLines && item.materialLines.length > 0
                  );
                  if (hasValidMaterialLines) {
                    newStatus = 'in_production';
                  }
                }
                if (newStatus !== orderStatus) {
                  store.updateSavedOrderStatus(row.order.id, newStatus as any, {
                    productionStartedAt: new Date().toISOString(),
                    productionStartTrigger: 'materials_pdf_generated'
                  });
                }
              } catch (err: any) { alert(err.message); }
            }}>
              📄 PDF
            </Button>
            {orderStatus === 'ready_for_production' && (
              <Button type="button" variant="secondary" onClick={() => store.updateSavedOrderStatus(row.order.id, 'in_production')} disabled={isReadOnly}>
                Pasar a Producción
              </Button>
            )}
            {['ready_for_production', 'in_production', 'draft', 'materials_checked'].includes(orderStatus) && (
              <Button type="button" variant="secondary" onClick={() => setReviewingOrderId(row.order.id)}>
                👀 Materiales
              </Button>
            )}
            {orderStatus === 'sent_to_sage' && (
              <Button type="button" variant="secondary" onClick={() => store.updateSavedOrderStatus(row.order.id, 'materials_checked')} disabled={isReadOnly}>
                🔙 Revertir a Revisado
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="orders-table-container" onClick={() => setActionMenuOpenId(null)}>
      <div className="orders-table-header">
        <div className="orders-table-title">
          <h1>Órdenes de Producción</h1>
        </div>
        <div className="orders-table-actions">
          <div className="orders-search-bar">
            <span className="material-symbols-outlined" style={{color: 'var(--muted)'}}>search</span>
            <input 
              type="text" 
              placeholder="Buscar órdenes..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select 
            className="orders-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="ready_for_production">Lista para prod.</option>
            <option value="in_production">En producción</option>
            <option value="materials_checked">Revisada</option>
            <option value="sent_to_sage">Sage</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
          <Button variant="secondary" onClick={onExportSage} disabled={exportableSageOrders.length === 0 || isReadOnly}>
            Exportar a Sage ({exportableSageOrders.length})
          </Button>
          <Button variant="primary" onClick={() => {
            alert('Para nueva orden, navega a la pestaña de Cotizador e ingresa los datos.');
          }}>
            <span className="material-symbols-outlined" style={{fontSize: 18, marginRight: 4}}>add</span>
            Nueva Orden
          </Button>
        </div>
      </div>

      <div className="orders-data-table-wrapper">
        <table className="orders-data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Cliente / Referencia</th>
              <th>Quantity</th>
              <th>Date</th>
              <th>Status</th>
              <th style={{textAlign: 'right'}}>Actions</th>
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

                let syncIcon = null;
                const syncStatus = store.syncMetadata[row.order.id];
                if (syncStatus) {
                  if (syncStatus.status === 'pending') syncIcon = <span title="Pendiente de subir" style={{ marginLeft: 6, fontSize: '14px' }}>⏳</span>;
                  else if (syncStatus.status === 'error') syncIcon = <span title="Error al sincronizar" style={{ marginLeft: 6, fontSize: '14px' }}>🔴</span>;
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
                      <button 
                        className="action-menu-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuOpenId(isMenuOpen ? null : row.order.id);
                        }}
                      >
                        <span className="material-symbols-outlined">more_horiz</span>
                      </button>
                      
                      {isMenuOpen && (
                        <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
                          <button className="action-dropdown-item" onClick={() => {
                            setSelectedOrderModal(row);
                            store.setSelectedOrderId(row.order.id);
                            setActionMenuOpenId(null);
                          }}>
                            <span className="material-symbols-outlined">visibility</span> Ver detalles
                          </button>
                          
                          {status === 'draft' && (
                            <button className="action-dropdown-item" onClick={() => {
                              store.setOrderDraft(() => ({
                                orderNumber: row.order.orderNumber,
                                items: row.order.items
                              }));
                              alert('Orden cargada. Por favor navega a la pestaña de Cotizador para continuar.');
                              setActionMenuOpenId(null);
                            }} disabled={isReadOnly}>
                              <span className="material-symbols-outlined">edit</span> Editar orden
                            </button>
                          )}

                          <button className="action-dropdown-item" onClick={async () => {
                            setActionMenuOpenId(null);
                            try {
                              const { generateOrderMaterialsPdf } = await import('../../../lib/pdf/generateOrderMaterialsPdf');
                              await generateOrderMaterialsPdf(row.order, store.productionInventory, store.inventoryMovements);
                              if (isReadOnly) return;
                              let newStatus = status;
                              if (status === 'ready_for_production') {
                                newStatus = 'in_production';
                              } else if (status === 'draft') {
                                const hasValidMaterialLines = row.order.items.some(
                                  (item) => item.materialLines && item.materialLines.length > 0
                                );
                                if (hasValidMaterialLines) {
                                  newStatus = 'in_production';
                                }
                              }
                              if (newStatus !== status) {
                                store.updateSavedOrderStatus(row.order.id, newStatus as any, {
                                  productionStartedAt: new Date().toISOString(),
                                  productionStartTrigger: 'materials_pdf_generated'
                                });
                              }
                            } catch (err: any) { alert(err.message); }
                          }}>
                            <span className="material-symbols-outlined">picture_as_pdf</span> Ver PDF
                          </button>

                          {status === 'ready_for_production' && (
                            <button className="action-dropdown-item" onClick={() => {
                              store.updateSavedOrderStatus(row.order.id, 'in_production');
                              setActionMenuOpenId(null);
                            }} disabled={isReadOnly}>
                              <span className="material-symbols-outlined">play_arrow</span> Pasar a Producción
                            </button>
                          )}

                          {['ready_for_production', 'in_production', 'draft', 'materials_checked'].includes(status) && (
                            <button className="action-dropdown-item" onClick={() => {
                              setReviewingOrderId(row.order.id);
                              setActionMenuOpenId(null);
                            }}>
                              <span className="material-symbols-outlined">inventory</span> Confirmar Materiales
                            </button>
                          )}

                          {status === 'sent_to_sage' && (
                            <button className="action-dropdown-item" onClick={() => {
                              store.updateSavedOrderStatus(row.order.id, 'materials_checked');
                              setActionMenuOpenId(null);
                            }} disabled={isReadOnly}>
                              <span className="material-symbols-outlined">undo</span> Revertir a Revisado
                            </button>
                          )}
                          
                          <button className="action-dropdown-item danger" onClick={() => {
                            setDeletingOrderId(row.order.id);
                            setActionMenuOpenId(null);
                          }} disabled={isReadOnly}>
                            <span className="material-symbols-outlined">delete</span> Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        
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
      </div>

      {renderOrderDetails()}

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
            </div>
            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={() => setDeletingOrderId(null)}>Cancelar</Button>
              <Button 
                type="button" 
                variant="danger" 
                style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                onClick={() => {
                  store.deleteSavedOrder(deletingOrderId);
                  setDeletingOrderId(null);
                }}
                disabled={isReadOnly}
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
