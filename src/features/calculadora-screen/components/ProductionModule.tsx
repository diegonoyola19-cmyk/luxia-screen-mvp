import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type {
  CalculationFormValues,
  CalculationResult,
  OrderDraft,
  SelectedFabric,
  ScreenValidationErrors,
  WasteReuseMatch,
  WastePiece,
} from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { summarizeProduction } from '../../../lib/production';
import type { RollerFabricColorOption } from '../../../lib/priceCatalog';

interface ProductionModuleProps {
  values: CalculationFormValues;
  errors: ScreenValidationErrors;
  order: OrderDraft;
  result: CalculationResult | null;
  fabricFamilies: string[];
  fabricOpennessOptions: string[];
  fabricColorOptions: RollerFabricColorOption[];
  selectedFabricPreview: SelectedFabric | null;
  relatedFabricVariants: SelectedFabric[];
  rollOptions: number[];
  selectedRollWidth: number | null;
  wasteMatches: WasteReuseMatch[];
  selectedWastePieceId: string | null;
  draftWastePieces: WastePiece[];
  savedWastePieces: WastePiece[];
  onChange: (field: keyof CalculationFormValues, value: string) => void;
  onFabricFamilyChange: (value: string) => void;
  onFabricOpennessChange: (value: string) => void;
  onFabricColorChange: (value: string) => void;
  onOrderNumberChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onAddToOrder: () => void;
  onSaveOrder: () => void;
  onClearOrder: () => void;
  onRemoveOrderItem: (id: string) => void;
  onSelectWastePiece: (id: string | null) => void;
  onSelectRollWidth: (value: number) => void;
  canAddToOrder: boolean;
  canSaveOrder: boolean;
}

function SummaryMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <article
      className={[
        'production-summary-metric',
        accent ? 'production-summary-metric--accent' : '',
      ].join(' ')}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function getWasteFitLabel(match: WasteReuseMatch) {
  return match.orientationUsed === 'volteada' ? 'Se puede rotar' : 'Sirve directo';
}

export function ProductionModule({
  values,
  errors,
  order,
  result,
  fabricFamilies,
  fabricOpennessOptions,
  fabricColorOptions,
  selectedFabricPreview,
  relatedFabricVariants,
  rollOptions,
  selectedRollWidth,
  wasteMatches,
  selectedWastePieceId,
  draftWastePieces,
  savedWastePieces,
  onChange,
  onFabricFamilyChange,
  onFabricOpennessChange,
  onFabricColorChange,
  onOrderNumberChange,
  onCustomerNameChange,
  onSubmit,
  onClear,
  onAddToOrder,
  onSaveOrder,
  onClearOrder,
  onRemoveOrderItem,
  onSelectWastePiece,
  onSelectRollWidth,
  canAddToOrder,
  canSaveOrder,
}: ProductionModuleProps) {
  const orderTotals = summarizeProduction(order.items);
  const activeResult = result;
  const usingWaste = Boolean(selectedWastePieceId);
  const availableColorWastePieces = [...savedWastePieces, ...draftWastePieces];
  const totalVisibleWaste = availableColorWastePieces.length;
  const activeRollWidth =
    selectedRollWidth ?? activeResult?.recommendedRollWidthMeters ?? null;

  return (
    <section className="production-module">
      <Card className="production-module__calculator">
        <div className="production-module__heading">
          <div>
            <span className="section-heading__eyebrow">Produccion</span>
            <h1>Roller</h1>
          </div>
          <div className="production-module__status">
            <span>En orden</span>
            <strong>{order.items.length}</strong>
          </div>
        </div>

        <div className="production-calc-grid">
          <label className="field">
            <span>Orden</span>
            <input
              type="text"
              value={order.orderNumber}
              placeholder="OC-1045"
              onChange={(event) => onOrderNumberChange(event.target.value)}
            />
          </label>

          <div className="field field--actions">
            <span>Acciones</span>
            <div className="button-row button-row--compact production-module__actions production-module__actions--inline">
              <Button type="button" onClick={onSubmit}>
                Calcular
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onAddToOrder}
                disabled={!canAddToOrder}
              >
                Agregar
              </Button>
              <Button type="button" variant="secondary" onClick={onClear}>
                Limpiar
              </Button>
            </div>
          </div>

          <label className="field">
            <span>Linea</span>
            <select
              value={values.fabricFamily}
              onChange={(event) => onFabricFamilyChange(event.target.value)}
            >
              {fabricFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            {errors.fabricFamily ? (
              <small className="field__error">{errors.fabricFamily}</small>
            ) : null}
          </label>

          <label className="field">
            <span>Apertura</span>
            <select
              value={values.fabricOpenness}
              onChange={(event) => onFabricOpennessChange(event.target.value)}
            >
              {fabricOpennessOptions.map((openness) => (
                <option key={openness} value={openness}>
                  {openness}
                </option>
              ))}
            </select>
            {errors.fabricOpenness ? (
              <small className="field__error">{errors.fabricOpenness}</small>
            ) : null}
          </label>

          <div className="field field--span-2">
            <span>Color</span>
            {fabricColorOptions.length === 0 ? (
              <div className="production-fabric-empty">
                No encontramos colores para esta combinacion.
              </div>
            ) : (
              <div className="production-fabric-grid">
                {fabricColorOptions.map((option) => (
                  <button
                    key={`${option.family}-${option.openness}-${option.color}`}
                    type="button"
                    className={[
                      'production-fabric-chip',
                      values.fabricColor === option.color
                        ? 'production-fabric-chip--active'
                        : '',
                    ].join(' ')}
                    onClick={() => onFabricColorChange(option.color)}
                  >
                    <strong>{option.color}</strong>
                  </button>
                ))}
              </div>
            )}
            {errors.fabricColor ? (
              <small className="field__error">{errors.fabricColor}</small>
            ) : null}
          </div>

          <label className="field">
            <span>Ancho (m)</span>
            <input
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="1.00"
              value={values.widthMeters}
              onChange={(event) => onChange('widthMeters', event.target.value)}
            />
          </label>

          <label className="field">
            <span>Alto (m)</span>
            <input
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="1.00"
              value={values.heightMeters}
              onChange={(event) => onChange('heightMeters', event.target.value)}
            />
          </label>
        </div>

        {selectedFabricPreview ? (
          <div className="production-fabric-zone">
            <div className="production-fabric-preview">
              <div className="production-fabric-preview__media">
                {selectedFabricPreview.imageUrl ? (
                  <img
                    src={selectedFabricPreview.imageUrl}
                    alt={selectedFabricPreview.description}
                  />
                ) : (
                  <div className="production-fabric-preview__placeholder">
                    Sin imagen
                  </div>
                )}
              </div>

              <div className="production-fabric-preview__content">
                <span className="section-heading__eyebrow">Tela seleccionada</span>
                <h3>{selectedFabricPreview.color}</h3>
                <p>
                  {selectedFabricPreview.family} {selectedFabricPreview.openness}
                </p>
                <div className="production-fabric-preview__meta">
                  <div>
                    <span>Codigos relacionados</span>
                    <div className="production-fabric-preview__codes">
                      {relatedFabricVariants.map((variant) => (
                        <strong key={`${variant.itemCode}-${variant.widthMeters}`}>
                          {formatNumber(variant.widthMeters)} m: {variant.itemCode}
                        </strong>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="production-fabric-scraps">
              <div className="production-module__heading production-module__heading--tight">
                <div>
                  <span className="section-heading__eyebrow">Retazos</span>
                  <h2>Mismo color</h2>
                </div>
                <div className="badge">{totalVisibleWaste}</div>
              </div>

              {activeResult ? (
                wasteMatches.length === 0 ? (
                  <div className="production-module__scrap-empty production-module__scrap-empty--compact">
                    <strong>Sin sugerencias automaticas</strong>
                    <span>No hay retazos compatibles de este color para esta medida.</span>
                  </div>
                ) : (
                  <div className="production-scrap-grid production-scrap-grid--compact">
                    <button
                      type="button"
                      className={[
                        'production-scrap-card',
                        !usingWaste ? 'production-scrap-card--active' : '',
                      ].join(' ')}
                      onClick={() => onSelectWastePiece(null)}
                    >
                      <span className="production-scrap-card__label">Rollo nuevo</span>
                      <strong>Usar tela nueva</strong>
                      <p>Ignora retazos y descarga del rollo seleccionado.</p>
                    </button>

                    {wasteMatches.map((match) => (
                      <button
                        key={match.wastePiece.id}
                        type="button"
                        className={[
                          'production-scrap-card',
                          selectedWastePieceId === match.wastePiece.id
                            ? 'production-scrap-card--active'
                            : '',
                        ].join(' ')}
                        onClick={() =>
                          onSelectWastePiece(
                            selectedWastePieceId === match.wastePiece.id
                              ? null
                              : match.wastePiece.id,
                          )
                        }
                      >
                        <span className="production-scrap-card__label">
                          {getWasteFitLabel(match)}
                        </span>
                        <strong>
                          {formatNumber(match.wastePiece.widthMeters)} x{' '}
                          {formatNumber(match.wastePiece.heightMeters)} m
                        </strong>
                        <p>{match.wastePiece.sourceItemTitle}</p>
                      </button>
                    ))}
                  </div>
                )
              ) : totalVisibleWaste === 0 ? (
                <p className="production-fabric-preview__empty">
                  Aun no hay retazos guardados para este color.
                </p>
              ) : (
                <div className="production-scrap-grid production-scrap-grid--compact">
                  {availableColorWastePieces.map((piece) => (
                    <article key={piece.id} className="production-scrap-card production-scrap-card--passive">
                      <span className="production-scrap-card__label">Disponible</span>
                      <strong>
                        {formatNumber(piece.widthMeters)} x {formatNumber(piece.heightMeters)} m
                      </strong>
                      <p>
                        {piece.sourceOrderNumber ? `${piece.sourceOrderNumber} - ` : ''}
                        {piece.sourceItemTitle}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {errors.fabricFamily ||
          errors.fabricOpenness ||
          errors.fabricColor ||
          errors.widthMeters ||
          errors.heightMeters ||
          errors.general ? (
          <div className="alert alert--error production-module__alert">
            {errors.fabricFamily ||
              errors.fabricOpenness ||
              errors.fabricColor ||
              errors.widthMeters ||
              errors.heightMeters ||
              errors.general}
          </div>
        ) : null}

      </Card>

      <Card className="production-module__summary">
        <div className="production-module__heading production-module__heading--tight">
          <div>
            <span className="section-heading__eyebrow">Resumen</span>
            <h2>Consumo actual</h2>
          </div>
          {activeResult ? <div className="badge">{usingWaste ? 'Retazo' : 'Rollo'}</div> : null}
        </div>

        {activeResult ? (
          <div className="production-roll-selector">
            <span>Rollo</span>
            <div className="production-roll-selector__options">
              {rollOptions.map((option) => {
                const disabled = option < activeResult.occupiedRollWidthMeters;

                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'production-roll-option',
                      activeRollWidth === option ? 'production-roll-option--active' : '',
                    ].join(' ')}
                    onClick={() => onSelectRollWidth(option)}
                    disabled={disabled}
                  >
                    {formatNumber(option)} m
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="production-summary-grid">
          <SummaryMetric
            label="Tela"
            value={
              activeResult?.selectedFabric
                ? `${activeResult.selectedFabric.family} ${activeResult.selectedFabric.openness}`
                : 'Sin tela'
            }
          />
          <SummaryMetric
            label="Codigo"
            value={activeResult?.selectedFabric?.itemCode ?? 'Sin codigo'}
          />
          <SummaryMetric
            label="Costo yd2"
            value={`$${formatNumber(activeResult?.fabricCostPerYd2 ?? 0)}`}
          />
          <SummaryMetric
            label="m2 usados"
            value={`${formatNumber(activeResult?.fabricDownloadedM2 ?? 0)} m2`}
            accent
          />
          <SummaryMetric
            label="yd2 usadas"
            value={`${formatNumber(activeResult?.fabricDownloadedYd2 ?? 0)} yd2`}
            accent
          />
          <SummaryMetric
            label="Merma m2"
            value={`${formatNumber(activeResult?.wasteM2 ?? 0)} m2`}
          />
          <SummaryMetric
            label="Merma yd2"
            value={`${formatNumber(activeResult?.wasteYd2 ?? 0)} yd2`}
          />
          <SummaryMetric
            label="% merma"
            value={`${formatNumber(activeResult?.wastePercentage ?? 0)} %`}
          />
        </div>
      </Card>

      <Card className="production-module__order">
        <div className="production-module__heading production-module__heading--tight">
          <div>
            <span className="section-heading__eyebrow">Orden actual</span>
            <h2>{order.orderNumber || 'Sin numero de orden'}</h2>
          </div>
          <div className="production-module__order-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={onClearOrder}
              disabled={order.items.length === 0}
            >
              Vaciar
            </Button>
            <Button type="button" onClick={onSaveOrder} disabled={!canSaveOrder}>
              Guardar orden
            </Button>
          </div>
        </div>

        <div className="order-form-grid order-form-grid--single production-order-form">
          <label className="field">
            <span>Cliente</span>
            <input
              type="text"
              value={order.customerName}
              placeholder="Oficina central"
              onChange={(event) => onCustomerNameChange(event.target.value)}
            />
          </label>
        </div>

        <div className="production-order-strip">
          <SummaryMetric label="Cortinas" value={String(orderTotals.curtains)} />
          <SummaryMetric
            label="Tela nueva"
            value={`${formatNumber(orderTotals.fabricDownloadedM2)} m2`}
          />
          <SummaryMetric
            label="Costo tela"
            value={`$${formatNumber(orderTotals.fabricDownloadedCost)}`}
          />
          <SummaryMetric
            label="Componentes"
            value={`$${formatNumber(orderTotals.fixedComponentsCost)}`}
          />
          <SummaryMetric
            label="Con retazo"
            value={String(orderTotals.reusedWasteCurtains)}
          />
          <SummaryMetric
            label="Merma"
            value={`${formatNumber(orderTotals.fabricWastePercentage)} %`}
          />
          <SummaryMetric
            label="Total orden"
            value={`$${formatNumber(orderTotals.totalOrderCost)}`}
            accent
          />
        </div>

        <details className="production-module__details">
          <summary>Cortinas agregadas ({order.items.length})</summary>
          {order.items.length === 0 ? (
            <p className="production-module__empty">Aun no hay cortinas agregadas.</p>
          ) : (
            <div className="production-order-list">
              {order.items.map((item, index) => (
                <article key={item.id} className="production-order-item">
                  <div>
                    <strong>
                      Cortina {index + 1} - {formatNumber(item.input.widthMeters)} x{' '}
                      {formatNumber(item.input.heightMeters)} m
                    </strong>
                    <span>{formatDate(item.createdAt)}</span>
                    <p>
                      {item.reusedWastePiece
                        ? 'Sale de retazo'
                        : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                    </p>
                    {item.result.selectedFabric ? (
                      <p>
                        {item.result.selectedFabric.itemCode} -{' '}
                        {item.result.selectedFabric.family}{' '}
                        {item.result.selectedFabric.openness} {item.result.selectedFabric.color}
                      </p>
                    ) : null}
                    <p>Costo tela ${formatNumber(item.result.fabricDownloadedCost)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => onRemoveOrderItem(item.id)}
                  >
                    Eliminar
                  </Button>
                </article>
              ))}
            </div>
          )}
        </details>
      </Card>
    </section>
  );
}
