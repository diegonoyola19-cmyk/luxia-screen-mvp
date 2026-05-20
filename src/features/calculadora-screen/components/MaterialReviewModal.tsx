import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import type { SavedOrder } from '../../../domain/curtains/types';
import { generateId } from '../../../domain/curtains/constants';
import { 
  ProductionMaterialReview, 
  ProductionMaterialAdjustment, 
  ProductionMaterialAdjustmentAction, 
  ProductionMaterialAdjustmentReason,
  ProductionFabricAdjustment,
  ProductionFabricAdjustmentAction,
  ProductionFabricAdjustmentReason,
  generateFinalMaterialLines,
  generateFinalFabricLines
} from '../../../domain/orders/materialReview';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { BOMItem, generateRollerBOM } from '../../../logic/generateRollerBOM';
import { normalizeOrderStatus } from '../../../domain/orders/orderStatus';
import { componentCatalogBySku } from '../../../domain/inventory/componentCatalog';
import { calculateIssueLines } from '../../../domain/orders/issueStrategies';
import './MaterialReviewModal.css';

interface Props {
  order: SavedOrder;
  onClose: () => void;
}

export function MaterialReviewModal({ order, onClose }: Props) {
  const store = useCalculatorStore();
  const [activeTab, setActiveTab] = useState<'components' | 'fabrics'>('components');

  // 1. Gather original calculated materials (aggregated by SKU)
  const initialCalculatedBOM = useMemo(() => {
    const aggregated = new Map<string, BOMItem>();
    const isV3 = order.items.some(i => i.materialLines && i.materialLines.length > 0);

    if (isV3) {
      for (const item of order.items) {
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

    // Fallback for V2
    for (const item of order.items) {
      const tone = item.input.hardwareTone ?? 'white';
      const mounting = item.input.mountingSystem ?? 'standard';
      try {
        const bom = generateRollerBOM(
          item.input.widthMeters,
          item.input.heightMeters,
          tone as any,
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
      } catch { /* ignore */ }
    }
    return Array.from(aggregated.values());
  }, [order]);

  // 2. Gather original fabrics
  const initialCalculatedFabrics = useMemo(() => {
    return order.items.map(item => {
      const fabric = item.result?.selectedFabric;
      const rollWidth = item.result?.recommendedRollWidthMeters;
      const remnant = item.reusedWastePiece;
      
      const isRemnant = !!remnant;
      const source = isRemnant ? 'remnant' as const : 'roll' as const;

      let calculatedAreaY2: number | undefined = undefined;
      const res = item.result as any; 
      
      if (isRemnant && remnant) {
        calculatedAreaY2 = remnant.widthMeters * remnant.heightMeters * 1.19599;
      } else if (res) {
        if (res.fabricDownloadedYd2 && res.fabricDownloadedYd2 > 0) {
          calculatedAreaY2 = res.fabricDownloadedYd2;
        } else if (res.recommendedRollWidthMeters && res.cutLengthMeters) {
          calculatedAreaY2 = res.recommendedRollWidthMeters * res.cutLengthMeters * 1.2;
        }
      }

      return {
        curtainId: item.id,
        curtainLabel: item.title,
        calculatedFabricSku: fabric?.itemCode,
        calculatedFabricDescription: fabric?.description,
        calculatedWidthM: item.input.widthMeters,
        calculatedHeightM: item.input.heightMeters,
        calculatedRollWidthM: rollWidth,
        calculatedConsumptionM: item.result?.cutLengthMeters,
        calculatedConsumptionYd: item.result?.fabricDownloadedYd2,
        calculatedWastePercent: item.result?.wastePercentage,
        calculatedSource: source,
        calculatedRemnantId: remnant?.id,
        calculatedRemnantSize: remnant ? `${remnant.widthMeters}x${remnant.heightMeters}m` : undefined,
        calculatedAreaY2,
      };
    });
  }, [order]);

  // 3. Initialize state
  const [adjustments, setAdjustments] = useState<ProductionMaterialAdjustment[]>(() => {
    if (order.productionReview && order.productionReview.adjustments.length > 0) {
      return JSON.parse(JSON.stringify(order.productionReview.adjustments));
    }

    return initialCalculatedBOM.map(bom => ({
      id: generateId(),
      calculatedSku: bom.skuFinal,
      calculatedDescription: bom.componente,
      calculatedQuantity: bom.cantidadCalculada,
      calculatedUnit: bom.unidad,
      action: "confirmed",
      actualSku: bom.skuFinal,
      actualDescription: bom.componente,
      actualQuantity: bom.cantidadCalculada,
      actualUnit: bom.unidad
    }));
  });

  const [fabricAdjustments, setFabricAdjustments] = useState<ProductionFabricAdjustment[]>(() => {
    if (order.productionReview && order.productionReview.fabricAdjustments && order.productionReview.fabricAdjustments.length > 0) {
      return JSON.parse(JSON.stringify(order.productionReview.fabricAdjustments));
    }

    return initialCalculatedFabrics.map(fab => ({
      id: generateId(),
      ...fab,
      action: "confirmed",
      actualFabricSku: fab.calculatedFabricSku,
      actualFabricDescription: fab.calculatedFabricDescription,
      actualRollWidthM: fab.calculatedRollWidthM,
      actualConsumptionM: fab.calculatedConsumptionM,
      actualConsumptionYd: fab.calculatedConsumptionYd,
      actualSource: fab.calculatedSource,
      actualRemnantId: fab.calculatedRemnantId,
      actualRemnantSize: fab.calculatedRemnantSize,
      actualAreaY2: fab.calculatedAreaY2,
    }));
  });

  const [errors, setErrors] = useState<string[]>([]);

  // Update logic
  const handleUpdateAdjustment = (index: number, updates: Partial<ProductionMaterialAdjustment>) => {
    setAdjustments(prev => {
      const next = [...prev];
      const row = { ...next[index], ...updates };

      if (updates.action === "confirmed") {
        row.actualSku = row.calculatedSku;
        row.actualDescription = row.calculatedDescription;
        row.actualQuantity = row.calculatedQuantity;
        row.actualUnit = row.calculatedUnit;
        row.reason = undefined;
      }
      if (updates.action === "removed") {
        row.actualSku = undefined;
        row.actualQuantity = undefined;
        row.actualDescription = undefined;
      }

      next[index] = row;
      return next;
    });
  };

  const handleUpdateFabricAdjustment = (index: number, updates: Partial<ProductionFabricAdjustment>) => {
    setFabricAdjustments(prev => {
      const next = [...prev];
      const row = { ...next[index], ...updates };

      if (updates.action === "confirmed") {
        row.actualFabricSku = row.calculatedFabricSku;
        row.actualFabricDescription = row.calculatedFabricDescription;
        row.actualRollWidthM = row.calculatedRollWidthM;
        row.actualConsumptionM = row.calculatedConsumptionM;
        row.actualConsumptionYd = row.calculatedConsumptionYd;
        row.actualSource = row.calculatedSource;
        row.actualRemnantId = row.calculatedRemnantId;
        row.actualRemnantSize = row.calculatedRemnantSize;
        row.actualAreaY2 = row.calculatedAreaY2;
        row.reason = undefined;
      }
      if (updates.action === "removed") {
        row.actualFabricSku = undefined;
        row.actualFabricDescription = undefined;
        row.actualRollWidthM = undefined;
        row.actualConsumptionM = undefined;
        row.actualConsumptionYd = undefined;
        row.actualAreaY2 = undefined;
      }

      next[index] = row;
      return next;
    });
  };

  const handleAddMaterial = () => {
    setAdjustments(prev => [
      ...prev,
      {
        id: generateId(),
        action: "added",
        actualQuantity: 1,
        actualUnit: "EA",
        reason: "additional_component"
      }
    ]);
  };

  const handleConfirmAll = () => {
    setAdjustments(prev => prev.map(adj => {
      if (adj.action === "added") return adj;
      return {
        ...adj,
        action: "confirmed",
        actualSku: adj.calculatedSku,
        actualDescription: adj.calculatedDescription,
        actualQuantity: adj.calculatedQuantity,
        actualUnit: adj.calculatedUnit,
        reason: undefined
      };
    }));
    setFabricAdjustments(prev => prev.map(adj => ({
      ...adj,
      action: "confirmed",
      actualFabricSku: adj.calculatedFabricSku,
      actualFabricDescription: adj.calculatedFabricDescription,
      actualRollWidthM: adj.calculatedRollWidthM,
      actualConsumptionM: adj.calculatedConsumptionM,
      actualConsumptionYd: adj.calculatedConsumptionYd,
      actualSource: adj.calculatedSource,
      actualRemnantId: adj.calculatedRemnantId,
      actualRemnantSize: adj.calculatedRemnantSize,
      actualAreaY2: adj.calculatedAreaY2,
      reason: undefined
    })));
  };

  const validate = (): boolean => {
    const newErrors: string[] = [];
    const placeholderRegex = /^X+$/i;

    adjustments.forEach((adj, idx) => {
      const lineName = adj.calculatedDescription || `Línea Extra ${idx + 1}`;
      
      if (!adj.action) {
        newErrors.push(`Componentes - Falta acción en: ${lineName}`);
      }

      if (["substituted", "quantity_adjusted", "added"].includes(adj.action)) {
        if (!adj.actualSku || adj.actualSku.trim() === "") {
          newErrors.push(`Componentes - SKU real requerido en: ${lineName}`);
        } else if (placeholderRegex.test(adj.actualSku.trim())) {
          newErrors.push(`Componentes - No se permiten placeholders (X) como SKU en: ${lineName}`);
        }

        if (adj.actualQuantity === undefined || adj.actualQuantity <= 0) {
          newErrors.push(`Componentes - Cantidad válida requerida en: ${lineName}`);
        }

        if (!adj.reason) {
          newErrors.push(`Componentes - Motivo requerido en: ${lineName}`);
        }
      }

      if (adj.action === "removed") {
        if (!adj.reason) {
          newErrors.push(`Componentes - Motivo requerido para remover: ${lineName}`);
        }
      }
    });

    fabricAdjustments.forEach((adj) => {
      const lineName = adj.curtainLabel || "Cortina";

      if (!adj.action) {
        newErrors.push(`Telas - Falta acción en: ${lineName}`);
      }

      if (adj.action !== "removed") {
        if (!adj.actualAreaY2 || adj.actualAreaY2 <= 0) {
          newErrors.push(`Telas - INVALID_FABRIC_AREA_FOR_SAGE: Ingrese un área Y2 final válida para: ${lineName}`);
        }
      }

      if (["fabric_substituted", "roll_width_changed", "consumption_adjusted", "remnant_changed"].includes(adj.action)) {
        const sku = adj.actualFabricSku;
        if (!sku || sku.trim() === "") {
          newErrors.push(`Telas - SKU real requerido en: ${lineName}`);
        } else if (placeholderRegex.test(sku.trim())) {
          newErrors.push(`Telas - No se permiten placeholders (X) como SKU en: ${lineName}`);
        }

        if (!adj.reason) {
          newErrors.push(`Telas - Motivo requerido en: ${lineName}`);
        }

        if (adj.action === "roll_width_changed" && !adj.actualRollWidthM) {
          newErrors.push(`Telas - Ancho de rollo real requerido en: ${lineName}`);
        }
        if (adj.action === "remnant_changed" && !adj.actualRemnantSize && !adj.actualRemnantId) {
          newErrors.push(`Telas - Medida o ID de retazo requerido en: ${lineName}`);
        }
      }

      if (adj.action === "removed" && !adj.reason) {
        newErrors.push(`Telas - Motivo requerido para remover: ${lineName}`);
      }
    });

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSaveDraft = () => {
    const review: ProductionMaterialReview = {
      reviewedAt: new Date().toISOString(),
      status: "draft",
      adjustments,
      fabricAdjustments,
      finalMaterialLines: [],
      finalFabricLines: []
    };
    store.saveProductionReview(order.id, review);
    onClose();
  };

  const handleComplete = () => {
    if (!validate()) return;

    // Build the final lines
    const finalMaterialLines = generateFinalMaterialLines(adjustments);
    const finalFabricLines = generateFinalFabricLines(fabricAdjustments);

    // Create a temporary review to extract inputs
    const tempReview: ProductionMaterialReview = {
      reviewedAt: new Date().toISOString(),
      status: "completed",
      adjustments,
      fabricAdjustments,
      finalMaterialLines,
      finalFabricLines
    };

    // We simulate Sage Export input collection for this order
    // But since collectIssueEngineInputs is in sageExport, let's just collect it here
    const inputs: import('../../../domain/orders/issueStrategies').IssueEngineInputLine[] = [];
    for (const line of finalFabricLines) {
      inputs.push({ sku: line.sku, description: line.description, quantity: line.quantity, unit: line.unit, orderId: order.id });
    }
    
    const adjMap = new Map<string, any>();
    for (const adj of adjustments) {
      if (adj.calculatedSku && adj.action !== "added") {
        adjMap.set(adj.calculatedSku, adj);
      }
    }

    for (const item of order.items) {
      if (!item.materialLines) continue;
      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        const adjustment = adjMap.get(originalSku);
        if (adjustment?.action === "removed") continue;

        let finalSku = originalSku;
        let finalQuantity = mLine.quantity;
        let finalDescription = mLine.description;
        let finalUnit = mLine.unit;

        if (adjustment && adjustment.action === "substituted" && adjustment.actualSku) {
          finalSku = adjustment.actualSku;
          finalDescription = adjustment.actualDescription || finalDescription;
        }
        if (adjustment && adjustment.action === "quantity_adjusted" && adjustment.actualQuantity !== undefined) {
          finalQuantity = adjustment.actualQuantity;
        }

        inputs.push({
          sku: finalSku,
          description: finalDescription,
          quantity: finalQuantity,
          unit: finalUnit,
          orderId: order.id,
          itemId: item.id,
          curtainRef: item.title || item.id
        });
      }
    }

    const addedAdjustments = adjustments.filter(adj => adj.action === "added" && adj.actualSku);
    for (const add of addedAdjustments) {
      inputs.push({
        sku: add.actualSku!,
        description: add.actualDescription || add.actualSku!,
        quantity: add.actualQuantity || 1,
        unit: add.actualUnit || 'EA',
        orderId: order.id
      });
    }

    // Convert to Sage units (similar to collectIssueEngineInputs)
    for (const line of inputs) {
      const catalogEntry = componentCatalogBySku[line.sku];
      const targetUnit = catalogEntry?.sageUnit?.toUpperCase();
      if (targetUnit === 'FT' && line.unit.toLowerCase() === 'm') {
        line.quantity = line.quantity * 3.28084;
        line.unit = 'FT';
      } else if (targetUnit === 'M' && line.unit.toLowerCase() === 'ft') {
        line.quantity = line.quantity / 3.28084;
        line.unit = 'M';
      }
    }

    const result = calculateIssueLines(inputs, store.remainders || []);

    const review: ProductionMaterialReview = {
      ...tempReview,
      issueSnapshot: {
        generatedAt: new Date().toISOString(),
        snapshotStatus: 'preview',
        issueLines: result.issueLines.map((l: any) => ({ sku: l.itemCode, description: l.itemCode, quantity: l.quantity, unit: l.unit || 'EA' })),
        cutPlans: result.cutPlans,
        cutsFromRemainders: result.cutsFromRemainders,
        createdRemainders: result.createdRemainders
      }
    };

    store.saveProductionReview(order.id, review);
    onClose();
  };

  const getStatusBadgeClass = () => {
    const status = normalizeOrderStatus(order.status);
    if (status === 'materials_checked' || status === 'sent_to_sage') return 'mrm-status-badge--completed';
    if (order.productionReview?.status === 'draft') return 'mrm-status-badge--pending';
    return 'mrm-status-badge--draft';
  };

  const getStatusBadgeLabel = () => {
    const status = normalizeOrderStatus(order.status);
    if (status === 'sent_to_sage') return 'Completado y en Sage';
    if (status === 'materials_checked') return 'Revisión Completa';
    if (order.productionReview?.status === 'draft') return 'Borrador';
    return 'Pendiente de Revisión';
  };

  // KPIs
  const changedComponents = adjustments.filter(a => a.action !== 'confirmed').length;
  const changedFabrics = fabricAdjustments.filter(a => a.action !== 'confirmed').length;
  const totalChanges = changedComponents + changedFabrics;

  return (
    <div className="material-review-modal-overlay" role="dialog" aria-modal="true">
      <div className="material-review-modal-content">
        
        {/* HEADER */}
        <div className="mrm-header">
          <div className="mrm-header__top">
            <div className="mrm-header__title-group">
              <h2>Revisión de Materiales y Telas</h2>
              <p className="mrm-header__subtitle">Orden {order.orderNumber} · Sage utilizará la lista final aprobada.</p>
            </div>
            <button className="mrm-header__close" onClick={onClose} aria-label="Cerrar modal">×</button>
          </div>

          <div className="mrm-summary-bar">
            <div className="mrm-summary-item">
              <span className="label">Componentes</span>
              <span className="val">{adjustments.length}</span>
            </div>
            <div className="mrm-summary-item">
              <span className="label">Telas</span>
              <span className="val">{fabricAdjustments.length}</span>
            </div>
            <div className="mrm-summary-item">
              <span className="label">Cambios</span>
              <span className="val">{totalChanges}</span>
            </div>
            <div className={`mrm-summary-item ${errors.length > 0 ? 'alert' : ''}`}>
              <span className="label">Alertas</span>
              <span className="val">{errors.length}</span>
            </div>
            <div className="mrm-summary-item" style={{ marginLeft: 'auto', borderRight: 'none' }}>
              <span className="label">Estado</span>
              <span className={`mrm-status-badge ${getStatusBadgeClass()}`}>
                {getStatusBadgeLabel()}
              </span>
            </div>
          </div>

          <div className="mrm-tabs">
            <button 
              className={`mrm-tab ${activeTab === 'components' ? 'active' : ''}`}
              onClick={() => setActiveTab('components')}
            >
              Componentes / Herrajes
            </button>
            <button 
              className={`mrm-tab ${activeTab === 'fabrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('fabrics')}
            >
              Telas / Paños
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="mrm-body">
          {errors.length > 0 && (
            <div className="mrm-global-errors">
              <ul>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {activeTab === 'components' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <Button variant="secondary" size="sm" onClick={handleAddMaterial}>+ Agregar Material Extra</Button>
              </div>

              {adjustments.length === 0 ? (
                <div className="mrm-empty-state">No hay componentes para revisar.</div>
              ) : (
                adjustments.map((adj, index) => {
                  const isConfirmed = adj.action === 'confirmed';
                  const isAdded = adj.action === 'added';
                  const isRemoved = adj.action === 'removed';
                  const isSubstituted = adj.action === 'substituted';
                  
                  let cardClass = 'mrm-review-card--modified';
                  if (isConfirmed) cardClass = 'mrm-review-card--confirmed';
                  if (isAdded) cardClass = 'mrm-review-card--added';
                  if (isRemoved) cardClass = 'mrm-review-card--removed';
                  if (isSubstituted) cardClass = 'mrm-review-card--substituted';

                  return (
                    <div key={adj.id} className={`mrm-review-card ${cardClass}`}>
                      {/* Identity */}
                      <div className="mrm-card-zone mrm-card-zone--identity">
                        {isAdded ? (
                          <div className="mrm-pill mrm-pill--success">Material Extra / Nuevo</div>
                        ) : (
                          <>
                            <div className="title">{adj.calculatedDescription}</div>
                            <div className="sku">{adj.calculatedSku}</div>
                            <div className="mrm-pill">Calc: {adj.calculatedQuantity} {adj.calculatedUnit}</div>
                          </>
                        )}
                      </div>

                      {/* Action */}
                      <div className="mrm-card-zone">
                        <select 
                          className="mrm-select"
                          value={adj.action} 
                          onChange={e => handleUpdateAdjustment(index, { action: e.target.value as ProductionMaterialAdjustmentAction })}
                        >
                          {adj.calculatedSku && <option value="confirmed">Confirmar calc.</option>}
                          {adj.calculatedSku && <option value="substituted">Sustituir SKU</option>}
                          {adj.calculatedSku && <option value="quantity_adjusted">Ajustar Cant.</option>}
                          {adj.calculatedSku && <option value="removed">Remover / No usar</option>}
                          {adj.action === "added" && <option value="added">Agregado extra</option>}
                        </select>
                      </div>

                      {/* Adjustment */}
                      <div className="mrm-card-zone">
                        {isConfirmed ? (
                          <div className="mrm-card-status-text">Igual a calculado</div>
                        ) : isRemoved ? (
                          <div className="mrm-card-status-text" style={{ color: '#dc2626' }}>No se descontará de Sage</div>
                        ) : (
                          <>
                            <input 
                              type="text" 
                              className="mrm-input"
                              placeholder="SKU Real" 
                              value={adj.actualSku || ''} 
                              onChange={e => handleUpdateAdjustment(index, { actualSku: e.target.value })}
                            />
                            <div className="mrm-input-group">
                              <input 
                                type="number" 
                                step="0.001"
                                className="mrm-input"
                                placeholder="Cant." 
                                value={adj.actualQuantity ?? ''} 
                                onChange={e => handleUpdateAdjustment(index, { actualQuantity: parseFloat(e.target.value) })}
                              />
                              <input 
                                type="text" 
                                className="mrm-input"
                                placeholder="Unid." 
                                value={adj.actualUnit || ''} 
                                onChange={e => handleUpdateAdjustment(index, { actualUnit: e.target.value })}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="mrm-card-zone">
                        {isConfirmed ? null : (
                          <>
                            <select 
                              className="mrm-select"
                              value={adj.reason || ''} 
                              onChange={e => handleUpdateAdjustment(index, { reason: e.target.value as ProductionMaterialAdjustmentReason })}
                            >
                              <option value="" disabled>Motivo (Req)...</option>
                              <option value="out_of_stock">Falta stock (Sustituido)</option>
                              <option value="authorized_substitution">Sustitucion autorizada</option>
                              <option value="bom_error">Error de calculo BOM</option>
                              <option value="production_decision">Decision piso producción</option>
                              <option value="additional_component">Componente extra req.</option>
                              <option value="other">Otro</option>
                            </select>
                            <input 
                              type="text" 
                              className="mrm-input"
                              placeholder="Notas adicionales..." 
                              value={adj.notes || ''} 
                              onChange={e => handleUpdateAdjustment(index, { notes: e.target.value })}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === 'fabrics' && (
            <>
              {fabricAdjustments.length === 0 ? (
                <div className="mrm-empty-state">No hay telas para revisar.</div>
              ) : (
                fabricAdjustments.map((adj, index) => {
                  const isConfirmed = adj.action === 'confirmed';
                  const isRemoved = adj.action === 'removed';
                  const isSubstituted = adj.action === 'fabric_substituted';
                  
                  let cardClass = 'mrm-review-card--modified';
                  if (isConfirmed) cardClass = 'mrm-review-card--confirmed';
                  if (isRemoved) cardClass = 'mrm-review-card--removed';
                  if (isSubstituted) cardClass = 'mrm-review-card--substituted';

                  return (
                    <div key={adj.id} className={`mrm-review-card ${cardClass}`}>
                      {/* Identity */}
                      <div className="mrm-card-zone mrm-card-zone--identity">
                        <div className="title">{adj.curtainLabel}</div>
                        <div className="sku">{adj.calculatedFabricSku}</div>
                        
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                          <div className="mrm-pill">{adj.calculatedWidthM} x {adj.calculatedHeightM}m</div>
                          <div className="mrm-pill mrm-pill--accent">
                            {adj.calculatedSource === 'roll' ? `Rollo ${adj.calculatedRollWidthM}m` : `Retazo ${adj.calculatedRemnantSize}`}
                          </div>
                        </div>
                        <div className="sku" style={{ marginTop: '4px' }}>Calc: {adj.calculatedAreaY2 ? adj.calculatedAreaY2.toFixed(2) : '—'} Y2</div>
                      </div>

                      {/* Action */}
                      <div className="mrm-card-zone">
                        <select 
                          className="mrm-select"
                          value={adj.action} 
                          onChange={e => handleUpdateFabricAdjustment(index, { action: e.target.value as ProductionFabricAdjustmentAction })}
                        >
                          <option value="confirmed">Confirmar calc.</option>
                          <option value="fabric_substituted">Sustituir Tela</option>
                          <option value="roll_width_changed">Cambiar Ancho Rollo</option>
                          <option value="remnant_changed">Usar Retazo</option>
                          <option value="consumption_adjusted">Ajustar Área (Y2)</option>
                          <option value="removed">Remover / No usar</option>
                        </select>
                      </div>

                      {/* Adjustment */}
                      <div className="mrm-card-zone">
                        {isConfirmed ? (
                          <div className="mrm-card-status-text">
                            Final: {adj.actualAreaY2 ? adj.actualAreaY2.toFixed(2) : '—'} Y2
                          </div>
                        ) : isRemoved ? (
                          <div className="mrm-card-status-text" style={{ color: '#dc2626' }}>No se descontará de Sage</div>
                        ) : (
                          <>
                            <input 
                              type="text" 
                              className="mrm-input"
                              placeholder="SKU Tela Final" 
                              value={adj.actualFabricSku || ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { actualFabricSku: e.target.value })}
                            />
                            
                            {(adj.action === 'roll_width_changed' || adj.action === 'fabric_substituted') && (
                              <input 
                                type="number" 
                                step="0.01"
                                className="mrm-input"
                                placeholder="Ancho rollo real (m)" 
                                value={adj.actualRollWidthM || ''} 
                                onChange={e => handleUpdateFabricAdjustment(index, { actualRollWidthM: parseFloat(e.target.value) })}
                              />
                            )}
                            
                            {adj.action === 'remnant_changed' && (
                              <input 
                                type="text" 
                                className="mrm-input"
                                placeholder="Medida Retazo (ej 1x1)" 
                                value={adj.actualRemnantSize || ''} 
                                onChange={e => handleUpdateFabricAdjustment(index, { actualRemnantSize: e.target.value })}
                              />
                            )}

                            <input 
                              type="number" 
                              step="0.001"
                              className="mrm-input"
                              placeholder="Área Final Sage (Y2)" 
                              value={adj.actualAreaY2 ?? ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { actualAreaY2: parseFloat(e.target.value) })}
                            />
                          </>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="mrm-card-zone">
                        {isConfirmed ? null : (
                          <>
                            <select 
                              className="mrm-select"
                              value={adj.reason || ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { reason: e.target.value as ProductionFabricAdjustmentReason })}
                            >
                              <option value="" disabled>Motivo (Req)...</option>
                              <option value="out_of_stock">Falta stock tela/rollo</option>
                              <option value="authorized_substitution">Sustitucion autorizada</option>
                              <option value="fabric_error">Error en tela calculada</option>
                              <option value="roll_width_change">Cambio ancho optimizar</option>
                              <option value="remnant_decision">Uso de retazo (piso)</option>
                              <option value="production_decision">Decision general piso</option>
                              <option value="other">Otro</option>
                            </select>
                            <input 
                              type="text" 
                              className="mrm-input"
                              placeholder="Notas adicionales..." 
                              value={adj.notes || ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { notes: e.target.value })}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="mrm-footer">
          <div className="mrm-footer__left">
            <Button variant="secondary" onClick={handleConfirmAll} className="mrm-btn-action">
              ✓ Confirmar todo sin cambios
            </Button>
          </div>
          <div className="mrm-footer__right">
            <Button variant="ghost" onClick={onClose} className="mrm-btn-action">Cancelar</Button>
            <Button variant="secondary" onClick={handleSaveDraft} className="mrm-btn-action">Guardar Borrador</Button>
            <Button variant="primary" onClick={handleComplete} className="mrm-btn-action" style={{ backgroundColor: 'var(--primary-dark)', borderColor: 'var(--primary-dark)', boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)' }}>
              Completar Revisión
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
