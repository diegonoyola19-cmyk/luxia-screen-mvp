import { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useCalculatorDerivedState } from '../hooks/useCalculatorDerivedState';
import { calcularDescargoRetazo } from '../../../domain/curtains/screen';
import { generateId } from '../../../domain/curtains/constants';
import type { WasteReuseMatch, CalculationInput, ProductionBatchItem } from '../../../domain/curtains/types';
import type { SessionWastePiece } from '../store/types';

function getWasteFitLabel(match: WasteReuseMatch) {
  return match.orientationUsed === 'volteada' ? 'Se puede rotar' : 'Sirve directo';
}

const FABRIC_COLOR_MAP: Record<string, string> = {
  'black/black': '#2a2a2a',
  ebony: '#3a342f',
  smoke: '#7f858b',
  'stone/dark grey': '#6a6d72',
  beige: '#e8d5b7',
  'beige/bisque': '#d9c2a2',
  bisque: '#d4b896',
  black: '#2a2a2a',
  fawn: '#c7b299',
  'light grey': '#b0b8c1',
  'light gray': '#b0b8c1',
  'off white': '#f2ede8',
  'snow flakes': '#e8e4df',
  'stone grey': '#7a7a7a',
  'stone gray': '#7a7a7a',
  taupe: '#9d8b77',
  linen: '#d9cfbf',
  'brown/chocolate': '#5a4336',
  chocolate: '#5a4336',
  'sand ebony': '#8b7a63',
  'sand custard': '#cdb38a',
  'sand linen': '#c8b79b',
  'gold custard': '#caa661',
  'bronze custard': '#a97f55',
  'white pearl': '#ece7df',
  'white linen': '#e6e0d3',
  white: '#f2ede8',
  grey: '#9aa1a8',
  gray: '#9aa1a8',
};

function getFabricSwatchColor(color: string): string {
  const normalized = color.trim().toLowerCase();
  const match = Object.keys(FABRIC_COLOR_MAP).find((key) => normalized.includes(key));
  return match ? FABRIC_COLOR_MAP[match] : '#d9d0c8';
}

function getWasteTone(wasteMeters: number): 'healthy' | 'warning' | 'critical' {
  if (wasteMeters > 0.4) {
    return 'critical';
  }

  if (wasteMeters > 0.15) {
    return 'warning';
  }

  return 'healthy';
}

function getWasteLabel(tone: 'healthy' | 'warning' | 'critical') {
  if (tone === 'critical') {
    return 'Ancha';
  }

  if (tone === 'warning') {
    return 'Media';
  }

  return 'Fina';
}


export function ProductionModule() {
  const store = useCalculatorStore();
  const widthInputRef = useRef<HTMLInputElement | null>(null);

  const {
    fabricFamilies,
    fabricOpennessOptions,
    fabricColorOptions,
    parsedFormValues,
    displayErrors,
    hasValidDimensions,
    rollOptions,
    selectedFabricPreview,
    colorWastePieces,
    colorWasteMatches,
    displayResult
  } = useCalculatorDerivedState();

  const [useManualRetazo, setUseManualRetazo] = useState(false);
  const [manualRetazoSqYd, setManualRetazoSqYd] = useState('');

  // Agrupar items a producir

  const handleAddToBatch = () => {
    if (
      !displayResult ||
      !parsedFormValues ||
      !parsedFormValues.curtainType ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined ||
      !parsedFormValues.fabricFamily ||
      !parsedFormValues.fabricOpenness ||
      !parsedFormValues.fabricColor
    ) {
      return;
    }
    
    const newItem: ProductionBatchItem = {
      id: generateId(),
      input: parsedFormValues as CalculationInput,
    };
    
    store.addProductionItem(newItem);
    
    // Clear only width and height
    store.setFormValue('widthMeters', '');
    store.setFormValue('heightMeters', '');
    
    window.requestAnimationFrame(() => {
      widthInputRef.current?.focus();
    });
  };

  const handleRemoveFromBatch = (id: string) => {
    store.removeProductionItem(id);
  };

  const usingWaste = Boolean(store.selectedWastePieceId);
  const totalVisibleWaste = colorWastePieces.length;
  const activeRollWidth = store.selectedRollWidth ?? store.result?.recommendedRollWidthMeters ?? null;
  const selectedSwatchColor = getFabricSwatchColor(store.formValues.fabricColor);
  const fabricSubtitle = `${store.formValues.fabricFamily} ${store.formValues.fabricOpenness}`.trim() || 'Sin especificar';
  const typedColorWasteMatches = colorWasteMatches as WasteReuseMatch[];

  const canAddToOrder = Boolean(displayResult);
  const canAddToHistory = Boolean(displayResult);
  const canSaveOrder = store.orderDraft.orderNumber.trim() !== '' && 
                       store.cuttingGroups.length > 0 && 
                       !store.cuttingGroups.some(g => g.error);
  const pendingSummary = useMemo(() => {
    const validGroups = store.cuttingGroups.filter((group) => !group.error);
    const totalWasteMeters = validGroups.reduce((sum, group) => sum + Math.max(group.waste, 0), 0);
    const usedWidth = validGroups.reduce((sum, group) => sum + group.totalCutWidth, 0);
    const availableWidth = validGroups.reduce((sum, group) => sum + group.rollWidth, 0);
    const efficiency = availableWidth === 0 ? 0 : (usedWidth / availableWidth) * 100;

    return {
      curtains: store.itemsAProducir.length,
      cuts: store.cuttingGroups.length,
      validCuts: validGroups.length,
      blockedCuts: store.cuttingGroups.length - validGroups.length,
      totalWasteMeters,
      totalYd2: validGroups.reduce((sum, group) => sum + group.yd2Consumed, 0),
      efficiency,
    };
  }, [store.cuttingGroups, store.itemsAProducir.length]);
  const saveDisabledReason = store.orderDraft.orderNumber.trim() === ''
    ? 'Ingresa un numero de orden para poder guardar.'
    : store.cuttingGroups.length === 0
      ? 'Agrega al menos una cortina al lote.'
      : store.cuttingGroups.some((group) => group.error)
        ? 'Corrige los cortes con ancho excedido antes de guardar.'
        : '';

  const handleNewCurtain = () => {
    store.handleNewCurtain();
    window.requestAnimationFrame(() => { widthInputRef.current?.focus(); });
  };

  const [scrapsExpanded, setScrapsExpanded] = useState(totalVisibleWaste > 0);
  const wasteZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScrapsExpanded(totalVisibleWaste > 0);
  }, [totalVisibleWaste]);

  const manualRetazoVal = Number(manualRetazoSqYd) || 0;
  const retazoResult = displayResult && useManualRetazo && manualRetazoVal > 0
    ? calcularDescargoRetazo(displayResult.fabricDownloadedYd2, manualRetazoVal)
    : null;

  const displayedYd2 = retazoResult?.alcanza ? retazoResult.descargar : displayResult?.fabricDownloadedYd2;
  const displayedWaste = retazoResult?.alcanza ? retazoResult.merma : displayResult?.wasteYd2;

  return (
    <section className="production-module">
      <Card className="production-module__calculator">
        <div className="production-calc-grid production-order-client-grid">
          <label className="field">
            <span>Orden</span>
            <input
              type="text"
              value={store.orderDraft.orderNumber}
              placeholder="OC-1045"
              onChange={(event) => store.setOrderNumber(event.target.value)}
            />
            <small className="field__hint">En orden: {store.orderDraft.items.length}</small>
          </label>
        </div>

        <div className="production-calc-grid production-calc-grid--top">

          <label className="field">
            <span>Linea</span>
            <select
              value={store.formValues.fabricFamily}
              onChange={(event) => store.setFabricFamily(event.target.value)}
            >
              {fabricFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            {displayErrors.fabricFamily ? (
              <small className="field__error">{displayErrors.fabricFamily}</small>
            ) : null}
          </label>

          <label className="field">
            <span>Apertura</span>
            <select
              value={store.formValues.fabricOpenness}
              onChange={(event) => store.setFabricOpenness(event.target.value)}
            >
              {fabricOpennessOptions.map((openness) => (
                <option key={openness} value={openness}>
                  {openness}
                </option>
              ))}
            </select>
            {displayErrors.fabricOpenness ? (
              <small className="field__error">{displayErrors.fabricOpenness}</small>
            ) : null}
          </label>

          <label className="field">
            <span>Ancho</span>
            <input
              ref={widthInputRef}
              inputMode="decimal"
              pattern="[0-9]*"
              type="text"
              placeholder="30 - 600 cm"
              value={store.formValues.widthMeters}
              onChange={(event) => store.setFormValue('widthMeters', event.target.value)}
              onBlur={() => store.handleFieldBlur('widthMeters')}
            />
            {displayErrors.widthMeters ? (
              <small className="field__error">{displayErrors.widthMeters}</small>
            ) : null}
          </label>

          <label className="field">
            <span>Alto</span>
            <input
              inputMode="decimal"
              pattern="[0-9]*"
              type="text"
              placeholder="30 - 400 cm"
              value={store.formValues.heightMeters}
              onChange={(event) => store.setFormValue('heightMeters', event.target.value)}
              onBlur={() => store.handleFieldBlur('heightMeters')}
            />
            {displayErrors.heightMeters ? (
              <small className="field__error">{displayErrors.heightMeters}</small>
            ) : null}
          </label>

          <div className="field field--span-4">
            <span>Color</span>
            {fabricColorOptions.length === 0 ? (
              <div className="production-fabric-empty">
                No encontramos colores para esta combinacion.
              </div>
            ) : (
              <div className="production-fabric-grid">
                {fabricColorOptions.map((option) => (
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    transition={{ duration: 0.15 }}
                    key={option.color}
                    type="button"
                    className={[
                      'production-fabric-chip',
                      store.formValues.fabricColor === option.color
                        ? 'production-fabric-chip--active'
                        : '',
                    ].join(' ')}
                    onClick={() => store.setFabricColor(option.color)}
                  >
                    <span
                      className="production-fabric-chip__swatch"
                      style={{ backgroundColor: getFabricSwatchColor(option.color) }}
                    />
                    <strong>{option.color}</strong>
                  </motion.button>
                ))}
              </div>
            )}
            {displayErrors.fabricColor ? (
              <small className="field__error">{displayErrors.fabricColor}</small>
            ) : null}
          </div>
        </div>

        <div className="production-live-result-container">
          <div className="production-live-result">
            <article className="production-live-result__metric">
              <span>Alto corte</span>
              <strong>{displayResult ? `${formatNumber(displayResult.cutLengthMeters)} m` : '-'}</strong>
            </article>
            <article className="production-live-result__metric">
              <span>Ancho corte</span>
              <strong>{displayResult ? `${formatNumber(displayResult.cutWidthMeters)} m` : '-'}</strong>
            </article>
            <article className="production-live-result__metric">
              <span>Y2 consumidos</span>
              <strong>{displayResult ? `${formatNumber(displayedYd2!)} yd2` : '-'}</strong>
            </article>
            <article className="production-live-result__metric">
              <span>Merma</span>
              <strong>{displayResult ? `${formatNumber(displayedWaste!)} yd2` : '-'}</strong>
            </article>
          </div>

          {displayResult && (
            <div className="manual-retazo-zone" style={{ marginTop: '12px', padding: '14px 16px', background: 'rgba(255, 255, 255, 0.86)', border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={useManualRetazo} 
                  onChange={(e) => setUseManualRetazo(e.target.checked)} 
                />
                Usar retazo existente
              </label>

              {useManualRetazo && (
                <div style={{ marginTop: '12px', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="field" style={{ maxWidth: '200px' }}>
                    <span>Tamaño del retazo (sqyd)</span>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      placeholder="0.00"
                      value={manualRetazoSqYd}
                      onChange={(e) => setManualRetazoSqYd(e.target.value)}
                    />
                  </label>

                  {manualRetazoVal > 0 && retazoResult && (
                    <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>
                      {retazoResult.alcanza ? (
                        <div style={{ color: '#059669', fontWeight: 600 }}>
                          ✓ Alcanza (necesitas {formatNumber(displayResult.fabricDownloadedYd2)} sqyd, tienes {formatNumber(manualRetazoVal)} sqyd) | Merma: {formatNumber(retazoResult.merma)} sqyd
                        </div>
                      ) : (
                        <div style={{ color: '#dc2626', fontWeight: 600 }}>
                          ✗ No alcanza (el retazo es menor a {formatNumber(displayResult.fabricDownloadedYd2)} sqyd requeridas)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <AnimatePresence>
          {typedColorWasteMatches.length > 0 && hasValidDimensions && (
            <motion.div
              key="waste-alert"
              className="waste-alert-banner"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <span className="waste-alert-banner__icon">⚠️</span>
              <p className="waste-alert-banner__text">
                Tienes {typedColorWasteMatches.length} retazo(s) de{' '}
                <strong>{store.formValues.fabricColor}</strong> disponibles para esta medida
                {typedColorWasteMatches.some((match) => (match.wastePiece as SessionWastePiece).isSessionPiece) && (
                  <span className="waste-alert-banner__session-note"> (incluye retazos de sesión)</span>
                )}
              </p>
              <button
                type="button"
                className="waste-alert-banner__link"
                onClick={() => {
                  setScrapsExpanded(true);
                  wasteZoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                Ver retazos
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="button-row production-module__action-strip production-module__action-strip--grid">
          <Button type="button" onClick={handleAddToBatch} disabled={!parsedFormValues || !hasValidDimensions}>
            Agregar a Lote
          </Button>
          <Button type="button" variant="ghost" onClick={handleNewCurtain}>
            Nueva cortina
          </Button>
        </div>

        {!canAddToOrder && !canAddToHistory ? (
          <small className="field__hint">
            Completa las medidas y selecciona una tela para continuar.
          </small>
        ) : null}

        {selectedFabricPreview ? (
          <div className="production-fabric-zone" ref={wasteZoneRef}>
            <div className="production-fabric-preview production-fabric-preview--compact">
              <span
                className="production-fabric-preview__dot"
                style={{ backgroundColor: selectedSwatchColor }}
              />
              <div className="production-fabric-preview__content production-fabric-preview__content--compact">
                <h3>{store.formValues.fabricColor}</h3>
                <p>{fabricSubtitle}</p>
              </div>
              {totalVisibleWaste > 0 ? (
                <div className="badge badge--compact">Retazos: {totalVisibleWaste}</div>
              ) : null}
            </div>

            <div className="production-fabric-scraps">
              <button 
                type="button"
                className="production-module__heading production-module__heading--tight"
                onClick={() => setScrapsExpanded(!scrapsExpanded)}
                style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2>Retazos del mismo color</h2>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{scrapsExpanded ? '▲' : '▼'}</span>
                </div>
                <div className="badge">{totalVisibleWaste}</div>
              </button>

              <AnimatePresence initial={false}>
                {scrapsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ paddingTop: '1rem' }}>
                      {store.result ? (
                        colorWasteMatches.length === 0 ? (
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
                              onClick={() => store.setSelectedWastePieceId(null)}
                            >
                              <span className="production-scrap-card__label">Rollo nuevo</span>
                              <strong>Usar tela nueva</strong>
                              <p>Ignora retazos y descarga del rollo seleccionado.</p>
                            </button>

                            {typedColorWasteMatches.map((match) => (
                              <button
                                key={match.wastePiece.id}
                                type="button"
                                className={[
                                  'production-scrap-card',
                                  store.selectedWastePieceId === match.wastePiece.id
                                    ? 'production-scrap-card--active'
                                    : '',
                                ].join(' ')}
                                onClick={() =>
                                  store.setSelectedWastePieceId(
                                    store.selectedWastePieceId === match.wastePiece.id
                                      ? null
                                      : match.wastePiece.id,
                                  )
                                }
                              >
                                <span className="production-scrap-card__label">
                                  {getWasteFitLabel(match)}
                                  {(match.wastePiece as SessionWastePiece).isSessionPiece && (
                                    <span className="badge badge--session">Sesión</span>
                                  )}
                                </span>
                                <strong>
                                  <span title="Ancho">A: {formatNumber(match.wastePiece.widthMeters)} m</span>
                                  {' · '}
                                  <span title="Alto">H: {formatNumber(match.wastePiece.heightMeters)} m</span>
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
                          {colorWastePieces.map((piece) => (
                            <article
                              key={piece.id}
                              className="production-scrap-card production-scrap-card--passive"
                            >
                              <span className="production-scrap-card__label">Disponible</span>
                              <strong>
                                <span title="Ancho">A: {formatNumber(piece.widthMeters)} m</span>
                                {' · '}
                                <span title="Alto">H: {formatNumber(piece.heightMeters)} m</span>
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : null}

        {store.result ? (
          <div className="production-roll-selector production-roll-selector--compact">
            <span>{usingWaste ? 'Retazo' : 'Rollo'}</span>
            <div className="production-roll-selector__options">
              {rollOptions.map((option) => {
                const disabled = option < store.result!.occupiedRollWidthMeters;

                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'production-roll-option',
                      activeRollWidth === option ? 'production-roll-option--active' : '',
                    ].join(' ')}
                    onClick={() => store.setSelectedRollWidth(option)}
                    disabled={disabled}
                  >
                    {formatNumber(option)} m
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {displayErrors.general ? (
          <div className="alert alert--error production-module__alert">
            {displayErrors.general}
          </div>
        ) : null}


      </Card>

      <Card className="production-module__order">
        <div className="production-order-dashboard">
          <div className="production-order-dashboard__hero">
            <div className="production-order-dashboard__hero-main">
              <span className="section-heading__eyebrow production-order-dashboard__eyebrow">
                Orden actual
              </span>
              <div className="production-order-dashboard__title-row">
                <div>
                  <h2 className="production-order-dashboard__title">
                    {store.orderDraft.orderNumber || 'Sin numero de orden'}
                  </h2>
                  <p className="production-order-dashboard__subtitle">
                    {pendingSummary.curtains} cortina{pendingSummary.curtains !== 1 ? 's' : ''} en{' '}
                    {pendingSummary.cuts} corte{pendingSummary.cuts !== 1 ? 's' : ''}
                    {pendingSummary.blockedCuts > 0
                      ? ` · ${pendingSummary.blockedCuts} pendiente${pendingSummary.blockedCuts !== 1 ? 's' : ''} de ajuste`
                      : ' · listo para guardar'}
                  </p>
                </div>
                <div className="production-order-dashboard__status">
                  <span>Estado</span>
                  <strong>{canSaveOrder ? 'Estable' : 'En armado'}</strong>
                </div>
              </div>
            </div>

          </div>

          <div className="production-order-dashboard__metrics">
            <article className="production-order-kpi production-order-kpi--accent">
              <span>Piezas en cola</span>
              <strong>{pendingSummary.curtains}</strong>
              <small>Cortinas listas para este lote</small>
            </article>
            <article className="production-order-kpi">
              <span>Cortes activos</span>
              <strong>{pendingSummary.validCuts}</strong>
              <small>{pendingSummary.cuts} cortes calculados</small>
            </article>
            <article className="production-order-kpi">
              <span>Eficiencia</span>
              <strong>{formatNumber(pendingSummary.efficiency)} %</strong>
              <small>Aprovechamiento lateral del rollo</small>
            </article>
            <article className="production-order-kpi">
              <span>Merma total</span>
              <strong>{formatNumber(pendingSummary.totalWasteMeters)} m</strong>
              <small>Solo cortes válidos del lote</small>
            </article>
          </div>
        </div>

        {store.itemsAProducir.length === 0 ? (
          <p className="production-module__empty">Agrega cortinas usando el botón "Agregar a Lote".</p>
        ) : (
          <div className="production-cut-list">
            <AnimatePresence>
              {store.cuttingGroups.map((group, groupIdx) => (
                <motion.article
                  key={group.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  layout
                  className={[
                    'production-cut-card',
                    group.error ? 'production-cut-card--error' : '',
                    `production-cut-card--${getWasteTone(group.waste)}`,
                  ].join(' ')}
                >
                  <div className="production-cut-card__header">
                    <div className="production-cut-card__identity">
                      <span className="production-cut-card__eyebrow">
                        Corte #{groupIdx + 1}
                      </span>
                      <div className="production-cut-card__title-row">
                        <span
                          className="production-cut-card__swatch"
                          style={{ backgroundColor: getFabricSwatchColor(group.fabricColor) }}
                        />
                        <div>
                          <strong>{group.fabricFamily}</strong>
                          <p>{group.fabricColor}</p>
                        </div>
                      </div>
                    </div>

                    {group.error ? (
                      <span className="production-cut-card__flag production-cut-card__flag--error">
                        {group.error}
                      </span>
                    ) : (
                      <span className="production-cut-card__flag">
                        Rollo {formatNumber(group.rollWidth)} m
                      </span>
                    )}
                  </div>

                  <div className="production-cut-card__stats">
                    <article className="production-cut-stat">
                      <span>Rollo</span>
                      <strong>{formatNumber(group.rollWidth)} m</strong>
                    </article>
                    <article className="production-cut-stat">
                      <span>Ancho usado</span>
                      <strong>{formatNumber(group.totalCutWidth)} m</strong>
                    </article>
                    <article className="production-cut-stat">
                      <span>Alto de corte</span>
                      <strong>{formatNumber(group.cutHeight)} m</strong>
                    </article>
                    <article className="production-cut-stat">
                      <span>Piezas</span>
                      <strong>{group.items.length}</strong>
                    </article>
                  </div>

                  <div className="production-cut-card__body">
                    {group.items.map((item, itemIdx) => (
                      <div
                        key={item.id}
                        className="production-cut-piece"
                      >
                        <div className="production-cut-piece__main">
                          <span className="production-cut-piece__index">
                            #{itemIdx + 1}
                          </span>
                          <div className="production-cut-piece__copy">
                            <strong>
                            {formatNumber(item.input.widthMeters)} x {formatNumber(item.input.heightMeters)} m
                          </strong>
                          <small>
                            (corte {formatNumber(item.input.widthMeters + 0.10)} x{' '}
                              {formatNumber(item.input.heightMeters + store.ruleConfig.cutHeightExtraMeters + 0.10)} m
                            )
                          </small>
                        </div>
                      </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="production-cut-piece__action"
                          onClick={() => handleRemoveFromBatch(item.id)}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  {!group.error ? (
                    <div className="production-cut-card__footer">
                      <div className="production-cut-card__waste">
                        <div className="production-cut-card__waste-copy">
                          <span>△ Merma lateral</span>
                          <strong>{formatNumber(group.waste)} m</strong>
                          <small>{getWasteLabel(getWasteTone(group.waste))}</small>
                        </div>
                        <div className="production-cut-card__waste-bar">
                          <span
                            className={[
                              'production-cut-card__waste-fill',
                              `production-cut-card__waste-fill--${getWasteTone(group.waste)}`,
                            ].join(' ')}
                            style={{
                              width: `${Math.min((group.waste / Math.max(group.rollWidth, 0.01)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {group.items.length > 1 ? (
                        <div className="production-cut-card__footer-badge">
                          ✓ Optimizado
                        </div>
                      ) : (
                        <div className="production-cut-card__footer-badge production-cut-card__footer-badge--muted">
                          Aprovechado {formatNumber(group.rollWidth === 0 ? 0 : (group.totalCutWidth / group.rollWidth) * 100)} %
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="production-cut-card__footer production-cut-card__footer--error">
                      Revisa el ancho combinado de este corte o separa las piezas en otro lote.
                    </div>
                  )}
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}

        <div className="production-order-sticky-bar">
          <div className="production-order-sticky-bar__metrics">
            <article className="production-order-sticky-metric">
              <span>Total cortinas</span>
              <strong>{pendingSummary.curtains}</strong>
            </article>
            <article className="production-order-sticky-metric">
              <span>Total Y2</span>
              <strong>{formatNumber(pendingSummary.totalYd2)} yd2</strong>
            </article>
            <article className="production-order-sticky-metric">
              <span>Total merma</span>
              <strong>{formatNumber(pendingSummary.totalWasteMeters)} m</strong>
            </article>
          </div>

          <div className="production-module__order-actions production-module__order-actions--dashboard">
            <Button
              type="button"
              variant="ghost"
              onClick={() => store.itemsAProducir.forEach((item) => store.removeProductionItem(item.id))}
              disabled={store.itemsAProducir.length === 0}
            >
              Vaciar
            </Button>
            <span title={saveDisabledReason || undefined} className="production-order-sticky-bar__save-wrap">
              <Button type="button" onClick={store.saveOrder} disabled={!canSaveOrder} aria-label={saveDisabledReason || 'Guardar orden'}>
                Guardar orden
              </Button>
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}
