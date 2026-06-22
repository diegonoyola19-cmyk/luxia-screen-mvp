/**
 * ProductionModuleV2 — Diseño Stitch "Luxia Industrial Intelligence"
 * Conectado 100% al store real (useCalculatorStore + useCalculatorDerivedState)
 * Sin afectar reglas de cálculo existentes
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useCalculatorDerivedState } from '../hooks/useCalculatorDerivedState';
import { formatNumber } from '../../../lib/format';
import { generateId } from '../../../domain/curtains/constants';
import type { CalculationInput, ProductionBatchItem } from '../../../domain/curtains/types';
import type { WasteReuseMatch } from '../../../domain/curtains/types';
import { calcularDescargoRetazo } from '../../../domain/curtains/screen';
import { generateRollerBOM, TONE_COLOR_MAP, type BOMItem } from '../../../logic/generateRollerBOM';
import type { Tone } from '../../../logic/rollerEngineV3';
import { getHWDesc } from '../../../logic/rollerEngineV3';
import { useDoubleBracketWidthGuard } from '../hooks/useDoubleBracketWidthGuard';
import { DoubleBracketWidthAlert } from './DoubleBracketWidthAlert';
import { resolveHardwareToneFromFabricColor, extractFabricColorName } from '../../../domain/curtains/hardwareToneRules';
import { useAuthStore } from '../../../store/useAuthStore';
import './ProductionModuleV2.css';

// ── BOM display helpers ───────────────────────────────────────────────────────
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

// ── Swatch color map (fallback cuando no hay imageUrl) ───────────────────────
const FABRIC_COLOR_MAP: Record<string, string> = {
  // e Blackout FR
  'black/black': '#1a1a1a',
  'light grey/grey-grey': '#9aa8b0',
  'beige/bisque': '#d4b896',
  'fawn/off white': '#d6c9ad',
  'stone/dark grey': '#5c6166',
  smoke: '#838b91',
  'white/snow flakes': '#eeece8',
  // Screen / Premium / Pinpointe (title case keys)
  beige: '#d9c4a4',
  bisque: '#c9a87c',
  black: '#1a1a1a',
  'brown/chocolate': '#4a3228',
  ebony: '#2e2822',
  'ebony pearl': '#2a2a30',  // oscuro perlado
  'ebony sand': '#6b5a42',
  'light grey': '#a8b4bc',
  linen: '#d4c8b0',
  'off white': '#f0ece4',
  'snow flakes': '#e8e5df',
  'stone grey': '#72787e',
  taupe: '#9a8870',
  white: '#f5f3ee',
  'white linen': '#e4dece',
  'white pearl': '#eae7e0',
  // Calico 550
  'sand custard': '#cdb07a',
  'sand linen': '#c4b090',
  'gold custard': '#c8a050',
  'sand ebony': '#7a6648',
  'bronze custard': '#a07840',
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
  const { role } = useAuthStore();
  const isReadOnly = role === 'consulta';
  const widthRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scrapsOpen, setScrapsOpen] = useState(false);
  const [useManualRetazo, setUseManualRetazo] = useState(false);
  const [manualRetazoSqYd, setManualRetazoSqYd] = useState('');
  const [oversizedRotatedAccepted, setOversizedRotatedAccepted] = useState(false);
  const [forcedRotatedAccepted, setForcedRotatedAccepted] = useState(false);
  const [cantidadInput, setCantidadInput] = useState<string>('1');

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
    displayErrors,
  } = useCalculatorDerivedState(false);

  // -- Tono de herrajes: conectado al store para persistir en saveOrder ----------
  const toneOverride = store.hardwareTone as Tone | null;
  const setToneOverride = (t: Tone | null) => store.setHardwareTone(t);
  
  const autoTone = useMemo(() => {
    const extractedColor = extractFabricColorName(selectedFabricPreview || store.formValues.fabricColor);
    return resolveHardwareToneFromFabricColor(extractedColor);
  }, [store.formValues.fabricColor, selectedFabricPreview]);

  const selectedTone = toneOverride ?? autoTone;
  // Fallback a white solo para no romper cálculos si es null
  const activeTone: Tone = selectedTone ?? 'white';

  const typedMatches = colorWasteMatches as WasteReuseMatch[];
  const hasRetazos = typedMatches.length > 0 && hasValidDimensions;
  const usingWaste = Boolean(store.selectedWastePieceId);

  // ── Bracket Doble width guard ───────────────────────────────────────────
  // parsedFormValues ya está disponible aqui — seguro usarlo en el hook.
  const widthGuard = useDoubleBracketWidthGuard({
    widthM:         parsedFormValues?.widthMeters ?? 0,
    mountingSystem: store.mountingSystem,
  });

  // ── Cálculo de retazo manual ────────────────────────────────────────────────
  const manualRetazoVal = Number(manualRetazoSqYd) || 0;
  const retazoResult = displayResult && useManualRetazo && manualRetazoVal > 0
    ? calcularDescargoRetazo(displayResult.fabricDownloadedYd2, manualRetazoVal)
    : null;
  const displayedYd2 = retazoResult?.alcanza ? retazoResult.descargar : displayResult?.fabricDownloadedYd2;
  const displayedWaste = retazoResult?.alcanza ? retazoResult.merma : displayResult?.wasteYd2;

  // BOM: solo SKU + cantidad, sin consulta de inventario.
  // Bloqueado si el operador canceló la autorización de bracket doble.
  const hwItems = useMemo((): BOMItem[] => {
    const w = parsedFormValues?.widthMeters ?? 0;
    const h = parsedFormValues?.heightMeters ?? 0;
    if (w <= 0 || h <= 0) return [];
    if (widthGuard.approvalState === 'cancelled') return [];
    try { return generateRollerBOM(w, h, activeTone, store.mountingSystem ?? 'standard').items; }
    catch { return []; }
  }, [parsedFormValues?.widthMeters, parsedFormValues?.heightMeters, activeTone, store.mountingSystem, widthGuard.approvalState]);




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

  const parsedQty = Math.max(1, parseInt(cantidadInput, 10) || 1);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddToBatch = () => {
    if (
      !displayResult || !parsedFormValues?.curtainType ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined ||
      !parsedFormValues.fabricFamily || !parsedFormValues.fabricOpenness ||
      !parsedFormValues.fabricColor
    ) return;

    for (let i = 0; i < parsedQty; i++) {
      const item: ProductionBatchItem = {
        id: generateId(),
        input: {
          ...(parsedFormValues as CalculationInput),
          mountingSystem: store.mountingSystem,
          hardwareTone: activeTone,
          oversizedRotatedAccepted,
          forcedRotatedAccepted,
          // Persisit specialFabrication metadata when applicable
          ...(widthGuard.specialFabricationMeta ?? {}),
        },
        result: displayResult,
        reusedWastePiece: (selectedWasteMatch as WasteReuseMatch | null)?.wastePiece ?? null,
      };
      store.addProductionItem(item);
    }
    // Resetear selección de retazo y dimensiones tras agregar
    store.setSelectedWastePieceId(null);
    store.setFormValue('widthMeters', '');
    store.setFormValue('heightMeters', '');
    setOversizedRotatedAccepted(false);
    setForcedRotatedAccepted(false);
    setCantidadInput('1');
    window.requestAnimationFrame(() => widthRef.current?.focus());
  };

  const handleSaveOrder = async () => {
    // Siempre persistir el tono activo (auto o manual) en el store ANTES de guardar,
    // para que orderSlice.saveOrder use el mismo tono que muestra la UI.
    store.setHardwareTone(activeTone);
    try { setIsSaving(true); store.saveOrder(); }
    finally { setIsSaving(false); }
  };

  const canAdd = Boolean(displayResult) && 
    (!displayResult?.oversizedRotated || oversizedRotatedAccepted) &&
    (!displayResult?.forcedRotatedByRollLimit || forcedRotatedAccepted);
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
    { label: 'Eficiencia', value: summary ? Math.round(summary.efficiency) : 0, unit: '%', accent: 'red' },
    { label: 'Altura de Corte', value: displayResult ? formatNumber(displayResult.cutLengthMeters, 2) : '—', unit: 'm', accent: '' },
    { label: 'Ancho de Corte', value: displayResult ? formatNumber(displayResult.cutWidthMeters, 2) : '—', unit: 'm', accent: '' },
    { label: 'Consumo Y²', value: displayedYd2 != null ? formatNumber(displayedYd2, 2) : '—', unit: 'yd²', accent: useManualRetazo && retazoResult?.alcanza ? 'green' : '' },
    { label: 'Desperdicio', value: displayedWaste != null ? formatNumber(displayedWaste, 2) : '—', unit: 'yd²', accent: 'yellow' },
  ];

  return (
    <div className="pv2-root">

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className="pv2-grid-3">

        {/* ══ LEFT PANEL: Configuración de Tela ══════════════════════════════ */}
        <section className="pv2-left">
          <div className="pv2-glass pv2-config-panel">
            {/* Header */}
            <div className="pv2-config-header" style={{ marginBottom: isReadOnly ? '10px' : '20px' }}>
              <span className="material-symbols-outlined pv2-icon-red">tune</span>
              <h2 className="pv2-headline">Configuración de Tela</h2>
            </div>

            {isReadOnly && (
              <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '14px', padding: '8px 12px', backgroundColor: 'var(--primary-glow)', borderRadius: '4px', border: '1px solid rgba(192,37,58,0.2)' }}>
                🔒 <strong>Solo Lectura:</strong> Acciones de modificación deshabilitadas.
              </div>
            )}

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
            <div className="pv2-grid-3">
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
                {displayErrors.widthMeters && (
                  <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {displayErrors.widthMeters}
                  </div>
                )}
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
                {displayErrors.heightMeters && (
                  <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {displayErrors.heightMeters}
                  </div>
                )}
              </div>
              <div className="pv2-field">
                <label className="pv2-label" htmlFor="input-cantidad">Cantidad</label>
                <input
                  id="input-cantidad"
                  className="pv2-input"
                  type="number"
                  min="1"
                  step="1"
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
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
                disabled={isReadOnly}
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
                          <div className={`pv2-retazo-result ${retazoResult.alcanza ? 'pv2-retazo-result--ok' : 'pv2-retazo-result--err'
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
                disabled={isReadOnly || !canAdd}
                title={isReadOnly ? "No tienes permisos de escritura" : (displayErrors.general || `Agregar ${parsedQty > 1 ? parsedQty : ''} a Lote`)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_box</span>
                {parsedQty > 1 ? `Agregar ${parsedQty} a Lote` : 'Agregar a Lote'}
              </button>
              <button
                className="pv2-btn-ghost pv2-btn-icon"
                onClick={() => store.handleNewCurtain()}
                title="Limpiar"
                disabled={isReadOnly}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restart_alt</span>
              </button>
            </div>
          </div>

          {displayErrors.general && (
            <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>error</span>
              {displayErrors.general}
            </div>
          )}

          {/* Save order dashed button */}
          <button
            className={`pv2-glass pv2-new-curtain-btn ${isReadOnly || !canSave ? 'pv2-disabled' : ''}`}
            onClick={handleSaveOrder}
            disabled={isReadOnly || !canSave || isSaving}
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
                          <td className="pv2-td pv2-td-mono" data-label="Fila de Corte">{rowId}</td>
                          <td className="pv2-td pv2-td-muted" data-label="Rollo">{formatNumber(rollW, 2)}m</td>
                          <td className="pv2-td pv2-td-mono" data-label="Utilizado">{formatNumber(usedWidth, 2)}m</td>
                          <td className="pv2-td" data-label="Piezas">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: '500' }}>{pieces} {pieces === 1 ? 'Cortina' : 'Cortinas'}</span>
                              {group.items.map((item: any) => (
                                <span key={item.id} style={{ fontSize: '11px', color: '#9ca3af' }}>
                                  {formatNumber(item.input.widthMeters, 2)}m x {formatNumber(item.input.heightMeters, 2)}m
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="pv2-td pv2-td-eff" data-label="Eficiencia">
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
                          <td className="pv2-td pv2-td-right" data-label="Acción">
                            <button
                              className="pv2-row-action"
                              onClick={() => {
                                if (isReadOnly) return;
                                // Remove all items from this group
                                group.items.forEach((item: any) => store.removeProductionItem(item.id));
                              }}
                              disabled={isReadOnly}
                              title={isReadOnly ? "No tienes permisos" : "Eliminar fila"}
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

          {displayResult?.fabricSubstitution?.wasSubstituted && (
            <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                <div>
                  <strong>No hay stock en ancho {formatNumber(displayResult.fabricSubstitution.originalWidthMeters ?? 0, 2)}m. Se usará ancho {formatNumber(displayResult.fabricSubstitution.selectedWidthMeters ?? 0, 2)}m porque cubre el requerimiento.</strong>
                  {displayResult.fabricSubstitution.requiredYd2 != null && displayResult.fabricSubstitution.availableYd2 != null && (
                    <p style={{ marginTop: '0.25rem' }}>
                      Requiere {formatNumber(displayResult.fabricSubstitution.requiredYd2, 2)} yd². Disponible: {formatNumber(displayResult.fabricSubstitution.availableYd2, 2)} yd².
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!displayResult?.fabricSubstitution?.wasSubstituted && displayResult?.fabricSubstitution?.warnings?.some(w => w.severity === 'error') && (
            <div className="pv2-alert pv2-alert--warning">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              <div>
                <strong>No hay stock suficiente para la tela seleccionada. La orden podría fallar al sincronizar inventario.</strong>
              </div>
            </div>
          )}

          {displayResult?.oversizedRotated ? (
            <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                <div>
                  <strong>Fabricación rotada requerida</strong>
                  <p>Esta cortina supera los 3.00 m de ancho. Para fabricarla debe hacerse rotada, usando el ancho del rollo como alto disponible. Verifica que el alto más el extra de enrollo quepa dentro del rollo.</p>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={oversizedRotatedAccepted}
                  onChange={(e) => setOversizedRotatedAccepted(e.target.checked)}
                  style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                />
                Confirmo fabricar esta cortina rotada
              </label>
            </div>
          ) : displayResult?.forcedRotatedByRollLimit ? (
            <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                <div>
                  <strong>Fabricación rotada por ancho de rollo</strong>
                  <p>Esta tela no tiene un ancho de rollo suficiente para fabricar la cortina en orientación normal. Se fabricará rotada, usando el ancho del rollo como alto disponible. Verifica que el alto más el extra de enrollo quepa dentro del rollo.</p>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={forcedRotatedAccepted}
                  onChange={(e) => setForcedRotatedAccepted(e.target.checked)}
                  style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                />
                Confirmo fabricar esta cortina rotada
              </label>
            </div>
          ) : displayResult?.orientationUsed === 'volteada' && (
            <div className="pv2-alert pv2-alert--info">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rotate_90_degrees_ccw</span>
              <div>
                <strong>Fabricación Rotada (90°)</strong>
                <p>Esta cortina debe fabricarse girada para cumplir con las medidas.</p>
              </div>
            </div>
          )}

          {/* Edge Roll Fit alert */}
          {displayResult?.edgeRollFit && (
            <div className="pv2-alert pv2-alert--warning">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>fit_screen</span>
              <div>
                <strong>Corte justo al rollo</strong>
                <p>La medida final cabe en el rollo, pero el encuadre estándar excede el ancho disponible. Se permitirá fabricar sin encuadre lateral.</p>
              </div>
            </div>
          )}

          {/* Tubo reforzado alert */}
          {displayResult?.requiresReinforcedTube && !displayResult?.oversizedRotated && (
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

        {/* ══ EXTRA PANEL: Herrajes BOM ══════════════════════════════════ */}
        <section className="pv2-extra">
          <div className="pv2-glass pv2-sys-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>


            {/* Header */}
            <div className="pv2-config-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="material-symbols-outlined pv2-icon-red">construction</span>
                <h2 className="pv2-headline">Herrajes · BOM</h2>
              </div>
              {hwItems.length > 0 && (
                <span className="pv2-badge" style={{ background: '#334155', fontSize: '0.6rem' }}>
                  {hwItems.length} componentes
                </span>
              )}
            </div>

            {/* Accionamiento */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Accionamiento</span>
              <div className="pv2-sys-toggle-group">
                {(['manual', 'motorized'] as const).map((dt) => (
                  <button
                    key={dt}
                    className={`pv2-sys-toggle ${(store.formValues.driveType ?? 'manual') === dt ? 'pv2-sys-toggle--active' : ''}`}
                    onClick={() => store.setFormValue('driveType', dt)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {dt === 'manual' ? 'settings_remote' : 'electric_bolt'}
                    </span>
                    {dt === 'manual' ? 'Manual' : 'Motorizado'}
                  </button>
                ))}
              </div>
            </div>
            {/* Sistema de Montaje */}
            <div className="pv2-sys-section">
              <span className="pv2-label">Sistema de Montaje</span>
              <div className="pv2-sys-toggle-group" style={{ flexWrap: "wrap" }}>
                {([
                  { val: 'standard'       as const, label: 'Est\u00e1ndar',      icon: 'grid_view' },
                  { val: 'pin_endplug'   as const, label: 'Pin EndPlug',   icon: 'push_pin' },
                  { val: 'double_bracket' as const, label: 'Bracket Doble', icon: 'view_column' },
                ]).map(({ val, label, icon }) => {
                  const isActive = (store.mountingSystem ?? 'standard') === val;
                  return (
                    <button
                      key={val}
                      className={isActive ? "pv2-sys-toggle pv2-sys-toggle--active" : "pv2-sys-toggle"}
                      onClick={() => store.setMountingSystem(val)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Tono de herrajes — auto + override manual */}
            <div className="pv2-sys-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span className="pv2-label" style={{ margin: 0 }}>Tono de Herrajes</span>
                {toneOverride !== null && (
                  <button
                    onClick={() => setToneOverride(null)}
                    style={{ fontSize: '0.55rem', color: '#6b7280', background: 'none', border: '1px solid #374151', borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer' }}
                    title="Volver al tono automático"
                  >
                    ↺ Auto
                  </button>
                )}
              </div>
              <div className="pv2-sys-toggle-group" style={{ flexWrap: 'wrap' }}>
                {([
                  { val: 'white',  label: 'White',  dot: '#f0ece4' },
                  { val: 'ivory',  label: 'Ivory',  dot: '#d4c8b0' },
                  { val: 'grey',   label: 'Grey',   dot: '#838b91' },
                  { val: 'bronze', label: 'Bronze', dot: '#a07840' },
                ] as const).map(({ val, label, dot }) => {
                  const isAuto = val === autoTone && toneOverride === null;
                  const isActive = selectedTone === val;
                  return (
                    <button
                      key={val}
                      className={`pv2-sys-toggle ${isActive ? 'pv2-sys-toggle--active' : ''}`}
                      onClick={() => setToneOverride(val)}
                      title={isAuto ? 'Auto-detectado del color de tela' : ''}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                      {label}
                      {isAuto && <span style={{ fontSize: '0.48rem', opacity: 0.7, marginLeft: 1 }}>AUTO</span>}
                    </button>
                  );
                })}
              </div>
              {selectedTone === null && (
                <div style={{ marginTop: '0.5rem', color: '#fca5a5', fontSize: '0.72rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                  <span>No hay tono automático configurado para este color. Selecciona el tono manualmente.</span>
                </div>
              )}
            </div>

            {/* BOM Table — SKU + cantidad, sin inventario */}
            {hwItems.length > 0 ? (
              <div style={{ flex: 1, overflowY: 'auto', marginTop: '0.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.35)' }}>
                      {['Componente', 'SKU', 'Cant.'].map(h => (
                        <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hwItems.map((item, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.35rem 0.5rem' }}>
                          <div style={{ color: '#e5e7eb', fontSize: '0.66rem', fontWeight: 600 }}>
                            {bomDisplayLabel(item.componente, item.skuFinal)}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: '0.55rem', marginTop: '1px' }}>
                            {getHWDesc(item.skuFinal) ?? item.componente}
                          </div>
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', fontWeight: 700, color: '#f9fafb', fontFamily: 'monospace', fontSize: '0.62rem' }}>
                          {item.skuFinal}
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', color: '#a5b4fc', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
                          {item.unidad === 'm'
                            ? `${(item.cantidadCalculada * M_TO_FT).toFixed(2)} ft`
                            : `${item.cantidadCalculada} EA`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem', color: '#4b5563' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>construction</span>
                <span style={{ fontSize: '0.75rem' }}>Ingresa dimensiones para ver el BOM</span>
              </div>
            )}

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

      {/* ── Bracket Doble width guard modal (portal) ─────────────────────── */}
      {widthGuard.needsConfirmation && (
        <DoubleBracketWidthAlert
          widthM={parsedFormValues?.widthMeters ?? 0}
          onCancel={widthGuard.handleCancel}
          onConfirm={widthGuard.handleConfirm}
        />
      )}

      {/* ── Fabricación especial inline badge ────────────────────────────── */}
      {widthGuard.approvalState === 'risk_accepted' && (
        <div
          style={{
            position: 'fixed',
            bottom: '4.5rem',
            right: '1rem',
            zIndex: 8000,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 10,
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.72rem',
            color: '#fca5a5',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
          Fabricación Especial · Riesgo asumido por cliente
        </div>
      )}
    </div>
  );
}



