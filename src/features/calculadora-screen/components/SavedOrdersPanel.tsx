import { useMemo, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { SavedOrder } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeOrdersProduction, summarizeProduction } from '../../../lib/production';

interface SavedOrdersPanelProps {
  orders: SavedOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onDeleteOrder: (id: string) => void;
  onExportOrders: () => void;
  onImportOrders: (file: File) => void;
}

interface OrderReportRow {
  order: SavedOrder;
  summary: ReturnType<typeof summarizeProduction>;
  wastePercentage: number;
}

type WasteLevel = 'healthy' | 'warning' | 'critical';

function getWasteLevel(wastePercentage: number): WasteLevel {
  if (wastePercentage > 50) {
    return 'critical';
  }

  if (wastePercentage >= 35) {
    return 'warning';
  }

  return 'healthy';
}

function getWasteLabel(level: WasteLevel) {
  switch (level) {
    case 'critical':
      return 'Critica';
    case 'warning':
      return 'Alta';
    default:
      return 'Sana';
  }
}

function getOrderReportRow(order: SavedOrder): OrderReportRow {
  const summary = summarizeProduction(order.items);
  return {
    order,
    summary,
    wastePercentage:
      summary.fabricDownloadedM2 === 0
        ? 0
        : (summary.fabricWasteM2 / summary.fabricDownloadedM2) * 100,
  };
}

export function SavedOrdersPanel({
  orders,
  selectedOrderId,
  onSelectOrder,
  onDeleteOrder,
  onExportOrders,
  onImportOrders,
}: SavedOrdersPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reportRows = useMemo(() => orders.map(getOrderReportRow), [orders]);
  const selectedRow =
    reportRows.find((row) => row.order.id === selectedOrderId) ?? reportRows[0] ?? null;
  const globalSummary = summarizeOrdersProduction(orders);
  const totalLinealWaste = globalSummary.tube.wasteFeet + globalSummary.bottom.wasteFeet;
  const averageWaste =
    reportRows.length === 0
      ? 0
      : reportRows.reduce((sum, row) => sum + row.wastePercentage, 0) / reportRows.length;
  const averageWasteLevel = getWasteLevel(averageWaste);
  const selectedWasteLevel = selectedRow
    ? getWasteLevel(selectedRow.wastePercentage)
    : 'healthy';

  return (
    <section className="orders-report-layout">
      <Card className="saved-orders-panel orders-report-panel">
        <div className="results-header">
          <div>
            <span className="section-heading__eyebrow">Ordenes</span>
            <h2>Resumen de produccion</h2>
          </div>
          <div className="saved-orders-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              Importar
            </Button>
            <Button
              type="button"
              onClick={onExportOrders}
              disabled={orders.length === 0}
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
              onImportOrders(file);
              event.target.value = '';
            }
          }}
        />

        {orders.length === 0 ? (
          <p className="history-panel__empty">
            Aun no hay ordenes guardadas. Guarda una orden desde produccion.
          </p>
        ) : (
          <>
            <div className="orders-report-summary">
              <article className="summary-card summary-card--accent">
                <span>Ordenes</span>
                <strong>{orders.length}</strong>
              </article>
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
                <span>Total ordenes</span>
                <strong>${formatNumber(globalSummary.totalOrderCost)}</strong>
                <small>Costo merma ${formatNumber(globalSummary.fabricWasteCost)}</small>
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
                <span>Promedio de merma</span>
                <strong>{formatNumber(averageWaste)} %</strong>
                <small
                  className={[
                    'waste-indicator',
                    `waste-indicator--${averageWasteLevel}`,
                  ].join(' ')}
                >
                  {getWasteLabel(averageWasteLevel)}
                </small>
              </article>
            </div>

            <div className="orders-report-table">
              <div className="orders-report-table__head">
                <span>Orden</span>
                <span>Referencia</span>
                <span>Metraje</span>
                <span>Merma m2</span>
                <span>Merma %</span>
                <span>Retazos usados</span>
              </div>

              <div className="orders-report-table__body">
                {reportRows.map((row) => {
                  const wasteLevel = getWasteLevel(row.wastePercentage);

                  return (
                    <button
                      key={row.order.id}
                      type="button"
                      className={[
                        'orders-report-row',
                        selectedRow?.order.id === row.order.id
                          ? 'orders-report-row--active'
                          : '',
                        `orders-report-row--${wasteLevel}`,
                      ].join(' ')}
                      onClick={() => onSelectOrder(row.order.id)}
                    >
                      <strong>{row.order.orderNumber}</strong>
                      <span>{row.order.customerName || 'Sin referencia'}</span>
                      <span>{formatNumber(row.summary.curtainAreaM2)} m2</span>
                      <span>{formatNumber(row.summary.fabricWasteM2)} m2</span>
                      <span className="orders-report-row__waste">
                        {formatNumber(row.wastePercentage)} %
                        <small
                          className={[
                            'waste-indicator',
                            `waste-indicator--${wasteLevel}`,
                          ].join(' ')}
                        >
                          {getWasteLabel(wasteLevel)}
                        </small>
                      </span>
                      <span>{row.summary.reusedWasteCurtains}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="saved-order-detail orders-detail-panel">
        <div className="results-header">
          <div>
            <span className="section-heading__eyebrow">Detalle</span>
            <h2>{selectedRow?.order.orderNumber || 'Selecciona una orden'}</h2>
          </div>
          {selectedRow ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => onDeleteOrder(selectedRow.order.id)}
            >
              Eliminar
            </Button>
          ) : null}
        </div>

        {selectedRow ? (
          <div className="orders-detail-panel__content">
            <div
              className={[
                'orders-detail-alert',
                `orders-detail-alert--${selectedWasteLevel}`,
              ].join(' ')}
            >
              <strong>Merma {getWasteLabel(selectedWasteLevel).toLowerCase()}</strong>
              <span>
                Esta orden registra {formatNumber(selectedRow.wastePercentage)} % de merma de
                tela.
              </span>
            </div>

            <div className="orders-detail-strip">
              <article className="summary-card summary-card--accent">
                <span>Referencia</span>
                <strong>{selectedRow.order.customerName || 'Sin referencia'}</strong>
              </article>
              <article className="summary-card">
                <span>Fecha</span>
                <strong>{formatDate(selectedRow.order.createdAt)}</strong>
              </article>
              <article className="summary-card">
                <span>Metraje cortina</span>
                <strong>{formatNumber(selectedRow.summary.curtainAreaM2)} m2</strong>
              </article>
              <article className="summary-card">
                <span>Merma</span>
                <strong>{formatNumber(selectedRow.summary.fabricWasteM2)} m2</strong>
                <small>{formatNumber(selectedRow.wastePercentage)} %</small>
              </article>
                <article className="summary-card">
                  <span>Costo total</span>
                  <strong>${formatNumber(selectedRow.summary.totalOrderCost)}</strong>
                </article>
              </div>

            <details className="project-detail-block" open>
              <summary>Ver resumen de la orden</summary>
              <div className="orders-detail-grid">
                <article className="summary-card">
                  <span>Cortinas</span>
                  <strong>{selectedRow.summary.curtains}</strong>
                </article>
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
                  <span>Costo total</span>
                  <strong>${formatNumber(selectedRow.summary.totalOrderCost)}</strong>
                </article>
                <article className="summary-card">
                  <span>Costo componentes</span>
                  <strong>${formatNumber(selectedRow.summary.fixedComponentsCost)}</strong>
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
                  <span>Retazos usados</span>
                  <strong>{selectedRow.summary.reusedWasteCurtains}</strong>
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
                        {component.name} · {formatNumber(component.quantity, 0)} {component.unit}
                      </span>
                      <strong>${formatNumber(component.totalCost)}</strong>
                    </article>
                  ))}
                </div>
              </div>
            </details>

            <details className="project-detail-block">
              <summary>Ver cortinas de esta orden ({selectedRow.order.items.length})</summary>
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
          </div>
        ) : (
          <p className="history-panel__empty">
            Selecciona una orden para ver su resumen y detalle.
          </p>
        )}
      </Card>
    </section>
  );
}
