import { useDeferredValue, useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { SavedOrder } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeOrdersProduction, summarizeProduction } from '../../../lib/production';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { downloadSavedOrders, importSavedOrdersFile } from '../../../lib/orderTransfer';

interface OrderReportRow {
  order: SavedOrder;
  summary: ReturnType<typeof summarizeProduction>;
  wastePercentage: number;
  reusePercentage: number;
}

type WasteLevel = 'healthy' | 'warning' | 'critical';
type OrderSortMode = 'recent' | 'waste' | 'cost' | 'curtains';

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
  const globalSummary = summarizeOrdersProduction(store.savedOrders);
  const totalLinealWaste = globalSummary.tube.wasteFeet + globalSummary.bottom.wasteFeet;
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<OrderSortMode>('recent');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredRows = useMemo(() => {
    const nextRows = reportRows.filter((row) => {
      if (!deferredQuery) {
        return true;
      }

      const searchable = [
        row.order.orderNumber,
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
  }, [deferredQuery, reportRows, sortMode]);

  const selectedRow =
    filteredRows.find((row) => row.order.id === store.selectedOrderId) ??
    filteredRows[0] ??
    null;
  const selectedWasteLevel = selectedRow ? getWasteLevel(selectedRow.wastePercentage) : 'healthy';

  // % Retazo utilizado: área total cubierta con retazos / área total producida
  const totalReusedArea = store.savedOrders
    .flatMap((order) => order.items)
    .reduce((sum, item) => sum + (item.reusedWastePiece?.areaM2 ?? 0), 0);
  const reusePercentage = getReusePercentage(totalReusedArea, globalSummary.curtainAreaM2);
  const reuseLevel = getReuseLevel(reusePercentage);

  // % Merma promedio global (para la cabecera)
  const globalAvgWaste =
    reportRows.length === 0
      ? 0
      : reportRows.reduce((sum, row) => sum + row.wastePercentage, 0) / reportRows.length;
  const globalAvgWasteLevel = getWasteLevel(globalAvgWaste);

  // Merma Real global = wasteM2 / (fabricDownloaded + totalReused)
  const realWastePercentage = getRealWastePercentage(
    globalSummary.fabricWasteM2,
    globalSummary.fabricDownloadedM2,
    totalReusedArea,
  );
  const realWasteLevel = getWasteLevel(realWastePercentage);

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

  // % Retazo utilizado per-order (para el detail panel)
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
        <strong>Merma {getWasteLabel(selectedWasteLevel).toLowerCase()}</strong>
        <span>
          Esta orden registra {formatNumber(selectedRow.wastePercentage)} % de merma de tela.
        </span>
      </div>

      <div className="orders-detail-strip">
        <article className="summary-card">
          <span>Fecha</span>
          <strong>{getRelativeDateLabel(selectedRow.order.createdAt)}</strong>
          <small>{formatDate(selectedRow.order.createdAt)}</small>
        </article>
        <article className="summary-card">
          <span>Cortinas</span>
          <strong>{selectedRow.summary.curtains}</strong>
          <small>Items en esta orden</small>
        </article>
        <article className="summary-card">
          <span>Tela nueva</span>
          <strong>{formatNumber(selectedRow.summary.fabricDownloadedM2)} m2</strong>
          <small>Descargada desde rollo</small>
        </article>
        <article className="summary-card summary-card--efficiency">
          <span>% Uso de retazo</span>
          <strong>{formatNumber(orderReusePercentage)} %</strong>
          <span
            className={['waste-indicator', `waste-indicator--${orderReuseLevel}`].join(' ')}
          >
            {getReuseLabel(orderReuseLevel)}
          </span>
          <small>{formatNumber(reusedWasteArea)} m2 reutilizados</small>
        </article>
        <article className="summary-card">
          <span>Costo total</span>
          <strong>${formatNumber(selectedRow.summary.totalOrderCost)}</strong>
          <small>{selectedRow.summary.curtains === 0 ? '$0' : `$${formatNumber(selectedRow.summary.totalOrderCost / selectedRow.summary.curtains)}`} por cortina</small>
        </article>
      </div>

      <details className="project-detail-block" open>
        <summary>Resumen tecnico</summary>
        <div className="orders-detail-grid">
          <article className="summary-card">
            <span>Metraje terminado</span>
            <strong>{formatNumber(selectedRow.summary.curtainAreaM2)} m2</strong>
          </article>
          <article className="summary-card">
            <span>Merma tela</span>
            <strong>{formatNumber(selectedRow.summary.fabricWasteM2)} m2</strong>
            <small>{formatNumber(selectedRow.wastePercentage)} %</small>
          </article>
          <article className="summary-card">
            <span>Merma de corte</span>
            <strong>{formatNumber(selectedRow.wastePercentage)} %</strong>
            <small>Solo tela nueva del rollo</small>
          </article>
          <article className="summary-card">
            <span>Retazos usados</span>
            <strong>{selectedRow.summary.reusedWasteCurtains}</strong>
            <small>{formatNumber(reusedWasteArea)} m2 reutilizados</small>
          </article>
        </div>
      </details>

      <details className="project-detail-block" open>
        <summary>Costos y desperdicio</summary>
        <div className="orders-detail-grid">
          <article className="summary-card">
            <span>Costo total</span>
            <strong>${formatNumber(selectedRow.summary.totalOrderCost)}</strong>
          </article>
          <article className="summary-card">
            <span>Costo tela</span>
            <strong>${formatNumber(selectedRow.summary.fabricDownloadedCost)}</strong>
          </article>
          <article className="summary-card">
            <span>Costo util</span>
            <strong>
              $
              {formatNumber(
                selectedRow.order.items.reduce(
                  (sum, item) => sum + item.result.fabricUsefulCost,
                  0,
                ),
              )}
            </strong>
          </article>
          <article className="summary-card">
            <span>Costo merma</span>
            <strong>${formatNumber(selectedRow.summary.fabricWasteCost)}</strong>
            <small>
              {selectedRow.summary.fabricSavingsCost > 0
                ? `Ahorro ${formatNumber(selectedRow.summary.fabricSavingsCost)}`
                : 'Sin ahorro por retazo'}
            </small>
          </article>
          <article className="summary-card">
            <span>Costo componentes</span>
            <strong>${formatNumber(selectedRow.summary.fixedComponentsCost)}</strong>
          </article>
        </div>

        <div className="component-summary">
          <h4>Componentes</h4>
          <div className="component-summary__list component-summary__list--compact">
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
                <span>
                  Tela nueva {formatNumber(item.result.fabricDownloadedM2)} m2 - rollo{' '}
                  {formatNumber(item.result.recommendedRollWidthMeters)} m
                </span>
                <span>
                  Merma {formatNumber(item.result.wasteM2)} m2 -{' '}
                  {formatNumber(item.result.wastePercentage)} %
                </span>
                <span>
                  Costo total ${formatNumber(item.result.fabricDownloadedCost)} - util $
                  {formatNumber(item.result.fabricUsefulCost)} - merma $
                  {formatNumber(item.result.fabricWasteCost)}
                </span>
                {item.reusedWastePiece ? (
                  <span>
                    Retazo usado {formatNumber(item.reusedWastePiece.widthMeters)} x{' '}
                    {formatNumber(item.reusedWastePiece.heightMeters)} m
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </details>
    </motion.div>
  ) : (
    <p className="history-panel__empty">
      Selecciona una orden para ver su resumen y detalle.
    </p>
  );

  return (
    <section className="orders-report-layout orders-report-layout--phone">
      {/* ── Panel izquierdo: lista de órdenes ── */}
      <Card className="saved-orders-panel orders-report-panel orders-report-panel--phone">
        <div className="results-header results-header--phone">
          <div>
            <span className="section-heading__eyebrow">Ordenes</span>
            <h2>Resumen de produccion</h2>
          </div>
          <div className="saved-orders-actions saved-orders-actions--phone">
            <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
              Importar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => downloadSavedOrders(store.savedOrders)}
              disabled={store.savedOrders.length === 0}
            >
              Exportar
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

            {/* ── Cambio 1: Resumen colapsable ── */}
            <div className="orders-summary-top orders-summary-top--4col">
              <article className="summary-card summary-card--accent">
                <MetricInfo
                  label="Ordenes"
                  message="Cantidad total de ordenes guardadas en este resumen."
                />
                <strong>{store.savedOrders.length}</strong>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="% Merma"
                  message="Promedio del porcentaje de merma de corte por orden. Se calcula sobre tela nueva descargada del rollo: merma m2 / tela nueva m2."
                />
                <strong>{formatNumber(globalAvgWaste)} %</strong>
                <small
                  className={['waste-indicator', `waste-indicator--${globalAvgWasteLevel}`].join(' ')}
                >
                  {getWasteLabel(globalAvgWasteLevel)}
                </small>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="% Uso"
                  message="Porcentaje de la produccion total que fue cubierta con retazos. Se calcula como area reutilizada / area total producida."
                />
                <strong>{formatNumber(reusePercentage)} %</strong>
                <small
                  className={['waste-indicator', `waste-indicator--${reuseLevel}`].join(' ')}
                >
                  {getReuseLabel(reuseLevel)}
                </small>
              </article>
              <article className="summary-card">
                <MetricInfo
                  label="% Merma real"
                  message="Desperdicio real sobre todos los recursos textiles usados. Se calcula como merma m2 / (tela nueva m2 + retazos reutilizados m2)."
                />
                <strong>{formatNumber(realWastePercentage)} %</strong>
                <small
                  className={['waste-indicator', `waste-indicator--${realWasteLevel}`].join(' ')}
                >
                  {getWasteLabel(realWasteLevel)}
                </small>
              </article>
            </div>

            <button
              type="button"
              className="orders-summary-toggle"
              onClick={() => setSummaryExpanded((prev) => !prev)}
            >
              {summaryExpanded ? 'Ocultar detalles del resumen ▲' : 'Ver detalles del resumen ▼'}
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
                      <span>Cortinas</span>
                      <strong>{globalSummary.curtains}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Metraje cortina</span>
                      <strong>{formatNumber(globalSummary.curtainAreaM2)} m2</strong>
                    </article>
                    <article className="summary-card">
                      <span>Tela nueva</span>
                      <strong>{formatNumber(globalSummary.fabricDownloadedM2)} m2</strong>
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
                      <span>Merma tela</span>
                      <strong>{formatNumber(globalSummary.fabricWasteM2)} m2</strong>
                      <small>{formatNumber(globalSummary.fabricWastePercentage)} % general</small>
                    </article>
                    <article className="summary-card">
                      <span>Merma lineal</span>
                      <strong>{formatNumber(totalLinealWaste)} pies</strong>
                      <small>
                        Tubo {formatNumber(globalSummary.tube.wasteFeet)} / Bottom{' '}
                        {formatNumber(globalSummary.bottom.wasteFeet)}
                      </small>
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
                        <span className={['waste-indicator', `waste-indicator--${wasteLevel}`].join(' ')}>
                          {getWasteLabel(wasteLevel)}
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
