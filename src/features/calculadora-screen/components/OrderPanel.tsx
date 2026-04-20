import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { OrderDraft, WastePiece } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeProduction } from '../../../lib/production';

interface OrderPanelProps {
  order: OrderDraft;
  currentWastePieces: WastePiece[];
  savedWastePieces: WastePiece[];
  onCustomerNameChange: (value: string) => void;
  onRemoveItem: (id: string) => void;
  onClearOrder: () => void;
  onSaveOrder: () => void;
  canSaveOrder: boolean;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function OrderPanel({
  order,
  currentWastePieces,
  savedWastePieces,
  onCustomerNameChange,
  onRemoveItem,
  onClearOrder,
  onSaveOrder,
  canSaveOrder,
}: OrderPanelProps) {
  const totals = summarizeProduction(order.items);
  const savedWasteArea = savedWastePieces.reduce((sum, piece) => sum + piece.areaM2, 0);

  return (
    <Card className="project-panel project-panel--compact">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Orden</span>
          <h2>{order.orderNumber || 'Orden actual'}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onClearOrder}
          disabled={order.items.length === 0}
        >
          Vaciar
        </Button>
      </div>

      <div className="order-form-grid order-form-grid--single">
        <label className="field">
          <span>Cliente o referencia</span>
          <input
            type="text"
            value={order.customerName}
            placeholder="Oficina central"
            onChange={(event) => onCustomerNameChange(event.target.value)}
          />
        </label>
      </div>

      <div className="mini-metrics-grid">
        <MiniMetric label="Cortinas" value={String(totals.curtains)} />
        <MiniMetric label="Tela nueva" value={`${formatNumber(totals.fabricDownloadedM2)} m2`} />
        <MiniMetric label="Con retazo" value={String(totals.reusedWasteCurtains)} />
        <MiniMetric label="Retazos bodega" value={`${savedWastePieces.length}`} />
      </div>

      <div className="button-row button-row--spread button-row--compact">
        <Button type="button" onClick={onSaveOrder} disabled={!canSaveOrder}>
          Guardar orden
        </Button>
      </div>

      <details className="project-detail-block">
        <summary>Produccion</summary>
        <div className="mini-metrics-grid">
          <MiniMetric label="Merma tela" value={`${formatNumber(totals.fabricWasteM2)} m2`} />
          <MiniMetric label="Cadena" value={`${formatNumber(totals.chainFeet)} pies`} />
          <MiniMetric label="Tubo" value={`${formatNumber(totals.tube.totalUsedFeet)} pies`} />
          <MiniMetric label="Bottom" value={`${formatNumber(totals.bottom.totalUsedFeet)} pies`} />
          <MiniMetric label="Retazos bodega" value={`${formatNumber(savedWasteArea)} m2`} />
          <MiniMetric label="Retazos orden" value={`${currentWastePieces.length}`} />
        </div>
      </details>

      <details className="project-detail-block" open>
        <summary>Cortinas agregadas ({order.items.length})</summary>
        {order.items.length === 0 ? (
          <p className="history-panel__empty">Aun no hay cortinas agregadas.</p>
        ) : (
          <div className="project-list project-list--compact">
            {order.items.map((item, index) => (
              <article key={item.id} className="project-item">
                <div className="project-item__main">
                  <strong>
                    {item.title || `Cortina ${index + 1}`} - {formatNumber(item.input.widthMeters)} x{' '}
                    {formatNumber(item.input.heightMeters)} m
                  </strong>
                  <span>{formatDate(item.createdAt)}</span>
                  <p>
                    {item.reusedWastePiece
                      ? 'Sale de retazo'
                      : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => onRemoveItem(item.id)}
                >
                  Eliminar
                </Button>
              </article>
            ))}
          </div>
        )}
      </details>
    </Card>
  );
}
