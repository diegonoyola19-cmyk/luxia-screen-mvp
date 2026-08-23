/**
 * ProductionModuleV2 — Diseño Stitch "Luxia Industrial Intelligence" Focus Mode
 * Conectado 100% al store real (useCalculatorStore + useCalculatorDerivedState)
 * Sin afectar reglas de cálculo ni de fabricación existentes.
 */
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
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
import { getNextOrderNumber } from '../utils';
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
  'black/black': '#1a1a1a',
  'light grey/grey-grey': '#9aa8b0',
  'beige/bisque': '#d4b896',
  'fawn/off white': '#d6c9ad',
  'stone/dark grey': '#5c6166',
  smoke: '#838b91',
  'white/snow flakes': '#eeece8',
  beige: '#d9c4a4',
  bisque: '#c9a87c',
  black: '#1a1a1a',
  'brown/chocolate': '#4a3228',
  ebony: '#2e2822',
  'ebony pearl': '#2a2a30',
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
  'sand custard': '#cdb07a',
  'sand linen': '#c4b090',
  'gold custard': '#c8a050',
  'sand ebony': '#7a6648',
  'bronze custard': '#a07840',
  'calico 550 ebony sand': '#6b5a42',
};

function getSwatchColor(color?: string | null): string {
  if (!color) return '#c8bfb0';
  const n = color.trim().toLowerCase();
  if (FABRIC_COLOR_MAP[n]) return FABRIC_COLOR_MAP[n];
  const match = Object.keys(FABRIC_COLOR_MAP).find((k) => n.includes(k) || k.includes(n));
  return match ? FABRIC_COLOR_MAP[match] : '#c8bfb0';
}

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
  
  // UI-only state
  const [isSaving, setIsSaving] = useState(false);
  const [scrapsOpen, setScrapsOpen] = useState(false);
  const [useManualRetazo, setUseManualRetazo] = useState(false);
  const [manualRetazoSqYd, setManualRetazoSqYd] = useState('');
  const [oversizedRotatedAccepted, setOversizedRotatedAccepted] = useState(false);
  const [forcedRotatedAccepted, setForcedRotatedAccepted] = useState(false);
  const [cantidadInput, setCantidadInput] = useState<string>('1');
  const [isBomDrawerOpen, setIsBomDrawerOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [isPreviewDetailOpen, setIsPreviewDetailOpen] = useState(false);

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

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBomDrawerOpen) {
        setIsBomDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBomDrawerOpen]);

  // -- Tono de herrajes: conectado al store para persistir en saveOrder ----------
  const toneOverride = store.hardwareTone as Tone | null;
  const setToneOverride = (t: Tone | null) => store.setHardwareTone(t);
  
  const autoTone = useMemo(() => {
    const extractedColor = extractFabricColorName(selectedFabricPreview || store.formValues.fabricColor);
    return resolveHardwareToneFromFabricColor(extractedColor);
  }, [store.formValues.fabricColor, selectedFabricPreview]);

  const selectedTone = toneOverride ?? autoTone;
  const activeTone: Tone = selectedTone ?? 'white';

  const typedMatches = colorWasteMatches as WasteReuseMatch[];
  const hasRetazos = typedMatches.length > 0 && hasValidDimensions;
  const usingWaste = Boolean(store.selectedWastePieceId);

  // ── Bracket Doble width guard ───────────────────────────────────────────
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
  const hwItems = useMemo((): BOMItem[] => {
    const w = parsedFormValues?.widthMeters ?? 0;
    const h = parsedFormValues?.heightMeters ?? 0;
    if (w <= 0 || h <= 0) return [];
    if (widthGuard.approvalState === 'cancelled') return [];
    if (store.formValues.driveType === 'motorized') return [];
    try { return generateRollerBOM(w, h, activeTone, store.mountingSystem ?? 'standard').items; }
    catch { return []; }
  }, [parsedFormValues?.widthMeters, parsedFormValues?.heightMeters, activeTone, store.mountingSystem, widthGuard.approvalState, store.formValues.driveType]);

  const tubeItem = useMemo(() => {
    return hwItems.find(i => i.componente.includes('Tubo')) ?? null;
  }, [hwItems]);

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

  const canAdd = Boolean(displayResult) && 
    (!displayResult?.oversizedRotated || oversizedRotatedAccepted) &&
    (!displayResult?.forcedRotatedByRollLimit || forcedRotatedAccepted) &&
    store.formValues.driveType !== 'motorized';

  const trimmedDraftOrderNumber = (store.orderDraft?.orderNumber || '').trim();
  const isDuplicateOrderNumber = Boolean(
    trimmedDraftOrderNumber &&
    (store.savedOrders || []).some(
      (o) => (o?.orderNumber || '').trim().toLowerCase() === trimmedDraftOrderNumber.toLowerCase()
    )
  );

  const canSave = trimmedDraftOrderNumber !== '' &&
    !isDuplicateOrderNumber &&
    store.itemsAProducir.length > 0 &&
    !store.cuttingGroups.some((g) => g.error);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddToBatch = useCallback(() => {
    if (
      !displayResult || !parsedFormValues?.curtainType ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined ||
      !parsedFormValues.fabricFamily || !parsedFormValues.fabricOpenness ||
      !parsedFormValues.fabricColor ||
      !canAdd
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
          ...(widthGuard.specialFabricationMeta ?? {}),
        },
        result: displayResult,
        reusedWastePiece: (selectedWasteMatch as WasteReuseMatch | null)?.wastePiece ?? null,
      };
      store.addProductionItem(item);
    }

    // Feedback ligero
    if (typeof toast !== 'undefined' && toast.success) {
      toast.success(parsedQty > 1 ? `✓ ${parsedQty} persianas agregadas al lote` : '✓ Persiana agregada al lote');
    }

    // Resetear dimensiones manteniendo tela, color, tono y montaje
    store.setSelectedWastePieceId(null);
    store.setFormValue('widthMeters', '');
    store.setFormValue('heightMeters', '');
    setOversizedRotatedAccepted(false);
    setForcedRotatedAccepted(false);
    setCantidadInput('1');
    window.requestAnimationFrame(() => widthRef.current?.focus());
  }, [
    displayResult,
    parsedFormValues,
    canAdd,
    parsedQty,
    store,
    activeTone,
    oversizedRotatedAccepted,
    forcedRotatedAccepted,
    widthGuard.specialFabricationMeta,
    selectedWasteMatch
  ]);

  const handleSaveOrder = async () => {
    store.setHardwareTone(activeTone);
    try {
      setIsSaving(true);
      await store.saveOrder();
      if (typeof toast !== 'undefined' && toast.success) {
        toast.success('✓ Orden guardada correctamente');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Fabric preview info ────────────────────────────────────────────────────
  const fabricLabel = [store.formValues.fabricFamily, store.formValues.fabricOpenness, store.formValues.fabricColor]
    .filter(Boolean).join(' · ') || 'Sin especificar';
  const selectedSwatchColor = getSwatchColor(store.formValues.fabricColor);

  return (
    <div className="pv2-root">

      {/* ══ 2-COLUMN FOCUS GRID ════════════════════════════════════════════ */}
      <div className="pv2-focus-grid">

        {/* ══ LEFT COLUMN: CAPTURA DE PERSIANA (52%) ════════════════════════ */}
        <section className="pv2-focus-left">
          <div className="pv2-glass pv2-config-panel">

            {/* Header */}
            <div className="pv2-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined pv2-icon-red" style={{ fontSize: 20 }}>tune</span>
                <h2 className="pv2-headline" style={{ fontSize: '18px', margin: 0 }}>Configuración de Persiana</h2>
              </div>
            </div>

            {isReadOnly && (
              <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px', padding: '6px 10px', backgroundColor: 'var(--primary-glow)', borderRadius: '4px', border: '1px solid rgba(192,37,58,0.2)' }}>
                🔒 <strong>Solo Lectura:</strong> Acciones de modificación deshabilitadas.
              </div>
            )}

            {/* 1. SECCIÓN: TELA Y COLOR */}
            <div className="pv2-section-group">
              <div className="pv2-section-header">
                <span className="pv2-section-title">1. Tela y Color</span>
                {fabricLabel !== 'Sin especificar' && (
                  <span className="pv2-section-subtitle">{fabricLabel}</span>
                )}
              </div>
              
              <div className="pv2-grid-2">
                <div className="pv2-field">
                  <label className="pv2-label" htmlFor="select-linea-tela">Línea de Tela</label>
                  <select
                    id="select-linea-tela"
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
                  <label className="pv2-label" htmlFor="select-openness">Openness</label>
                  <select
                    id="select-openness"
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

              {/* Swatches de Color Compactos */}
              <div className="pv2-field" style={{ marginTop: '4px' }}>
                <div className="pv2-swatches-compact">
                  {fabricColorOptions.length > 0 ? (
                    fabricColorOptions.map((opt) => {
                      const isActive = store.formValues.fabricColor === opt.color;
                      return (
                        <button
                          key={opt.color}
                          type="button"
                          className={`pv2-swatch-chip ${isActive ? 'pv2-swatch-chip--active' : ''}`}
                          onClick={() => store.setFabricColor(opt.color)}
                          title={opt.color}
                        >
                          {opt.imageUrl ? (
                            <img
                              src={opt.imageUrl}
                              alt={opt.color}
                              className="pv2-swatch-chip-img"
                            />
                          ) : (
                            <div
                              className="pv2-swatch-chip-circle"
                              style={{ background: getSwatchColor(opt.color) }}
                            />
                          )}
                          <span className="pv2-swatch-chip-label">{getColorLabel(opt.color)}</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="pv2-muted-sm">Selecciona línea y openness</span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. SECCIÓN: MEDIDAS Y MONTAJE */}
            <div className="pv2-section-group">
              <div className="pv2-section-title-row">
                <span className="pv2-section-title">2. Medidas y Montaje</span>
                <button
                  type="button"
                  className="pv2-btn-reset-icon"
                  onClick={() => {
                    store.handleNewCurtain();
                    widthRef.current?.focus();
                  }}
                  title="Limpiar medidas de persiana"
                  aria-label="Limpiar persiana actual"
                  disabled={isReadOnly}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>restart_alt</span>
                </button>
              </div>

              {/* Dimensiones en 1 sola fila: Ancho, Alto, Cantidad + Botón [+] */}
              <div className="pv2-grid-dims-action">
                <div className="pv2-field">
                  <label className="pv2-label" htmlFor="input-ancho">Ancho (m)</label>
                  <input
                    id="input-ancho"
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
                    <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>
                      {displayErrors.widthMeters}
                    </div>
                  )}
                </div>
                <div className="pv2-field">
                  <label className="pv2-label" htmlFor="input-alto">Alto (m)</label>
                  <input
                    id="input-alto"
                    className="pv2-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={store.formValues.heightMeters}
                    onChange={(e) => store.setFormValue('heightMeters', e.target.value)}
                    onBlur={() => store.handleFieldBlur('heightMeters')}
                  />
                  {displayErrors.heightMeters && (
                    <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>
                      {displayErrors.heightMeters}
                    </div>
                  )}
                </div>
                <div className="pv2-field pv2-field-qty">
                  <label className="pv2-label" htmlFor="input-cantidad">Cantidad</label>
                  <input
                    id="input-cantidad"
                    className="pv2-input pv2-input-qty"
                    type="number"
                    min="1"
                    step="1"
                    value={cantidadInput}
                    onChange={(e) => setCantidadInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canAdd && !isReadOnly) {
                        e.preventDefault();
                        handleAddToBatch();
                      }
                    }}
                  />
                </div>
                <div className="pv2-field pv2-field-add-btn">
                  <span className="pv2-label pv2-label-placeholder" aria-hidden="true">&nbsp;</span>
                  <button
                    type="button"
                    className={`pv2-btn-add-inline ${canAdd && !isReadOnly ? 'pv2-btn-add-inline--active' : ''}`}
                    onClick={handleAddToBatch}
                    disabled={isReadOnly || !canAdd}
                    title={isReadOnly ? "No tienes permisos de escritura" : (displayErrors.general || (canAdd ? "Agregar persiana al lote" : (!hasValidDimensions ? "Ingresa dimensiones válidas para agregar" : (displayResult?.oversizedRotated && !oversizedRotatedAccepted ? "Debes confirmar la fabricación rotada para agregar" : (displayResult?.forcedRotatedByRollLimit && !forcedRotatedAccepted ? "Debes confirmar la rotación por límite de rollo para agregar" : "Completa la configuración para agregar")))))}
                    aria-label="Agregar persiana al lote"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
                    <span className="pv2-btn-add-inline-label">Agregar</span>
                  </button>
                </div>
              </div>

              {/* Sistema de Montaje (Segmented Control Horizontal) */}
              <div className="pv2-field" style={{ marginTop: '4px' }}>
                <span className="pv2-label">Sistema de Montaje</span>
                <div className="pv2-segmented-control">
                  {([
                    { val: 'standard'       as const, label: 'Estándar',      icon: 'grid_view' },
                    { val: 'pin_endplug'   as const, label: 'Pin EndPlug',   icon: 'push_pin' },
                    { val: 'double_bracket' as const, label: 'Bracket Doble', icon: 'view_column' },
                  ]).map(({ val, label, icon }) => {
                    const isActive = (store.mountingSystem ?? 'standard') === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        className={`pv2-segmented-btn ${isActive ? "pv2-segmented-btn--active" : ""}`}
                        onClick={() => store.setMountingSystem(val)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accionamiento (Segmented Control Horizontal con Motorizado explícitamente No Disponible) */}
              <div className="pv2-field" style={{ marginTop: '4px' }}>
                <span className="pv2-label">Accionamiento</span>
                <div className="pv2-segmented-control">
                  <button
                    type="button"
                    className={`pv2-segmented-btn ${(store.formValues.driveType ?? 'manual') === 'manual' ? 'pv2-segmented-btn--active' : ''}`}
                    onClick={() => store.setFormValue('driveType', 'manual')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>settings_remote</span>
                    <span>Manual</span>
                  </button>
                  <button
                    type="button"
                    className="pv2-segmented-btn pv2-segmented-btn--disabled"
                    disabled
                    title="Configuración motorizada no disponible en esta versión (reglas de motor pendientes de catálogo)"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span>
                    <span>Motorizado (No disp.)</span>
                  </button>
                </div>
                {store.formValues.driveType === 'motorized' && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', padding: '0.4rem 0.6rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', lineHeight: 1.3 }}>
                    ⚠️ <strong>Configuración motorizada no disponible en esta versión</strong> (reglas de motor pendientes de catálogo).
                  </div>
                )}
              </div>
            </div>

            {/* 3. SECCIÓN: BOM COMPACTO & ALERTAS CRÍTICAS */}
            <div className="pv2-section-group">
              <span className="pv2-section-title">3. Manufactura & BOM</span>

              {/* BOM Compact Card / Row */}
              {hwItems.length > 0 ? (
                <div className="pv2-bom-compact-row">
                  <div className="pv2-bom-compact-left">
                    <span className="material-symbols-outlined pv2-bom-check-icon">check_circle</span>
                    <span className="pv2-bom-compact-text">
                      <strong>BOM V2 Válido</strong>
                      <span className="pv2-bom-compact-sep">·</span>
                      {tubeItem ? `${bomDisplayLabel(tubeItem.componente, tubeItem.skuFinal)} (${tubeItem.skuFinal})` : 'Estructura lista'}
                      <span className="pv2-bom-compact-sep">·</span>
                      {hwItems.length} componentes
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pv2-bom-drawer-toggle-btn"
                    onClick={() => setIsBomDrawerOpen(true)}
                    aria-label="Ver desglose completo de BOM"
                  >
                    <span>Ver BOM</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                  </button>
                </div>
              ) : (
                <div className="pv2-bom-empty-row">
                  <span className="material-symbols-outlined" style={{ fontSize: 15, opacity: 0.5 }}>info</span>
                  <span>— Ingresa dimensiones para calcular BOM</span>
                </div>
              )}

              {/* Alertas Críticas (SIEMPRE visibles en el panel de configuración) */}
              {displayResult?.fabricSubstitution?.wasSubstituted && displayResult.fabricSubstitution.reason === 'substituted_to_larger_width' && (
                <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                    <div>
                      <strong>No hay stock en ancho {formatNumber(displayResult.fabricSubstitution.originalWidthMeters ?? 0, 2)}m. Se usará ancho {formatNumber(displayResult.fabricSubstitution.selectedWidthMeters ?? 0, 2)}m.</strong>
                      {displayResult.fabricSubstitution.requiredYd2 != null && displayResult.fabricSubstitution.availableYd2 != null && (
                        <p style={{ marginTop: '0.2rem', fontSize: '11px' }}>
                          Requiere {formatNumber(displayResult.fabricSubstitution.requiredYd2, 2)} yd². Disponible: {formatNumber(displayResult.fabricSubstitution.availableYd2, 2)} yd².
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!displayResult?.fabricSubstitution?.wasSubstituted && displayResult?.fabricSubstitution?.warnings?.some(w => w.severity === 'error') && (
                <div className="pv2-alert pv2-alert--warning" style={{ marginTop: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                  <div>
                    <strong>No hay stock suficiente para la tela seleccionada.</strong>
                  </div>
                </div>
              )}

              {displayResult?.oversizedRotated ? (
                <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                    <div>
                      <strong>Fabricación rotada requerida</strong>
                      <p style={{ fontSize: '11px' }}>Esta cortina supera los 3.00 m de ancho. Se fabricará rotada usando el ancho del rollo como alto.</p>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={oversizedRotatedAccepted}
                      onChange={(e) => setOversizedRotatedAccepted(e.target.checked)}
                      style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                    />
                    Confirmo fabricar esta cortina rotada
                  </label>
                </div>
              ) : displayResult?.forcedRotatedByRollLimit ? (
                <div className="pv2-alert pv2-alert--warning" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                    <div>
                      <strong>Fabricación rotada por ancho de rollo</strong>
                      <p style={{ fontSize: '11px' }}>Esta tela no tiene un ancho de rollo suficiente para fabricación normal.</p>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={forcedRotatedAccepted}
                      onChange={(e) => setForcedRotatedAccepted(e.target.checked)}
                      style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                    />
                    Confirmo fabricar esta cortina rotada
                  </label>
                </div>
              ) : displayResult?.orientationUsed === 'volteada' && (
                <div className="pv2-alert pv2-alert--info" style={{ marginTop: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>rotate_90_degrees_ccw</span>
                  <div>
                    <strong>Fabricación Rotada (90°)</strong>
                  </div>
                </div>
              )}

              {/* Edge Roll Fit alert */}
              {displayResult?.edgeRollFit && (
                <div className="pv2-alert pv2-alert--warning" style={{ marginTop: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>fit_screen</span>
                  <div>
                    <strong>Corte justo al rollo</strong> (sin encuadre lateral estándar).
                  </div>
                </div>
              )}

              {/* Tubo reforzado alert */}
              {displayResult?.requiresReinforcedTube && !displayResult?.oversizedRotated && (
                <div className="pv2-alert pv2-alert--warning" style={{ marginTop: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                  <div>
                    <strong>Aviso de Estructura:</strong> {displayResult.tubeRecommendation}
                  </div>
                </div>
              )}

              {displayErrors.general && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px', padding: '6px 8px', backgroundColor: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '4px' }}>error</span>
                  {displayErrors.general}
                </div>
              )}
            </div>

          </div>
        </section>

        {/* ══ RIGHT COLUMN: LOTE + PREVIEW + OPCIONES AVANZADAS + GUARDAR (48%) ════ */}
        <section className="pv2-focus-right">
          <div className="pv2-glass pv2-batch-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* A. Header del Lote & N° Orden + ● Mesa activa */}
            <div className="pv2-batch-header">
              <div className="pv2-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined pv2-icon-red" style={{ fontSize: 20 }}>inventory_2</span>
                  <h2 className="pv2-headline" style={{ fontSize: '18px', margin: 0 }}>Lote de Producción</h2>
                  <span className="pv2-mesa-status-badge">
                    <span className="pv2-mesa-pip" />
                    Mesa activa
                  </span>
                </div>
                <div className="pv2-order-input-wrapper">
                  <label htmlFor="input-order-number" className="pv2-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>N° Orden:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' }}>
                    <input
                      id="input-order-number"
                      className={`pv2-input pv2-input-order ${isDuplicateOrderNumber ? 'pv2-input--error' : ''}`}
                      type="text"
                      placeholder="ORD-001"
                      value={store.orderDraft.orderNumber}
                      onChange={(e) => store.setOrderNumber(e.target.value)}
                      disabled={isReadOnly}
                      style={isDuplicateOrderNumber ? { borderColor: 'var(--color-danger, #e53935)', background: 'rgba(229, 57, 53, 0.08)' } : undefined}
                      title={isDuplicateOrderNumber ? 'Este número de orden ya existe en órdenes guardadas' : undefined}
                    />
                    {isDuplicateOrderNumber && (
                      <span style={{ color: 'var(--color-danger, #e53935)', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', marginTop: '1px' }}>
                        ⚠️ Ya existe esta orden
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* B. KPIs del Lote — 4 Pills Compactas con fallback em-dash */}
              <div className="pv2-batch-kpis">
                <div className="pv2-kpi-pill">
                  <span className="pv2-kpi-pill-val">{summary.curtains}</span>
                  <span className="pv2-kpi-pill-lbl">{summary.curtains === 1 ? 'Cortina' : 'Cortinas'}</span>
                </div>
                <div className="pv2-kpi-pill">
                  <span className="pv2-kpi-pill-val">{summary.cuts}</span>
                  <span className="pv2-kpi-pill-lbl">{summary.cuts === 1 ? 'Corte' : 'Cortes'}</span>
                </div>
                <div className={`pv2-kpi-pill ${summary.curtains > 0 && summary.efficiency >= 90 ? 'pv2-kpi-pill--good' : summary.curtains > 0 ? 'pv2-kpi-pill--mid' : ''}`}>
                  <span className="pv2-kpi-pill-val">
                    {summary.curtains > 0 ? `${Math.round(summary.efficiency)}%` : '—'}
                  </span>
                  <span className="pv2-kpi-pill-lbl">Eficiencia</span>
                </div>
                <div className="pv2-kpi-pill">
                  <span className="pv2-kpi-pill-val">
                    {summary.curtains > 0 ? `${formatNumber(summary.totalWaste, 2)}m` : '—'}
                  </span>
                  <span className="pv2-kpi-pill-lbl">Desperdicio</span>
                </div>
              </div>
            </div>

            {/* C. Tabla de Cortes del Lote (Scroll interno cuando crece) */}
            <div className="pv2-table-scroll" style={{ flex: '0 1 auto', maxHeight: '180px', minHeight: '110px' }}>
              <table className="pv2-table">
                <thead>
                  <tr className="pv2-thead-row">
                    <th className="pv2-th">Fila</th>
                    <th className="pv2-th">Rollo</th>
                    <th className="pv2-th">Utilizado</th>
                    <th className="pv2-th">Piezas en este corte</th>
                    <th className="pv2-th">Eficiencia</th>
                    <th className="pv2-th pv2-th-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {store.cuttingGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="pv2-table-empty">
                        <div className="pv2-empty-state-clean">
                          <span className="material-symbols-outlined pv2-empty-state-icon">inventory_2</span>
                          <strong className="pv2-empty-state-title">El lote está vacío</strong>
                          <p className="pv2-empty-state-subtitle">Agrega una persiana para comenzar</p>
                        </div>
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
                          <td className="pv2-td pv2-td-mono" data-label="Fila">{rowId}</td>
                          <td className="pv2-td pv2-td-muted" data-label="Rollo">{formatNumber(rollW, 2)}m</td>
                          <td className="pv2-td pv2-td-mono" data-label="Utilizado">{formatNumber(usedWidth, 2)}m</td>
                          <td className="pv2-td" data-label="Piezas">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: '600' }}>{pieces} {pieces === 1 ? 'Cortina' : 'Cortinas'}</span>
                              {group.items.map((item: any) => (
                                <span key={item.id} style={{ fontSize: '11px', color: '#9ca3af' }}>
                                  {formatNumber(item.input.widthMeters, 2)}m × {formatNumber(item.input.heightMeters, 2)}m
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
                              type="button"
                              className="pv2-row-action"
                              onClick={() => {
                                if (isReadOnly) return;
                                group.items.forEach((item: any) => store.removeProductionItem(item.id));
                              }}
                              disabled={isReadOnly}
                              title={isReadOnly ? "No tienes permisos" : "Eliminar fila del lote"}
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

            {/* D. PREVIEW DE FABRICACIÓN COMPACTO (Informativo, Read-Only, Plegable) */}
            <div className="pv2-mfg-preview-card" style={{ marginTop: '8px' }}>
              <div className="pv2-mfg-preview-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined pv2-icon-red" style={{ fontSize: 16 }}>precision_manufacturing</span>
                  <span className="pv2-mfg-preview-title">
                    {store.cuttingGroups.length > 0 ? 'Preview de Fabricación' : hasValidDimensions && displayResult ? 'Vista Previa Estimada' : 'Vista Previa de Fabricación'}
                  </span>
                  {store.cuttingGroups.length > 0 ? (
                    <span className="pv2-mfg-badge">{store.cuttingGroups.length} {store.cuttingGroups.length === 1 ? 'corte activo' : 'cortes activos'}</span>
                  ) : hasValidDimensions && displayResult ? (
                    <span className="pv2-mfg-badge pv2-mfg-badge--estimate">Estimación actual</span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(store.cuttingGroups.length > 0 || (hasValidDimensions && Boolean(displayResult))) && (
                    <button
                      type="button"
                      className="pv2-btn-ghost-sm"
                      onClick={() => setIsPreviewDetailOpen(true)}
                      style={{ fontSize: '11px', color: '#60a5fa', padding: '2px 6px', fontWeight: 600 }}
                      aria-label="Ver detalle completo de fabricación"
                    >
                      Ver detalle
                    </button>
                  )}
                  <button
                    type="button"
                    className="pv2-btn-ghost-sm"
                    onClick={() => setIsPreviewCollapsed(v => !v)}
                    style={{ fontSize: '11px', padding: '2px 6px' }}
                    aria-expanded={!isPreviewCollapsed}
                  >
                    {isPreviewCollapsed ? 'Mostrar' : 'Ocultar'}
                  </button>
                </div>
              </div>

              {/* Contenido del Preview: Lote activo o Estimación del formulario */}
              {!isPreviewCollapsed && (
                store.cuttingGroups.length > 0 ? (
                  <div className="pv2-mfg-preview-body">
                    {store.cuttingGroups.map((group, gIdx) => {
                      const rollW = group.rollWidth || 2.50;
                      const usedW = group.totalCutWidth;
                      const wasteW = Math.max(0, group.waste);
                      const eff = rollW > 0 ? Math.min((usedW / rollW) * 100, 100) : 0;
                      const firstItem = group.items[0];
                      const orientation = firstItem?.result?.orientationUsed ?? 'normal';
                      const isEdge = Boolean(firstItem?.result?.edgeRollFit);
                      const tubeDesc = firstItem?.result?.tubeRecommendation || 'Tubo Estándar';

                      return (
                        <div key={group.id ?? gIdx} className="pv2-mfg-group-row">
                          {/* Sub-header técnico compacto */}
                          <div className="pv2-mfg-compact-techline">
                            <span>Estructura: <strong>{tubeDesc}</strong></span>
                            <span>·</span>
                            <span>Rollo: <strong>{formatNumber(rollW, 2)}m</strong></span>
                            {orientation === 'volteada' && <span className="pv2-pill-rotated">↻ Rotada 90°</span>}
                            {isEdge && <span className="pv2-pill-edge">Fit al Rollo</span>}
                          </div>

                          {/* Diagrama Gráfico de Rollo / Cortes */}
                          <div className="pv2-roll-diagram">
                            <div className="pv2-roll-bar-header">
                              <span className="pv2-roll-tag">ROLLO {formatNumber(rollW, 2)}m</span>
                              <span className="pv2-roll-util">Utilización: {Math.round(eff)}%</span>
                            </div>
                            <div className="pv2-roll-track" role="img" aria-label={`Diagrama de corte de rollo de ${formatNumber(rollW, 2)}m`}>
                              {group.items.map((item: any, pIdx: number) => {
                                const pieceW = item.input.widthMeters;
                                const pct = Math.max(8, Math.min((pieceW / rollW) * 100, 100));
                                return (
                                  <div
                                    key={item.id ?? pIdx}
                                    className="pv2-roll-piece"
                                    style={{ width: `${pct}%` }}
                                    title={`Cortina ${pIdx + 1} (${formatNumber(pieceW, 2)}m × ${formatNumber(item.input.heightMeters, 2)}m)`}
                                  >
                                    <span className="pv2-roll-piece-label">P{pIdx + 1} · {formatNumber(pieceW, 2)}m</span>
                                  </div>
                                );
                              })}
                              {wasteW > 0.01 && (
                                <div
                                  className="pv2-roll-waste"
                                  style={{ width: `${Math.max(8, (wasteW / rollW) * 100)}%` }}
                                  title={`Merma: ${formatNumber(wasteW, 2)}m`}
                                >
                                  <span className="pv2-roll-waste-label">Merma {formatNumber(wasteW, 2)}m</span>
                                </div>
                              )}
                            </div>
                            <div className="pv2-roll-meta-row">
                              <span>Utilizado: <strong>{formatNumber(usedW, 2)}m ({Math.round(eff)}%)</strong></span>
                              <span>·</span>
                              <span>Desperdicio: <strong>{formatNumber(wasteW, 2)}m</strong></span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : hasValidDimensions && displayResult ? (
                  /* Estimación con Formulario Actual */
                  <div className="pv2-mfg-preview-body">
                    {(() => {
                      const rollW = displayResult.recommendedRollWidthMeters || displayResult.fabricSubstitution?.selectedWidthMeters || 2.50;
                      const usedW = parsedFormValues?.widthMeters ?? displayResult.cutWidthMeters ?? 0;
                      const wasteW = Math.max(0, displayResult.wasteWidthMeters ?? (rollW - usedW));
                      const eff = rollW > 0 ? Math.min((usedW / rollW) * 100, 100) : 0;
                      const orientation = displayResult.orientationUsed ?? 'normal';
                      const isEdge = Boolean(displayResult.edgeRollFit);
                      const tubeDesc = displayResult.tubeRecommendation || (tubeItem ? bomDisplayLabel(tubeItem.componente, tubeItem.skuFinal) : 'Tubo Estándar');

                      return (
                        <div className="pv2-mfg-group-row">
                          {/* Sub-header técnico compacto */}
                          <div className="pv2-mfg-compact-techline">
                            <span>Estructura: <strong>{tubeDesc}</strong></span>
                            <span>·</span>
                            <span>Rollo: <strong>{formatNumber(rollW, 2)}m</strong></span>
                            {orientation === 'volteada' && <span className="pv2-pill-rotated">↻ Rotada 90°</span>}
                            {isEdge && <span className="pv2-pill-edge">Fit al Rollo</span>}
                          </div>

                          {/* Diagrama Gráfico de Rollo */}
                          <div className="pv2-roll-diagram">
                            <div className="pv2-roll-bar-header">
                              <span className="pv2-roll-tag">ROLLO {formatNumber(rollW, 2)}m</span>
                              <span className="pv2-roll-util">Utilización: {Math.round(eff)}%</span>
                            </div>
                            <div className="pv2-roll-track" role="img" aria-label={`Diagrama de corte estimado sobre rollo de ${formatNumber(rollW, 2)}m`}>
                              <div
                                className="pv2-roll-piece"
                                style={{ width: `${Math.max(10, Math.min((usedW / rollW) * 100, 100))}%` }}
                                title={`Cortina estimada: ${formatNumber(usedW, 2)}m`}
                              >
                                <span className="pv2-roll-piece-label">Cortina 1 · {formatNumber(usedW, 2)}m</span>
                              </div>
                              {wasteW > 0.01 && (
                                <div
                                  className="pv2-roll-waste"
                                  style={{ width: `${Math.max(8, (wasteW / rollW) * 100)}%` }}
                                  title={`Merma estimada: ${formatNumber(wasteW, 2)}m`}
                                >
                                  <span className="pv2-roll-waste-label">Merma {formatNumber(wasteW, 2)}m</span>
                                </div>
                              )}
                            </div>
                            <div className="pv2-roll-meta-row">
                              <span>Utilizado: <strong>{formatNumber(usedW, 2)}m ({Math.round(eff)}%)</strong></span>
                              <span>·</span>
                              <span>Desperdicio: <strong>{formatNumber(wasteW, 2)}m</strong></span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* Estado Vacío Informativo */
                  <div className="pv2-mfg-empty">
                    <span className="material-symbols-outlined pv2-mfg-empty-icon">precision_manufacturing</span>
                    <strong className="pv2-mfg-empty-title">Configura una persiana</strong>
                    <p className="pv2-mfg-empty-subtitle">Ingresa dimensiones para ver la disposición de corte en el rollo</p>
                  </div>
                )
              )}
            </div>

            {/* E. SECCIÓN: OPCIONES AVANZADAS (Acordeón Plegable en Panel Derecho) */}
            <div className="pv2-advanced-accordion" style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="pv2-advanced-toggle"
                onClick={() => setIsAdvancedOpen(v => !v)}
                aria-expanded={isAdvancedOpen}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>tune</span>
                  <span>Opciones avanzadas</span>
                  {toneOverride !== null && (
                    <span className="pv2-advanced-badge">Tono manual</span>
                  )}
                  {usingWaste && (
                    <span className="pv2-advanced-badge">Retazo activo</span>
                  )}
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {isAdvancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {isAdvancedOpen && (
                <div className="pv2-advanced-body">
                  {/* Tono de herrajes */}
                  <div className="pv2-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="pv2-label" style={{ margin: 0 }}>Tono de Herrajes</span>
                      {toneOverride !== null && (
                        <button
                          type="button"
                          onClick={() => setToneOverride(null)}
                          style={{ fontSize: '0.65rem', color: '#9ca3af', background: 'none', border: '1px solid #374151', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                          title="Volver al tono automático"
                        >
                          ↺ Auto
                        </button>
                      )}
                    </div>
                    <div className="pv2-segmented-control">
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
                            type="button"
                            className={`pv2-segmented-btn ${isActive ? 'pv2-segmented-btn--active' : ''}`}
                            onClick={() => setToneOverride(val)}
                            title={isAuto ? 'Auto-detectado del color de tela' : ''}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                            <span>{label}</span>
                            {isAuto && <span style={{ fontSize: '0.5rem', opacity: 0.7, marginLeft: 2 }}>AUTO</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel de Retazo */}
                  {displayResult && (
                    <div className="pv2-retazo-panel" style={{ marginTop: '10px' }}>
                      <div className="pv2-retazo-header">
                        <span className="material-symbols-outlined pv2-retazo-icon">content_cut</span>
                        <span className="pv2-retazo-title">Gestión de Retazos</span>
                        {hasRetazos && (
                          <span className="pv2-retazo-badge">{typedMatches.length} en stock</span>
                        )}
                        <button
                          type="button"
                          className="pv2-waste-toggle"
                          onClick={() => setScrapsOpen(v => !v)}
                        >
                          {scrapsOpen ? 'Cerrar' : 'Expandir'}
                        </button>
                      </div>

                      {scrapsOpen && (
                        <div className="pv2-retazo-body">
                          {hasRetazos && (
                            <>
                              <p className="pv2-retazo-section-title">Piezas disponibles en inventario</p>
                              <div className="pv2-waste-list">
                                <button
                                  type="button"
                                  className={`pv2-waste-option ${!usingWaste ? 'pv2-waste-option--active' : ''}`}
                                  onClick={() => store.setSelectedWastePieceId(null)}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fiber_new</span>
                                  <span>Rollo nuevo</span>
                                </button>
                                {typedMatches.map((match) => {
                                  const p = match.wastePiece;
                                  const isSelected = store.selectedWastePieceId === p.id;
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      className={`pv2-waste-option ${isSelected ? 'pv2-waste-option--active' : ''}`}
                                      onClick={() => store.setSelectedWastePieceId(p.id)}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cut</span>
                                      <span>
                                        {formatNumber(p.widthMeters, 2)}m × {formatNumber(p.heightMeters, 2)}m
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          <label className="pv2-retazo-toggle-row" style={{ marginTop: '8px' }}>
                            <input
                              type="checkbox"
                              className="pv2-retazo-checkbox"
                              checked={useManualRetazo}
                              onChange={(e) => {
                                setUseManualRetazo(e.target.checked);
                                if (!e.target.checked) setManualRetazoSqYd('');
                              }}
                            />
                            <span>Ingresar retazo manual en Y²</span>
                          </label>

                          {useManualRetazo && (
                            <div className="pv2-retazo-manual" style={{ marginTop: '6px' }}>
                              <input
                                className="pv2-input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00 yd²"
                                value={manualRetazoSqYd}
                                onChange={(e) => setManualRetazoSqYd(e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* F. CTA Primario de Guardado de Orden (Sticky al fondo del panel derecho) */}
            <div className="pv2-batch-footer-action">
              <button
                type="button"
                className={`pv2-btn-save-order ${isReadOnly || !canSave ? 'pv2-btn-save-order--disabled' : ''}`}
                onClick={handleSaveOrder}
                disabled={isReadOnly || !canSave || isSaving}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                <span>
                  {isSaving ? 'Guardando orden...' : `Guardar Orden · ${summary.curtains} ${summary.curtains === 1 ? 'persiana' : 'persianas'}`}
                </span>
              </button>
            </div>

          </div>
        </section>

      </div>

      {/* ══ MANUFACTURING PREVIEW DETAIL DRAWER (PORTAL OVERLAY) ═════════ */}
      {isPreviewDetailOpen && (
        <div className="pv2-bom-drawer-backdrop" onClick={() => setIsPreviewDetailOpen(false)}>
          <div
            className="pv2-bom-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle Completo de Fabricación y Corte"
          >
            <div className="pv2-bom-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined pv2-icon-red">precision_manufacturing</span>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Detalle de Fabricación y Corte</h3>
              </div>
              <button
                type="button"
                className="pv2-bom-drawer-close"
                onClick={() => setIsPreviewDetailOpen(false)}
                aria-label="Cerrar detalle de fabricación"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
              <div className="pv2-section-group">
                <span className="pv2-section-title">Especificaciones Técnicas</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginTop: '6px' }}>
                  <div><span style={{ color: '#9ca3af' }}>Tela:</span> <strong>{fabricLabel}</strong></div>
                  <div><span style={{ color: '#9ca3af' }}>Montaje:</span> <strong>{store.mountingSystem === 'pin_endplug' ? 'Pin EndPlug' : store.mountingSystem === 'double_bracket' ? 'Bracket Doble' : 'Estándar'}</strong></div>
                  <div><span style={{ color: '#9ca3af' }}>Medidas:</span> <strong>{parsedFormValues?.widthMeters ?? 0}m × {parsedFormValues?.heightMeters ?? 0}m</strong></div>
                  <div><span style={{ color: '#9ca3af' }}>Tubo:</span> <strong>{displayResult?.tubeRecommendation ?? 'Estándar'}</strong></div>
                </div>
              </div>

              {displayResult && (
                <div className="pv2-section-group">
                  <span className="pv2-section-title">Consumo y Rendimiento de Tela</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginTop: '6px' }}>
                    <div><span style={{ color: '#9ca3af' }}>Descargado:</span> <strong>{formatNumber(displayResult.fabricDownloadedYd2 ?? 0, 2)} yd²</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Útil:</span> <strong>{formatNumber(displayResult.fabricUsefulYd2 ?? 0, 2)} yd²</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Desperdicio:</span> <strong>{formatNumber(displayResult.wasteYd2 ?? 0, 2)} yd² ({Math.round(displayResult.wastePercentage ?? 0)}%)</strong></div>
                    <div><span style={{ color: '#9ca3af' }}>Orientación:</span> <strong>{displayResult.orientationUsed === 'volteada' ? 'Rotada 90°' : 'Normal'}</strong></div>
                  </div>
                </div>
              )}
            </div>

            <div className="pv2-bom-drawer-footer">
              <button
                type="button"
                className="pv2-btn-primary"
                onClick={() => setIsPreviewDetailOpen(false)}
                style={{ width: '100%' }}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SLIDING BOM DRAWER (PORTAL OVERLAY) ════════════════════════════ */}
      {isBomDrawerOpen && (
        <div className="pv2-bom-drawer-backdrop" onClick={() => setIsBomDrawerOpen(false)}>
          <div
            className="pv2-bom-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Desglose Completo de Herrajes BOM"
          >
            <div className="pv2-bom-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined pv2-icon-red">construction</span>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Desglose de Herrajes · BOM V2</h3>
              </div>
              <button
                type="button"
                className="pv2-bom-drawer-close"
                onClick={() => setIsBomDrawerOpen(false)}
                aria-label="Cerrar desglose BOM"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="pv2-bom-drawer-meta">
              <span><strong>Sistema:</strong> {store.mountingSystem === 'pin_endplug' ? 'Pin EndPlug' : store.mountingSystem === 'double_bracket' ? 'Bracket Doble' : 'Estándar'}</span>
              <span><strong>Tono:</strong> {activeTone.toUpperCase()}</span>
              <span><strong>Medida:</strong> {parsedFormValues?.widthMeters ?? 0}m × {parsedFormValues?.heightMeters ?? 0}m</span>
            </div>

            <div className="pv2-bom-drawer-table-wrap">
              <table className="pv2-table pv2-table--compact">
                <thead>
                  <tr className="pv2-thead-row">
                    <th className="pv2-th">Componente</th>
                    <th className="pv2-th">SKU</th>
                    <th className="pv2-th pv2-th-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {hwItems.map((item, idx) => (
                    <tr key={idx} className="pv2-tbody-row">
                      <td className="pv2-td">
                        <div style={{ fontWeight: 600, color: '#e5e7eb' }}>
                          {bomDisplayLabel(item.componente, item.skuFinal)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {getHWDesc(item.skuFinal) ?? item.componente}
                        </div>
                      </td>
                      <td className="pv2-td pv2-td-mono" style={{ fontSize: '12px', color: '#f3f4f6' }}>
                        {item.skuFinal}
                      </td>
                      <td className="pv2-td pv2-td-right" style={{ fontWeight: 700, color: '#a5b4fc' }}>
                        {item.unidad === 'm'
                          ? `${(item.cantidadCalculada * M_TO_FT).toFixed(2)} ft`
                          : `${item.cantidadCalculada} EA`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pv2-bom-drawer-footer">
              <button
                type="button"
                className="pv2-btn-primary"
                onClick={() => setIsBomDrawerOpen(false)}
                style={{ width: '100%' }}
              >
                Cerrar Desglose
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bracket Doble width guard modal (portal) ─────────────────────── */}
      {widthGuard.needsConfirmation && (
        <DoubleBracketWidthAlert
          widthM={parsedFormValues?.widthMeters ?? 0}
          onConfirm={widthGuard.handleConfirm}
          onCancel={widthGuard.handleCancel}
        />
      )}

    </div>
  );
}
