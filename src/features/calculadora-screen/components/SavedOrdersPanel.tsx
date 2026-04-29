import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { SavedOrder } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeOrdersProduction, summarizeProduction } from '../../../lib/production';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { downloadSavedOrders, importSavedOrdersFile } from '../../../lib/orderTransfer';
import { downloadCsvReport } from '../../../lib/csvExport';
import {
  downloadSageOrderEntry,
  getSageExportableLineCount,
} from '../../../lib/sageExport';

interface OrderReportRow {
  order: SavedOrder;
  summary: ReturnType<typeof summarizeProduction>;
  wastePercentage: number;
  reusePercentage: number;
}

type WasteLevel = 'healthy' | 'warning' | 'critical';
type OrderSortMode = 'recent' | 'waste' | 'cost' | 'curtains';
type OrderStatusFilter = 'all' | 'pending' | 'sent_to_sage';
type DateRange = 'all' | 'today' | 'week' | 'month';

function getOrderStatus(order: SavedOrder) {
  return order.status ?? 'pending';
}

function getOrderStatusLabel(order: SavedOrder) {
  return getOrderStatus(order) === 'sent_to_sage' ? 'Completada' : 'Pendiente';
}

function getWasteLevel(wastePercentage: number): WasteLevel {
  if (wastePercentage > 50) return 'critical';
  if (wastePercentage >= 35) return 'warning';
  return 'healthy';
}

function getWasteLabel(level: WasteLevel) {
  switch (level) {
    case 'critical': return 'Critica';
    case 'warning':  return 'Alta';
    default:         return 'Sana';
  }
}

function getReuseLevel(pct: number): WasteLevel {
  if (pct > 20) return 'healthy';   // 🟢 mucho aprovechamiento
  if (pct >= 10) return 'warning';  // 🟡 aceptable
  return 'critical';                // 🔴 poco uso de retazos
}

function getReuseLabel(level: WasteLevel) {
  switch (level) {
    case 'healthy':  return 'Óptimo';
    case 'warning':  return 'Moderado';
    default:         return 'Bajo';
  }
}

function getReusePercentage(reusedArea: number, curtainArea: number) {
  return curtainArea === 0 ? 0 : (reusedArea / curtainArea) * 100;
}

function getRealWastePercentage(
  wasteArea: number,
  downloadedArea: number,
  reusedArea: number,
) {
  const totalMaterialUsed = downloadedArea + reusedArea;
  return totalMaterialUsed === 0 ? 0 : (wasteArea / totalMaterialUsed) * 100;
}

function MetricInfo({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  return (
    <span className="metric-label-with-info">
      <span>{label}</span>
      <span className="metric-info">
        <button
          type="button"
          className="metric-info__trigger"
          aria-label={`Informacion sobre ${label}`}
        >
          i
        </button>
        <span className="metric-info__tooltip" role="tooltip">
          {message}
        </span>
      </span>
    </span>
  );
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

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export function SavedOrdersPanel() {
  const store = useCalculatorStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reportRows = useMemo(() => store.savedOrders.map(getOrderReportRow), [store.savedOrders]);
  
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<OrderSortMode>('recent');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

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

      if (statusFilter !== 'all' && getOrderStatus(row.order) !== statusFilter) {
        return false;
      }

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
  }, [deferredQuery, reportRows, sortMode, statusFilter, dateRange]);

  const filteredOrders = useMemo(() => filteredRows.map((r) => r.order), [filteredRows]);
  const globalSummary = useMemo(() => summarizeOrdersProduction(filteredOrders), [filteredOrders]);

  const exportableSageOrders = useMemo(
    () => filteredOrders.filter((order) => getSageExportableLineCount([order]) > 0),
    [filteredOrders],
  );
  const sageLineCount = useMemo(
    () => getSageExportableLineCount(filteredOrders),
    [filteredOrders],
  );
  const totalLinealWaste = globalSummary.tube.wasteFeet + globalSummary.bottom.wasteFeet;

  const selectedRow =
    filteredRows.find((row) => row.order.id === store.selectedOrderId) ??
    filteredRows[0] ??
    null;
  const selectedWasteLevel = selectedRow ? getWasteLevel(selectedRow.wastePercentage) : 'healthy';

  const totalReusedArea = filteredOrders
    .flatMap((order) => order.items)
    .reduce((sum, item) => sum + (item.reusedWastePiece?.areaM2 ?? 0), 0);
  const grossWasteM2 = globalSummary.fabricWasteM2 + totalReusedArea;
  const scrapRecoveryPercentage = grossWasteM2 === 0 ? 0 : (totalReusedArea / grossWasteM2) * 100;
  const scrapRecoveryLevel = getReuseLevel(scrapRecoveryPercentage);

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const isMobile = useIsMobile(640);
  const detailMotion = isMobile
    ? {
        initial: { opacity: 0, y: 28 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 16 },
      }
    : {
        initial: { opacity: 0, x: 28 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 16 },
      };

  const reusedWasteArea = selectedRow
    ? selectedRow.order.items.reduce(
        (sum, item) => sum + (item.reusedWastePiece?.areaM2 ?? 0),
        0,
      )
    : 0;
  const orderReusePercentage = selectedRow
    ? getReusePercentage(reusedWasteArea, selectedRow.summary.curtainAreaM2)
    : 0;
  const orderReuseLevel = getReuseLevel(orderReusePercentage);

  const detailContent = selectedRow ? (
    <motion.div
      key={selectedRow.order.id}
      className="orders-detail-panel__content"
      initial={detailMotion.initial}
      animate={detailMotion.animate}
      exit={detailMotion.exit}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div
        className={[
          'orders-detail-alert',
          `orders-detail-alert--${selectedWasteLevel}`,
        ].join(' ')}
      >
        <strong>{getOrderStatusLabel(selectedRow.order)}</strong>
        <span>
          {getOrderStatus(selectedRow.order) === 'sent_to_sage'
            ? `Exportada a Sage${selectedRow.order.sageExportedAt ? ` el ${formatDate(selectedRow.order.sageExportedAt)}` : ''}. No se incluirá en futuros descargos.`
            : `Esta orden registra ${formatNumber(selectedRow.wastePercentage)} % de merma de tela y está pendiente de descargo.`}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem' }}>
            Orden {selectedRow.order.orderNumber || `#${selectedRow.order.id.slice(0, 6)}`}
          </h2>
          <span className={['order-status-pill', `order-status-pill--${getOrderStatus(selectedRow.order)}`].join(' ')}>
            {getOrderStatus(selectedRow.order) === 'sent_to_sage' ? 'Enviada a Sage' : 'Pendiente de descargo'}
          </span>
        </div>
        <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <strong>{getRelativeDateLabel(selectedRow.order.createdAt)}</strong>
          <br />
          {formatDate(selectedRow.order.createdAt)}
        </div>
      </div>

      <div className="orders-summary-top orders-summary-top--4col">
        <article className="summary-card summary-card--accent">
          <span>Producción</span>
          <strong>{selectedRow.summary.curtains}</strong>
          <small>{formatNumber(selectedRow.summary.curtainAreaM2)} m2 útiles</small>
        </article>
        <article className="summary-card">
          <span>Costo</span>
          <strong>${formatNumber(selectedRow.summary.totalOrderCost)}</strong>
          <small>Total materiales</small>
        </article>
        <article className="summary-card">
          <span>Merma</span>
          <strong>{formatNumber(selectedRow.wastePercentage)} %</strong>
          <small>Desperdicio tela</small>
        </article>
        <article className="summary-card summary-card--efficiency">
          <span>Retazos</span>
          <strong>{selectedRow.summary.reusedWasteCurtains}</strong>
          <small>
            {selectedRow.summary.fabricSavingsCost > 0
              ? `Ahorro $${formatNumber(selectedRow.summary.fabricSavingsCost)}`
              : 'Sin uso de retazo'}
          </small>
        </article>
      </div>

      <details className="project-detail-block">
        <summary>Componentes y tubos</summary>
        <div className="component-summary__list component-summary__list--compact" style={{ marginTop: '12px' }}>
          {selectedRow.summary.fixedComponents.map((component) => (
            <article
              key={`${component.name}-${component.unit}`}
              className="component-summary__item"
            >
              <span>
                {component.name} - {formatNumber(component.quantity, 0)} {component.unit}
              </span>
              <strong>${formatNumber(component.totalCost)}</strong>
            </article>
          ))}
        </div>
      </details>

      <details className="project-detail-block">
        <summary>Piezas de la orden ({selectedRow.order.items.length})</summary>
        <div className="project-list project-list--compact">
          {selectedRow.order.items.map((item, index) => (
            <article key={item.id} className="project-item">
              <div className="project-item__main">
                <strong>
                  Cortina {index + 1} - {formatNumber(item.input.widthMeters)} x{' '}
                  {formatNumber(item.input.heightMeters)} m
                </strong>
                <p>
                  {item.result.selectedFabric
                    ? `${item.result.selectedFabric.itemCode} - ${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
                    : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                </p>
                <div style={{ display: 'flex', gap: '8px', fontSize: '0.85rem', color: 'var(--muted)', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span>
                    <strong>Merma:</strong> {formatNumber(item.result.wastePercentage)}%
                  </span>
                  <span>|</span>
                  {item.reusedWastePiece ? (
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      ✓ Usa retazo ({formatNumber(item.reusedWastePiece.widthMeters)} x {formatNumber(item.reusedWastePiece.heightMeters)}m)
                    </span>
                  ) : (
                    <span>
                      <strong>Rollo:</strong> {formatNumber(item.result.recommendedRollWidthMeters)}m
                    </span>
                  )}
                </div>

              </div>
            </article>
          ))}
        </div>
      </details>

      <div className="order-status-actions">
        {getOrderStatus(selectedRow.order) === 'sent_to_sage' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => store.updateSavedOrderStatus(selectedRow.order.id, 'pending')}
          >
            Volver a pendiente
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => store.updateSavedOrderStatus(selectedRow.order.id, 'sent_to_sage')}
          >
            Marcar pasada a Sage
          </Button>
        )}
      </div>
    </motion.div>
  ) : (
    <p className="history-panel__empty">
      Selecciona una orden para ver su resumen y detalle.
    </p>
  );

  return (
    <section className="orders-report-layout orders-report-layout--phone">
      <Card className="saved-orders-panel orders-report-panel orders-report-panel--phone">
        <div className="results-header results-header--phone">
          <div>
            <span className="section-heading__eyebrow">Ordenes</span>
            <h2>Reporte de Produccion</h2>
          </div>
          <div className="saved-orders-actions saved-orders-actions--phone">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => downloadCsvReport(filteredOrders)}
              disabled={filteredOrders.length === 0}
            >
              Exportar CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                try {
                  const exportedOrderIds = exportableSageOrders.map((order) => order.id);
                  downloadSageOrderEntry(filteredOrders);
                  store.markOrdersSentToSage(exportedOrderIds);
                } catch (error) {
                  store.setErrors((prev) => ({
                    ...prev,
                    general:
                      error instanceof Error
                        ? error.message
                        : 'No se pudo generar el archivo para Sage.',
                  }));
                }
              }}
              disabled={filteredOrders.length === 0 || sageLineCount === 0}
            >
              Sage ({exportableSageOrders.length})
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
              Importar JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => downloadSavedOrders(store.savedOrders)}
              disabled={store.savedOrders.length === 0}
            >
              Backup
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
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

        {store.savedOrders.length === 0 ? (
          <p className="history-panel__empty">
            Aun no hay ordenes guardadas. Guarda una orden desde produccion.
          </p>
        ) : (
          <div className="orders-report-panel__scroll">
            <div className="orders-toolbar">
              <label className="field">
                <span>Buscar</span>
                <input
                  type="text"
                  placeholder="Orden, tela o cantidad"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Periodo</span>
                <select
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value as DateRange)}
                >
                  <option value="all">Historico (Todo)</option>
                  <option value="today">Hoy</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mes</option>
                </select>
              </label>
              <label className="field">
                <span>Ordenar</span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as OrderSortMode)}
                >
                  <option value="recent">Mas recientes</option>
                  <option value="waste">Mayor merma</option>
                  <option value="cost">Mayor costo</option>
                  <option value="curtains">Mas cortinas</option>
                </select>
              </label>
            </div>

            <div className="orders-summary-top orders-summary-top--4col">
              <article className="summary-card summary-card--accent">
                <MetricInfo
                  label="Cortinas"
                  message="Total de piezas terminadas en el periodo seleccionado."
                />
                <strong>{globalSummary.curtains}</strong>
                <small>En {filteredRows.length} ordenes</small>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="Costo"
                  message="Inversion total en materiales de las ordenes visibles."
                />
                <strong>${formatNumber(globalSummary.totalOrderCost)}</strong>
                <small>Prom. ${globalSummary.curtains === 0 ? 0 : formatNumber(globalSummary.totalOrderCost / globalSummary.curtains)}/cortina</small>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="% Uso"
                  message="Porcentaje de la merma total generada que logró ser rescatada y reutilizada. Formula: Area Reutilizada / (Merma Final + Area Reutilizada)."
                />
                <strong>{formatNumber(scrapRecoveryPercentage)} %</strong>
                <small
                  className={['waste-indicator', `waste-indicator--${scrapRecoveryLevel}`].join(' ')}
                >
                  {getReuseLabel(scrapRecoveryLevel)}
                </small>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="Área m²"
                  message="Area total de cortinas terminadas (no incluye merma)."
                />
                <strong>{formatNumber(globalSummary.curtainAreaM2)} m2</strong>
                <small>Superficie util</small>
              </article>
            </div>

            <button
              type="button"
              className="orders-summary-toggle"
              onClick={() => setSummaryExpanded((prev) => !prev)}
            >
              {summaryExpanded ? 'Ocultar detalles tecnicos ▲' : 'Ver detalles tecnicos ▼'}
            </button>

            <AnimatePresence initial={false}>
              {summaryExpanded && (
                <motion.div
                  key="summary-details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="orders-summary-details">
                    <article className="summary-card">
                      <span>Tela nueva</span>
                      <strong>{formatNumber(globalSummary.fabricDownloadedM2)} m2</strong>
                    </article>
                    <article className="summary-card">
                      <span>Merma tela</span>
                      <strong>{formatNumber(globalSummary.fabricWasteM2)} m2</strong>
                      <small>{formatNumber(globalSummary.fabricWastePercentage)} % corte</small>
                    </article>
                    <article className="summary-card">
                      <span>Merma lineal</span>
                      <strong>{formatNumber(totalLinealWaste)} pies</strong>
                      <small>
                        Tubo {formatNumber(globalSummary.tube.wasteFeet)} / Bottom{' '}
                        {formatNumber(globalSummary.bottom.wasteFeet)}
                      </small>
                    </article>
                    <article className="summary-card">
                      <span>Costo tela</span>
                      <strong>${formatNumber(globalSummary.fabricDownloadedCost)}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Componentes</span>
                      <strong>${formatNumber(globalSummary.fixedComponentsCost)}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Lineas Sage</span>
                      <strong>{sageLineCount}</strong>
                    </article>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {filteredRows.length === 0 ? (
              <p className="history-panel__empty">
                No encontramos ordenes con ese criterio.
              </p>
            ) : (
              <div className="orders-card-list">
                {filteredRows.map((row) => {
                  const wasteLevel = getWasteLevel(row.wastePercentage);
                  return (
                    <button
                      key={row.order.id}
                      type="button"
                      className={[
                        'orders-card',
                        selectedRow?.order.id === row.order.id ? 'orders-card--active' : '',
                        `orders-card--${wasteLevel}`,
                      ].join(' ')}
                      onClick={() => store.setSelectedOrderId(row.order.id)}
                    >
                      <div className="orders-card__top">
                        <div>
                          <strong>{row.order.orderNumber}</strong>
                          <span>{getRelativeDateLabel(row.order.createdAt)}</span>
                        </div>
                        <span
                          className={[
                            'order-status-pill',
                            `order-status-pill--${getOrderStatus(row.order)}`,
                          ].join(' ')}
                        >
                          {getOrderStatus(row.order) === 'sent_to_sage' ? 'Completada' : 'Pendiente'}
                        </span>
                      </div>

                      <div className="orders-card__metrics">
                        <article>
                          <span>Cortinas</span>
                          <strong>{row.summary.curtains}</strong>
                        </article>
                        <article>
                          <span>Costo</span>
                          <strong>${formatNumber(row.summary.totalOrderCost)}</strong>
                        </article>
                        <article>
                          <span>Merma</span>
                          <strong>{formatNumber(row.wastePercentage)} %</strong>
                        </article>
                        <article>
                          <span>Retazos</span>
                          <strong>{row.summary.reusedWasteCurtains}</strong>
                        </article>
                      </div>

                      <div className="orders-card__bottom">
                        <span>{formatNumber(row.summary.curtainAreaM2)} m2 terminados</span>
                        <span>{formatNumber(row.reusePercentage)} % reutilizado</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="saved-order-detail orders-detail-panel orders-detail-panel--phone">
        <div className="results-header">
          <div>
            <span className="section-heading__eyebrow">Detalle</span>
            <h2>{selectedRow?.order.orderNumber || 'Selecciona una orden'}</h2>
          </div>
          {selectedRow ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => store.deleteSavedOrder(selectedRow.order.id)}
            >
              Eliminar
            </Button>
          ) : null}
        </div>
        <AnimatePresence mode="wait">
          {detailContent}
        </AnimatePresence>
      </Card>
    </section>
  );
}
