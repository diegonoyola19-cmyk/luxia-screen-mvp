/**
 * ProductionModuleV2 — Diseño Stitch "Luxia Industrial Intelligence"
 * Conectado 100% al store real (useCalculatorStore + useCalculatorDerivedState)
 * Sin afectar reglas de cálculo existentes
 */
import { useMemo, useRef, useState } from 'react';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useCalculatorDerivedState } from '../hooks/useCalculatorDerivedState';
import { formatNumber } from '../../../lib/format';
import { generateId } from '../../../domain/curtains/constants';
import type { CalculationInput, ProductionBatchItem } from '../../../domain/curtains/types';
import type { WasteReuseMatch } from '../../../domain/curtains/types';
import { calcularDescargoRetazo } from '../../../domain/curtains/screen';
import './ProductionModuleV2.css';

// ── Swatch color map (fallback cuando no hay imageUrl) ───────────────────────
const FABRIC_COLOR_MAP: Record<string, string> = {
  // e Blackout FR
  'black/black':       '#1a1a1a',
  'light grey/grey-grey': '#9aa8b0',
  'beige/bisque':      '#d4b896',
  'fawn/off white':    '#d6c9ad',
  'stone/dark grey':   '#5c6166',
  smoke:               '#838b91',
  'white/snow flakes': '#eeece8',
  // Screen / Premium / Pinpointe (title case keys)
  beige:               '#d9c4a4',
  bisque:              '#c9a87c',
  black:               '#1a1a1a',
  'brown/chocolate':   '#4a3228',
  ebony:               '#2e2822',
  'ebony pearl':       '#2a2a30',  // oscuro perlado
  'ebony sand':        '#6b5a42',
  'light grey':        '#a8b4bc',
  linen:               '#d4c8b0',
  'off white':         '#f0ece4',
  'snow flakes':       '#e8e5df',
  'stone grey':        '#72787e',
  taupe:               '#9a8870',
  white:               '#f5f3ee',
  'white linen':       '#e4dece',
  'white pearl':       '#eae7e0',
  // Calico 550
  'sand custard':      '#cdb07a',
  'sand linen':        '#c4b090',
  'gold custard':      '#c8a050',
  'sand ebony':        '#7a6648',
  'bronze custard':    '#a07840',
  'calico 550 ebony sand': '#6b5a42',
};

function getSwatchColor(color: string): string {
  const n = color.trim().toLowerCase();
  // Exact match first
  if (FABRIC_COLOR_MAP[n]) return FABRIC_COLOR_MAP[n];
  // Partial match
  const match = Object.keys(FABRIC_COLOR_MAP).find((k) => n.includes(k) || k.includes(n));
  return match ? FABRIC_COLOR_MAP[match] : '#c8bfb0';
}

// Prefijos de colección a eliminar del label del swatch
const COLLECTION_PREFIXES = [
  'calico 550 ',
  'e blackout fr ',
  'pinpointe ',
  'premium ',
  'screen ',
];

function getColorLabel(color: string): string {
  const lower = color.trim().toLowerCase();
  for (const prefix of COLLECTION_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return color.trim().slice(prefix.length);
    }
  }
  return color.trim();
}

function getEfficiencyColor(pct: number): string {
  if (pct >= 90) return '#c0253a';
  if (pct >= 75) return '#ca8a04';
  return '#4ade80';
}

// ── Component ────────────────────────────────────────────────────────────────
export function ProductionModuleV2() {
  const store = useCalculatorStore();
  const widthRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scrapsOpen, setScrapsOpen] = useState(false);
  const [useManualRetazo, setUseManualRetazo] = useState(false);
  const [manualRetazoSqYd, setManualRetazoSqYd] = useState('');

  // ── Config adicional (estado local, notas de producción) ──────────────────
  const [bracketType, setBracketType] = useState<'single' | 'double' | 'ceiling'>('single');
  const [endplugType, setEndplugType] = useState<'standard' | 'push' | 'fascia'>('standard');
  const [motorModel, setMotorModel] = useState('');
  const [tubeOverride, setTubeOverride] = useState<'auto' | 'standard' | 'reinforced' | 'heavy'>('auto');

  const {
    fabricFamilies,
    fabricOpennessOptions,
    fabricColorOptions,
    parsedFormValues,
    displayResult,
    selectedFabricPreview,
    colorWasteMatches,
    colorWastePieces,
    selectedWasteMatch,
    hasValidDimensions,
  } = useCalculatorDerivedState();

  const typedMatches = colorWasteMatches as WasteReuseMatch[];
  const hasRetazos = typedMatches.length > 0 && hasValidDimensions;
  const usingWaste = Boolean(store.selectedWastePieceId);

  // ── Cálculo de retazo manual ────────────────────────────────────────────────
  const manualRetazoVal = Number(manualRetazoSqYd) || 0;
  const retazoResult = displayResult && useManualRetazo && manualRetazoVal > 0
    ? calcularDescargoRetazo(displayResult.fabricDownloadedYd2, manualRetazoVal)
    : null;
  const displayedYd2 = retazoResult?.alcanza ? retazoResult.descargar : displayResult?.fabricDownloadedYd2;
  const displayedWaste = retazoResult?.alcanza ? retazoResult.merma : displayResult?.wasteYd2;

  // ── Batch summary ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const validGroups = store.cuttingGroups.filter((g) => !g.error);
    const usedWidth = validGroups.reduce((s, g) => s + g.totalCutWidth, 0);
    const availWidth = validGroups.reduce((s, g) => s + g.rollWidth, 0);
    const totalWaste = validGroups.reduce((s, g) => s + Math.max(g.waste, 0), 0);
    const efficiency = availWidth === 0 ? 0 : (usedWidth / availWidth) * 100;
    return {
      curtains: store.itemsAProducir.length,
      cuts: store.cuttingGroups.length,
      efficiency,
      totalWaste,
      totalYd2: validGroups.reduce((s, g) => s + g.yd2Consumed, 0),
    };
  }, [store.cuttingGroups, store.itemsAProducir]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddToBatch = () => {
    if (
      !displayResult || !parsedFormValues?.curtainType ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined ||
      !parsedFormValues.fabricFamily || !parsedFormValues.fabricOpenness ||
      !parsedFormValues.fabricColor
    ) return;

    const item: ProductionBatchItem = {
      id: generateId(),
      input: parsedFormValues as CalculationInput,
      reusedWastePiece: (selectedWasteMatch as WasteReuseMatch | null)?.wastePiece ?? null,
    };
    store.addProductionItem(item);
    // Resetear selección de retazo y dimensiones tras agregar
    store.setSelectedWastePieceId(null);
    store.setFormValue('widthMeters', '');
    store.setFormValue('heightMeters', '');
    window.requestAnimationFrame(() => widthRef.current?.focus());
  };

  const handleSaveOrder = async () => {
    try { setIsSaving(true); store.saveOrder(); }
    finally { setIsSaving(false); }
  };

  const canAdd = Boolean(displayResult);
  const canSave = store.orderDraft.orderNumber.trim() !== '' &&
    store.itemsAProducir.length > 0 &&
    !store.cuttingGroups.some((g) => g.error);

  // ── Fabric preview info ────────────────────────────────────────────────────
  const fabricLabel = [store.formValues.fabricFamily, store.formValues.fabricOpenness, store.formValues.fabricColor]
    .filter(Boolean).join(' · ') || 'Sin especificar';
  const selectedSwatchColor = getSwatchColor(store.formValues.fabricColor);

  // ── Metrics ────────────────────────────────────────────────────────────────
  // Campo correcto del CalculationResult: cutLengthMeters (altura) y fabricDownloadedYd2 (consumo)
  const metrics = [
    { label: 'Eficiencia',      value: summary ? Math.round(summary.efficiency) : 0,                            unit: '%',   accent: 'red'    },
    { label: 'Altura de Corte', value: displayResult ? formatNumber(displayResult.cutLengthMeters, 2) : '—',  unit: 'm',   accent: ''       },
    { label: 'Ancho de Corte',  value: displayResult ? formatNumber(displayResult.cutWidthMeters, 2) : '—',    unit: 'm',   accent: ''       },
    { label: 'Consumo Y²',      value: displayedYd2  != null ? formatNumber(displayedYd2, 2) : '—',           unit: 'yd²', accent: useManualRetazo && retazoResult?.alcanza ? 'green' : '' },
    { label: 'Desperdicio',     value: displayedWaste != null ? formatNumber(displayedWaste, 2) : '—',          unit: 'yd²', accent: 'yellow' },
  ];

  return (
    <div className="pv2-root">

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className="pv2-grid-3">

        {/* ══ LEFT PANEL: Configuración de Tela ══════════════════════════════ */}
        <section className="pv2-left">
          <div className="pv2-glass pv2-config-panel">
            {/* Header */}
            <div className="pv2-config-header">
              <span className="material-symbols-outlined pv2-icon-red">tune</span>
              <h2 className="pv2-headline">Configuración de Tela</h2>
            </div>

            {/* Selects row */}
            <div className="pv2-grid-2">
              <div className="pv2-field">
                <label className="pv2-label">Línea de Tela</label>
                <select
                  className="pv2-select"
                  value={store.formValues.fabricFamily}
                  onChange={(e) => store.setFabricFamily(e.target.value)}
                >
                  {fabricFamilies.map((f) => (
                    <option key={f} value={f}>{f || 'Seleccionar'}</option>
                  ))}
                </select>
              </div>
              <div className="pv2-field">
                <label className="pv2-label">Openness</label>
                <select
                  className="pv2-select"
                  value={store.formValues.fabricOpenness}
                  onChange={(e) => store.setFabricOpenness(e.target.value)}
                >
                  {fabricOpennessOptions.map((o) => (
                    <option key={o} value={o}>{o || 'Seleccionar'}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dimensions row */}
            <div className="pv2-grid-2">
              <div className="pv2-field">
                <label className="pv2-label">Ancho (m)</label>
                <input
                  ref={widthRef}
                  className="pv2-input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={store.formValues.widthMeters}
                  onChange={(e) => store.setFormValue('widthMeters', e.target.value)}
                  onBlur={() => store.handleFieldBlur('widthMeters')}
                />
              </div>
              <div className="pv2-field">
                <label className="pv2-label">Alto (m)</label>
                <input
                  className="pv2-input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={store.formValues.heightMeters}
                  onChange={(e) => store.setFormValue('heightMeters', e.target.value)}
                  onBlur={() => store.handleFieldBlur('heightMeters')}
                />
              </div>
            </div>

            {/* Order number */}
            <div className="pv2-field">
              <label className="pv2-label">N° Orden</label>
              <input
                className="pv2-input"
                type="text"
                placeholder="ORD-001"
                value={store.orderDraft.orderNumber}
                onChange={(e) => store.setOrderNumber(e.target.value)}
              />
            </div>

            {/* Color swatches — usa imageUrl real del catálogo */}
            <div className="pv2-field">
              <label className="pv2-label">Variante de Color</label>
              <div className="pv2-swatches">
                {fabricColorOptions.length > 0 ? (
                  fabricColorOptions.map((opt) => {
                    const isActive = store.formValues.fabricColor === opt.color;
                    return (
                      <button
                        key={opt.color}
                        className={`pv2-swatch-btn ${isActive ? 'pv2-swatch-btn--active' : ''}`}
                        onClick={() => store.setFabricColor(opt.color)}
                        title={opt.color}
                      >
                        {opt.imageUrl ? (
                          <img
                            src={opt.imageUrl}
                            alt={opt.color}
                            className="pv2-swatch-img"
                          />
                        ) : (
                          <div
                            className="pv2-swatch-circle"
                            style={{ background: getSwatchColor(opt.color) }}
                          />
                        )}
                        <span className="pv2-swatch-label">{getColorLabel(opt.color)}</span>
                      </button>
                    );
                  })
                ) : (
                  <span className="pv2-muted-sm">Selecciona línea y openness</span>
                )}
              </div>
            </div>

            {/* ── Panel de Retazo — siempre visible cuando hay resultado ─── */}
            {displayResult && (
              <div className="pv2-retazo-panel">

                {/* Encabezado con badge de matches de inventario */}
                <div className="pv2-retazo-header">
                  <span className="material-symbols-outlined pv2-retazo-icon">content_cut</span>
                  <span className="pv2-retazo-title">Retazo</span>
                  {hasRetazos && (
                    <span className="pv2-retazo-badge">{typedMatches.length} en inventario</span>
                  )}
                  <button
                    className="pv2-waste-toggle"
                    onClick={() => setScrapsOpen(v => !v)}
                  >
                    {scrapsOpen ? 'Cerrar' : 'Expandir'}
                  </button>
                </div>

                {scrapsOpen && (
                  <div className="pv2-retazo-body">

                    {/* ── Selector de inventario (si hay matches) */}
                    {hasRetazos && (
                      <>
                        <p className="pv2-retazo-section-title">Piezas disponibles del color actual</p>
                        <div className="pv2-waste-list">
                          <button
                            className={`pv2-waste-option ${!usingWaste ? 'pv2-waste-option--active' : ''}`}
                            onClick={() => store.setSelectedWastePieceId(null)}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>fiber_new</span>
                            <span>Rollo nuevo</span>
                          </button>
                          {typedMatches.map((match) => {
                            const p = match.wastePiece;
                            const isSelected = store.selectedWastePieceId === p.id;
                            return (
                              <button
                                key={p.id}
                                className={`pv2-waste-option ${isSelected ? 'pv2-waste-option--active' : ''}`}
                                onClick={() => store.setSelectedWastePieceId(p.id)}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>cut</span>
                                <span>
                                  {formatNumber(p.widthMeters, 2)}m × {formatNumber(p.heightMeters, 2)}m
                                  {' '}<em className="pv2-muted-sm">({formatNumber(p.areaM2, 2)} m²)</em>
                                  {match.orientationUsed === 'volteada' && (
                                    <em className="pv2-waste-rotated"> — volteado</em>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedWasteMatch && (
                          <div className="pv2-waste-active-info">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                            Retazo activo seleccionado
                          </div>
                        )}
                        <div className="pv2-retazo-divider" />
                      </>
                    )}

                    {/* ── Entrada manual de Y² */}
                    <label className="pv2-retazo-toggle-row">
                      <input
                        type="checkbox"
                        className="pv2-retazo-checkbox"
                        checked={useManualRetazo}
                        onChange={(e) => {
                          setUseManualRetazo(e.target.checked);
                          if (!e.target.checked) setManualRetazoSqYd('');
                        }}
                      />
                      <span>Ingresar Y² manualmente</span>
                    </label>

                    {useManualRetazo && (
                      <div className="pv2-retazo-manual">
                        <div className="pv2-field">
                          <label className="pv2-label">Tamaño del retazo (yd²)</label>
                          <input
                            className="pv2-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={manualRetazoSqYd}
                            onChange={(e) => setManualRetazoSqYd(e.target.value)}
                          />
                        </div>

                        {manualRetazoVal > 0 && retazoResult && (
                          <div className={`pv2-retazo-result ${
                            retazoResult.alcanza ? 'pv2-retazo-result--ok' : 'pv2-retazo-result--err'
                          }`}>
                            {retazoResult.alcanza ? (
                              <>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                                <span>
                                  Alcanza — Descargar <strong>{formatNumber(retazoResult.descargar, 2)} yd²</strong>,
                                  {' '}merma <strong>{formatNumber(retazoResult.merma, 2)} yd²</strong>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cancel</span>
                                <span>
                                  No alcanza — se necesitan{' '}
                                  <strong>{formatNumber(displayResult.fabricDownloadedYd2, 2)} yd²</strong>,
                                  {' '}tienes {formatNumber(manualRetazoVal, 2)} yd²
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}


          {/* Actions */}
            <div className="pv2-actions-row">
              <button
                className="pv2-btn-primary pv2-btn-grow"
                onClick={handleAddToBatch}
                disabled={!canAdd}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_box</span>
                Agregar a Lote
              </button>
              <button
                className="pv2-btn-ghost pv2-btn-icon"
                onClick={() => store.handleNewCurtain()}
                title="Limpiar"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restart_alt</span>
              </button>
            </div>
          </div>

          {/* Save order dashed button */}
          <button
            className={`pv2-glass pv2-new-curtain-btn ${!canSave ? 'pv2-disabled' : ''}`}
            onClick={handleSaveOrder}
            disabled={!canSave || isSaving}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
            <span className="pv2-label">{isSaving ? 'Guardando…' : 'Guardar Orden'}</span>
          </button>
        </section>

        {/* ══ RIGHT PANEL ════════════════════════════════════════════════════ */}
        <section className="pv2-right">

          {/* Metrics row */}
          <div className="pv2-metrics-row">
            {metrics.map((m) => (
              <div
                key={m.label}
                className={`pv2-glass pv2-metric-card ${m.accent === 'red' ? 'pv2-metric-card--red' : m.accent === 'yellow' ? 'pv2-metric-card--yellow' : m.accent === 'green' ? 'pv2-metric-card--green' : ''}`}
              >
                <div className="pv2-metric-label">{m.label}</div>
                <div className="pv2-metric-value">
                  <span className="pv2-metric-number">{m.value}</span>
                  <span className="pv2-metric-unit">{m.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Batch table */}
          <div className="pv2-glass pv2-table-panel">
            <div className="pv2-table-header">
              <h3 className="pv2-table-title">
                <span className="material-symbols-outlined pv2-icon-red" style={{ fontSize: 18 }}>list_alt</span>
                Lote de Producción Activo
              </h3>
              <span className="pv2-badge">
                {store.cuttingGroups.length > 0 ? 'En Proceso' : 'Vacío'}
              </span>
            </div>

            <div className="pv2-table-scroll">
              <table className="pv2-table">
                <thead>
                  <tr className="pv2-thead-row">
                    <th className="pv2-th">Fila de Corte</th>
                    <th className="pv2-th">Rollo</th>
                    <th className="pv2-th">Utilizado</th>
                    <th className="pv2-th">Piezas</th>
                    <th className="pv2-th">Eficiencia</th>
                    <th className="pv2-th pv2-th-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {store.cuttingGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="pv2-table-empty">
                        Agrega cortinas al lote para ver los cortes optimizados
                      </td>
                    </tr>
                  ) : (
                    store.cuttingGroups.map((group, idx) => {
                      const usedWidth = group.totalCutWidth;
                      const rollW = group.rollWidth;
                      const eff = rollW === 0 ? 0 : Math.min((usedWidth / rollW) * 100, 100);
                      const effColor = getEfficiencyColor(eff);
                      const rowId = `R1-${String(idx + 1).padStart(3, '0')}`;
                      const pieces = group.items.length;
                      return (
                        <tr key={group.id ?? idx} className="pv2-tbody-row">
                          <td className="pv2-td pv2-td-mono">{rowId}</td>
                          <td className="pv2-td pv2-td-muted">{formatNumber(rollW, 2)}m</td>
                          <td className="pv2-td pv2-td-mono">{formatNumber(usedWidth, 2)}m</td>
                          <td className="pv2-td">{pieces} {pieces === 1 ? 'Cortina' : 'Cortinas'}</td>
                          <td className="pv2-td pv2-td-eff">
                            <div className="pv2-eff-row">
                              <div className="pv2-eff-bar-bg">
                                <div
                                  className="pv2-eff-bar-fill"
                                  style={{ width: `${eff}%`, background: effColor, boxShadow: `0 0 8px ${effColor}80` }}
                                />
                              </div>
                              <span className="pv2-eff-pct" style={{ color: effColor }}>
                                {Math.round(eff)}%
                              </span>
                            </div>
                          </td>
                          <td className="pv2-td pv2-td-right">
                            <button
                              className="pv2-row-action"
                              onClick={() => {
                                // Remove all items from this group
                                group.items.forEach((item: any) => store.removeProductionItem(item.id));
                              }}
                              title="Eliminar fila"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Orientación rotada alert */}
          {displayResult?.orientationUsed === 'volteada' && (
            <div className="pv2-alert pv2-alert--info">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rotate_90_degrees_ccw</span>
              <div>
                <strong>Fabricación Rotada (90°)</strong>
                <p>Esta cortina debe fabricarse girada para cumplir con las medidas.</p>
              </div>
            </div>
          )}

          {/* Tubo reforzado alert */}
          {displayResult?.requiresReinforcedTube && (
            <div className="pv2-alert pv2-alert--warning">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              <div>
                <strong>Aviso de Estructura</strong>
                <p>{displayResult.tubeRecommendation}</p>
              </div>
            </div>
          )}

          {/* Fabric preview — imagen real del catálogo */}
          <div className="pv2-glass pv2-fabric-preview">
            {selectedFabricPreview?.imageUrl ? (
              <img
                src={selectedFabricPreview.imageUrl}
                alt={selectedFabricPreview.color}
                className="pv2-fabric-img"
              />
            ) : (
              <div
                className="pv2-fabric-swatch"
                style={{ background: selectedSwatchColor }}
              />
            )}
            <div className="pv2-fabric-info">
              <h4 className="pv2-fabric-name">
                {fabricLabel}
              </h4>
              <p className="pv2-fabric-sku">
                {selectedFabricPreview
                  ? `Rollo: ${formatNumber(selectedFabricPreview.widthMeters ?? 0, 2)}m ancho`
                  : 'Selecciona una tela para ver detalles'}
              </p>
              <div className="pv2-fabric-tags">
                {selectedFabricPreview && (
                  <>
                    <span className="pv2-fabric-tag">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>straighten</span>
                      {formatNumber(selectedFabricPreview.widthMeters ?? 0, 2)}m ancho
                    </span>
                    {displayResult && (
                      <span className="pv2-fabric-tag">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>inventory_2</span>
                        {formatNumber(displayResult.fabricDownloadedYd2, 2)} yd² este corte
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ══ EXTRA PANEL: Configuración de Sistema ═══════════════════════ */}
        <section className="pv2-extra">
          <div className="pv2-glass pv2-sys-panel">

            {/* Header */}
            <div className="pv2-config-header">
              <span className="material-symbols-outlined pv2-icon-red">settings_suggest</span>
              <h2 className="pv2-headline">Configuración de Sistema</h2>
            </div>

            {/* ── Accionamiento */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Accionamiento</span>
              <div className="pv2-sys-toggle-group">
                {(['manual', 'motorized'] as const).map((dt) => (
                  <button
                    key={dt}
                    className={`pv2-sys-toggle ${
                      (store.formValues.driveType ?? 'manual') === dt ? 'pv2-sys-toggle--active' : ''
                    }`}
                    onClick={() => store.setFormValue('driveType', dt)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {dt === 'manual' ? 'settings_remote' : 'electric_bolt'}
                    </span>
                    {dt === 'manual' ? 'Manual (Cadena)' : 'Motorizado'}
                  </button>
                ))}
              </div>
            </div>

            {/* Motor (solo si motorizado) */}
            {(store.formValues.driveType === 'motorized') && (
              <div className="pv2-field">
                <label className="pv2-label">Modelo de Motor</label>
                <input
                  className="pv2-input"
                  type="text"
                  placeholder="Somfy RS100, Rademacher..."
                  value={motorModel}
                  onChange={(e) => setMotorModel(e.target.value)}
                />
              </div>
            )}

            {/* ── Sistema de Tubo */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Tubo / Tambor</span>
              {displayResult?.requiresReinforcedTube && tubeOverride === 'auto' && (
                <div className="pv2-sys-alert">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                  {displayResult.tubeRecommendation}
                </div>
              )}
              <div className="pv2-sys-option-group">
                {([
                  { val: 'auto',       icon: 'auto_fix_high',    label: 'Auto' },
                  { val: 'standard',   icon: 'hardware',          label: 'Estándar' },
                  { val: 'reinforced', icon: 'construction',      label: 'Reforzado' },
                  { val: 'heavy',      icon: 'forklift',          label: 'Heavy Duty' },
                ] as const).map(({ val, icon, label }) => (
                  <button
                    key={val}
                    className={`pv2-sys-option ${
                      tubeOverride === val ? 'pv2-sys-option--active' : ''
                    } ${val !== 'auto' && displayResult?.requiresReinforcedTube && val === 'standard' ? 'pv2-sys-option--warn' : ''}`}
                    onClick={() => setTubeOverride(val)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Sistema de Bracket */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Sistema de Bracket</span>
              <div className="pv2-sys-option-group">
                {([
                  { val: 'single',  icon: 'align_vertical_center', label: 'Bracket Simple' },
                  { val: 'double',  icon: 'align_horizontal_center', label: 'Bracket Doble' },
                  { val: 'ceiling', icon: 'vertical_align_top',    label: 'Techo / Facefix' },
                ] as const).map(({ val, icon, label }) => (
                  <button
                    key={val}
                    className={`pv2-sys-option ${bracketType === val ? 'pv2-sys-option--active' : ''}`}
                    onClick={() => setBracketType(val)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Sistema de Endplug */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Sistema de Endplug</span>
              <div className="pv2-sys-option-group">
                {([
                  { val: 'standard', icon: 'radio_button_checked', label: 'Estándar' },
                  { val: 'push',     icon: 'touch_app',             label: 'Push' },
                  { val: 'fascia',   icon: 'view_agenda',           label: 'Fascia' },
                ] as const).map(({ val, icon, label }) => (
                  <button
                    key={val}
                    className={`pv2-sys-option ${endplugType === val ? 'pv2-sys-option--active' : ''}`}
                    onClick={() => setEndplugType(val)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Resumen de configuración */}
            <div className="pv2-sys-summary">
              <div className="pv2-sys-summary-row">
                <span className="pv2-sys-summary-key">Accionamiento</span>
                <span className="pv2-sys-summary-val">
                  {(store.formValues.driveType ?? 'manual') === 'motorized' ? '⚡ Motorizado' : '⛓️ Manual'}
                </span>
              </div>
              <div className="pv2-sys-summary-row">
                <span className="pv2-sys-summary-key">Tubo</span>
                <span className="pv2-sys-summary-val">
                  {tubeOverride === 'auto'
                    ? (displayResult?.requiresReinforcedTube ? '⚠️ Reforzado (auto)' : 'Estándar (auto)')
                    : tubeOverride.charAt(0).toUpperCase() + tubeOverride.slice(1)}
                </span>
              </div>
              <div className="pv2-sys-summary-row">
                <span className="pv2-sys-summary-key">Bracket</span>
                <span className="pv2-sys-summary-val">
                  {bracketType === 'single' ? 'Simple' : bracketType === 'double' ? 'Doble' : 'Techo'}
                </span>
              </div>
              <div className="pv2-sys-summary-row">
                <span className="pv2-sys-summary-key">Endplug</span>
                <span className="pv2-sys-summary-val">
                  {endplugType === 'standard' ? 'Estándar' : endplugType === 'push' ? 'Push' : 'Fascia'}
                </span>
              </div>
              {motorModel && (
                <div className="pv2-sys-summary-row">
                  <span className="pv2-sys-summary-key">Motor</span>
                  <span className="pv2-sys-summary-val">{motorModel}</span>
                </div>
              )}
            </div>

          </div>
        </section>
      </div>

      {/* ── Fixed footer status bar ────────────────────────────────────────── */}
      <footer className="pv2-footer">
        <div className="pv2-footer-left">
          <div className="pv2-footer-kpi pv2-footer-kpi--red">
            <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span>Eficiencia: {Math.round(summary.efficiency)}%</span>
          </div>
          <div className="pv2-footer-kpi">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>recycling</span>
            <span>Desperdicio: {formatNumber(summary.totalWaste, 2)}m</span>
          </div>
        </div>
        <div className="pv2-footer-right">
          <div className="pv2-footer-stat">
            <span className="pv2-footer-stat-label">Total Cortinas:</span>
            <span className="pv2-footer-stat-value">{summary.curtains}</span>
          </div>
          <div className="pv2-footer-stat">
            <span className="pv2-footer-stat-label">Cortes Realizados:</span>
            <span className="pv2-footer-stat-value">{summary.cuts}</span>
          </div>
          <div className="pv2-footer-stat pv2-footer-stat--sep">
            <span className="pv2-status-pip" />
            <span className="pv2-footer-active">Mesa de Corte: Activa</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
