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

function OrderListItem({ row, isActive, syncStatus, onClick }: { row: OrderReportRow, isActive: boolean, syncStatus?: import('../store/types').SyncStatus, onClick: () => void }) {
  const status = getOrderStatus(row.order);

  let syncIcon = null;
  if (syncStatus) {
    if (syncStatus.status === 'pending') {
      syncIcon = <span title="Pendiente de subir" style={{ marginLeft: 6, fontSize: '0.9em' }}>⏳</span>;
    } else if (syncStatus.status === 'error') {
      syncIcon = <span title={`Error: ${syncStatus.errorMessage || 'No se pudo sincronizar'}`} style={{ marginLeft: 6, fontSize: '0.9em' }}>🔴</span>;
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
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const reviewingOrder = useMemo(() => store.savedOrders.find(o => o.id === reviewingOrderId) ?? null, [store.savedOrders, reviewingOrderId]);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

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

      if (!deferredQuery) {
        return true;
      }

      const searchable = [
        row.order.orderNumber,
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
        default:
          return new Date(right.order.createdAt).getTime() - new Date(left.order.createdAt).getTime();
      }
    });
  }, [deferredQuery, reportRows, sortMode, dateRange]);

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

  const status = selectedRow ? getOrderStatus(selectedRow.order) : 'draft';

  return (
    <section className="orders-layout-split">
      
      {/* ── LEFT PANEL ── */}
      <div className="orders-panel-left">
        <div className="orders-panel-left__header">
          <h1>Órdenes de Producción</h1>
          <p>Gestiona, revisa y exporta órdenes a producción o Sage.</p>

          {isReadOnly && (
            <div className="alert alert--neutral" style={{ padding: '8px 12px', marginTop: '10px', marginBottom: '10px', fontSize: '0.82rem' }}>
              🔒 <strong>Solo Lectura:</strong> Las acciones de modificación y exportación están deshabilitadas.
            </div>
          )}

          <div className="orders-global-actions">
            <button onClick={async () => {
              try {
                const { generateSubstitutionPdf } = await import('../../../lib/pdf/generateSubstitutionPdf');
                await generateSubstitutionPdf();
              } catch (err: any) {
                alert(err.message || 'Error al generar la hoja de sustituciones.');
              }
            }}>
              <span>📄</span> Hoja Sustituciones
            </button>
            <button onClick={() => downloadCsvReport(filteredOrders)} disabled={filteredOrders.length === 0}>
              <span>📊</span> CSV
            </button>
            <button onClick={onExportSage} disabled={isReadOnly || exportableSageOrders.length === 0}>
              <span>📦</span> Sage ({exportableSageOrders.length})
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isReadOnly}>
              <span>📥</span> Importar
            </button>
            <button onClick={() => downloadSavedOrders(store.savedOrders)} disabled={store.savedOrders.length === 0}>
              <span>💾</span> Backup
            </button>
          </div>

          <div className="orders-global-filters">
            <div className="filter-row">
              <input 
                type="text" 
                placeholder="Buscar por # de orden..." 
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', color: 'var(--text)' }}
              />
            </div>
            <div className="filter-row">
              <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', color: 'var(--text)' }}>
                <option value="all">Cualquier Fecha</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>
              <select value={sortMode} onChange={e => setSortMode(e.target.value as OrderSortMode)} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', color: 'var(--text)' }}>
                <option value="recent">Más recientes</option>
                <option value="waste">Mayor Merma</option>
                <option value="cost">Mayor Costo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="orders-global-kpis">
          <div className="kpi-col">
            <span>Órdenes</span>
            <span>{filteredOrders.length}</span>
          </div>
          <div className="kpi-divider"></div>
          <div className="kpi-col">
            <span>Piezas Totales</span>
            <span>{globalSummary.curtains}</span>
          </div>
          <div className="kpi-divider"></div>
          <div className="kpi-col">
            <span>Costo Total</span>
            <span>${formatNumber(globalSummary.totalOrderCost)}</span>
          </div>
        </div>

        <div className="orders-list-scroll">
          {filteredRows.length === 0 ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: '32px' }}>No hay órdenes que coincidan con los filtros.</p>
          ) : (
            filteredRows.map((row) => (
              <OrderListItem 
                key={row.order.id} 
                row={row} 
                isActive={selectedRow?.order.id === row.order.id} 
                syncStatus={store.syncMetadata[row.order.id]}
                onClick={() => store.setSelectedOrderId(row.order.id)} 
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="orders-panel-right">
        {selectedRow ? (
          <>
            <div className="orders-detail-header">
              <div className="orders-detail-header__title">
                <h2>{selectedRow.order.orderNumber || `#${selectedRow.order.id.slice(0, 6)}`}</h2>
                <StatusBadge status={status} />
              </div>
            </div>

            <div className="orders-detail-scroll">
              {status === 'sent_to_sage' && (
                <div className="sage-alert">
                  <span className="icon">✓</span>
                  <div>
                    <p>Ya enviada a Sage</p>
                    <p className="sub">Esta orden ya fue exportada para facturación. Si necesitas re-exportar, regresa su estado.</p>
                  </div>
                </div>
              )}

              <div className="order-kpi-row">
                <div className="order-kpi-card">
                  <span className="label">Piezas</span>
                  <span className="val">{selectedRow.summary.curtains}</span>
                </div>
                <div className="order-kpi-card">
                  <span className="label">Costo Mat.</span>
                  <span className="val">${formatNumber(selectedRow.summary.totalOrderCost)}</span>
                </div>
                <div className={`order-kpi-card ${selectedRow.wastePercentage > 40 ? 'order-kpi-card--critical' : ''}`}>
                  <span className="label">Merma <span className="icon">✂️</span></span>
                  <span className="val">{formatNumber(selectedRow.wastePercentage)}%</span>
                </div>
                <div className="order-kpi-card">
                  <span className="label">Retazos</span>
                  <span className="val">{selectedRow.summary.reusedWasteCurtains}</span>
                </div>
              </div>

              <div className="order-accordions">
                <button className="order-accordion-btn" onClick={() => setAccBOM(!accBOM)}>
                  <div className="order-accordion-btn__left">
                    <span>🔩</span> Herrajes / BOM
                  </div>
                  <div className="order-accordion-btn__right">
                    <span className="accordion-badge">{orderBOM.length}</span>
                    <span>{accBOM ? '▲' : '▼'}</span>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {accBOM && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                      <div>
                        {orderBOM.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                              <tr>
                                <th style={{ padding: '16px 12px 8px 24px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, background: 'var(--surface-soft)' }}>Componente</th>
                                <th style={{ padding: '16px 12px 8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, background: 'var(--surface-soft)' }}>SKU</th>
                                <th style={{ padding: '16px 24px 8px 12px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, background: 'var(--surface-soft)' }}>Cant.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderBOM.map((item, i) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                                  <td style={{ padding: '8px 12px 8px 24px' }}>
                                    <div style={{ fontWeight: 600 }}>{bomDisplayLabel(item.componente, item.skuFinal)}</div>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{item.skuFinal}</td>
                                  <td style={{ padding: '8px 24px 8px 12px', textAlign: 'right', fontWeight: 600 }}>
                                    {item.unidad === 'm' ? `${(item.cantidadCalculada * M_TO_FT).toFixed(2)} ft` : `${item.cantidadCalculada} EA`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: 'var(--muted)', padding: '16px 24px' }}>No hay componentes calculados.</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button className="order-accordion-btn" onClick={() => setAccPieces(!accPieces)}>
                  <div className="order-accordion-btn__left">
                    <span>📏</span> Dimensiones de Piezas
                  </div>
                  <div className="order-accordion-btn__right">
                    <span className="accordion-badge">{selectedRow.order.items.length}</span>
                    <span>{accPieces ? '▲' : '▼'}</span>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {accPieces && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '16px 24px', display: 'grid', gap: '12px' }}>
                        {selectedRow.order.items.map((item, index) => (
                          <div key={item.id} style={{ border: '1px solid var(--line)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                              Cortina {index + 1} - {formatNumber(item.input.widthMeters)} x {formatNumber(item.input.heightMeters)} m
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                              {item.result.selectedFabric ? `${item.result.selectedFabric.itemCode} - ${item.result.selectedFabric.color}` : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                              {item.reusedWastePiece ? (
                                <span style={{ color: '#059669', fontWeight: 600 }}>✓ Usa retazo ({formatNumber(item.reusedWastePiece.widthMeters)} x {formatNumber(item.reusedWastePiece.heightMeters)}m)</span>
                              ) : (
                                <span>Rollo: {formatNumber(item.result.recommendedRollWidthMeters)}m | Merma: {formatNumber(item.result.wastePercentage)}%</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="orders-bottom-bar">
              <Button type="button" variant="secondary" onClick={async () => {
                try {
                  const { generateOrderMaterialsPdf } = await import('../../../lib/pdf/generateOrderMaterialsPdf');
                  await generateOrderMaterialsPdf(selectedRow.order, store.productionInventory, store.inventoryMovements);
                  
                  if (isReadOnly) return;

                  let newStatus = status;
                  if (status === 'ready_for_production') {
                    newStatus = 'in_production';
                  } else if (status === 'draft') {
                    const hasValidMaterialLines = selectedRow.order.items.some(
                      (item) => item.materialLines && item.materialLines.length > 0
                    );
                    if (hasValidMaterialLines) {
                      newStatus = 'in_production';
                    }
                  }

                  if (newStatus !== status) {
                    store.updateSavedOrderStatus(selectedRow.order.id, newStatus as any, {
                      productionStartedAt: new Date().toISOString(),
                      productionStartTrigger: 'materials_pdf_generated'
                    });
                  }
                } catch (err: any) { alert(err.message); }
              }}>
                📄 PDF
              </Button>

              {status === 'ready_for_production' && (
                <Button type="button" variant="secondary" onClick={() => store.updateSavedOrderStatus(selectedRow.order.id, 'in_production')} disabled={isReadOnly}>
                  Pasar a Producción
                </Button>
              )}

              {['ready_for_production', 'in_production', 'draft', 'materials_checked'].includes(status) && (
                <Button type="button" variant="secondary" onClick={() => setReviewingOrderId(selectedRow.order.id)}>
                  👀 Materiales
                </Button>
              )}

              {status === 'sent_to_sage' && (
                <Button type="button" variant="secondary" onClick={() => store.updateSavedOrderStatus(selectedRow.order.id, 'materials_checked')} disabled={isReadOnly}>
                  🔙 Revertir a Revisado
                </Button>
              )}

              <Button 
                type="button" 
                variant="danger" 
                style={{ color: '#ef4444', borderColor: '#ef4444' }} 
                onClick={() => setDeletingOrderId(selectedRow.order.id)}
                disabled={isReadOnly}
              >
                🗑️ Eliminar orden
              </Button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            Selecciona una orden para ver detalles
          </div>
        )}
      </div>

      {reviewingOrder && (
        <MaterialReviewModal order={reviewingOrder} onClose={() => setReviewingOrderId(null)} />
      )}
      
      {deletingOrderId && (
        <div 
          className="orders-delete-modal-overlay" 
          role="dialog" 
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletingOrderId(null);
          }}
        >
          <div className="orders-delete-modal">
            <div className="orders-delete-modal__header">
              <div className="orders-delete-modal__title-area">
                <div className="orders-delete-modal__icon">
                  🗑️
                </div>
                <div className="orders-delete-modal__texts">
                  <h3>¿Eliminar orden {store.savedOrders.find(o => o.id === deletingOrderId)?.orderNumber}?</h3>
                  <p>Esta acción eliminará la orden del historial local.</p>
                </div>
              </div>
              <button className="orders-delete-modal__close" onClick={() => setDeletingOrderId(null)}>×</button>
            </div>
            
            <div className="orders-delete-modal__body">
              <p>No modificará Sage ni los archivos ya exportados.</p>
              
              {store.savedOrders.find(o => o.id === deletingOrderId)?.status === 'sent_to_sage' && (
                <div className="orders-delete-modal__warning">
                  <span className="icon">⚠️</span>
                  <div className="orders-delete-modal__warning-texts">
                    <p>Orden ya enviada a Sage</p>
                    <p className="sub">Eliminarla de Luxia no revierte el descargo en Sage.</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="orders-delete-modal__footer">
              <Button type="button" variant="secondary" onClick={() => setDeletingOrderId(null)}>
                Cancelar
              </Button>
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
                Eliminar orden
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            importSavedOrdersFile(file)
              .then((imported) => store.importOrders(imported))
              .catch(() =>
                store.setErrors((prev) => ({
                  ...prev,
                  general: 'No se pudo importar el archivo de ordenes.',
                })),
              );
            event.target.value = '';
          }
        }}
      />
    </section>
  );
}
