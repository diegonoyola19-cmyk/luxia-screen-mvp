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
          calculatedAreaY2 = res.recommendedRollWidthMeters * res.cutLengthMeters * 1.19599;
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

    const review: ProductionMaterialReview = {
      reviewedAt: new Date().toISOString(),
      status: "completed",
      adjustments,
      fabricAdjustments,
      finalMaterialLines: generateFinalMaterialLines(adjustments),
      finalFabricLines: generateFinalFabricLines(fabricAdjustments)
    };

    store.saveProductionReview(order.id, review);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-content" style={{ background: 'var(--bg-card, #fff)', borderRadius: '8px', padding: '24px', width: '100%', maxWidth: '1200px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginTop: 0 }}>Revisión de Materiales y Telas - Orden {order.orderNumber}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Confirma o ajusta los materiales reales consumidos. Sage utilizará la lista final combinada.
        </p>

        {errors.length > 0 && (
          <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', marginBottom: '16px' }}>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
          <Button variant={activeTab === 'components' ? 'primary' : 'ghost'} onClick={() => setActiveTab('components')}>
            Componentes / Herrajes
          </Button>
          <Button variant={activeTab === 'fabrics' ? 'primary' : 'ghost'} onClick={() => setActiveTab('fabrics')}>
            Telas / Paños
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'components' && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <Button variant="secondary" size="sm" onClick={handleAddMaterial}>+ Agregar Material Extra</Button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Componente Calculado</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Acción</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Ajuste Real (SKU / Cant.)</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Motivo / Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj, index) => (
                    <tr key={adj.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <td style={{ padding: '8px', verticalAlign: 'top' }}>
                        {adj.action === "added" ? (
                          <span style={{ color: '#059669', fontWeight: 'bold' }}>Extra / Nuevo</span>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{adj.calculatedDescription}</div>
                            <div style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{adj.calculatedSku}</div>
                            <div>{adj.calculatedQuantity} {adj.calculatedUnit}</div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '8px', verticalAlign: 'top' }}>
                        <select 
                          value={adj.action} 
                          onChange={e => handleUpdateAdjustment(index, { action: e.target.value as ProductionMaterialAdjustmentAction })}
                          style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                          {adj.calculatedSku && <option value="confirmed">Confirmar</option>}
                          {adj.calculatedSku && <option value="substituted">Sustituir SKU</option>}
                          {adj.calculatedSku && <option value="quantity_adjusted">Ajustar Cantidad</option>}
                          {adj.calculatedSku && <option value="removed">No usado</option>}
                          {adj.action === "added" && <option value="added">Agregado extra</option>}
                        </select>
                      </td>
                      <td style={{ padding: '8px', verticalAlign: 'top' }}>
                        {adj.action === "confirmed" ? (
                          <span style={{ color: 'var(--muted)' }}>Igual a calculado</span>
                        ) : adj.action === "removed" ? (
                          <span style={{ color: '#dc2626' }}>Eliminado del final</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input 
                              type="text" 
                              placeholder="Nuevo SKU" 
                              value={adj.actualSku || ''} 
                              onChange={e => handleUpdateAdjustment(index, { actualSku: e.target.value })}
                              style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input 
                                type="number" 
                                step="0.001"
                                placeholder="Cant." 
                                value={adj.actualQuantity ?? ''} 
                                onChange={e => handleUpdateAdjustment(index, { actualQuantity: parseFloat(e.target.value) })}
                                style={{ width: '80px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                              />
                              <input 
                                type="text" 
                                placeholder="Unidad" 
                                value={adj.actualUnit || ''} 
                                onChange={e => handleUpdateAdjustment(index, { actualUnit: e.target.value })}
                                style={{ width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', verticalAlign: 'top' }}>
                        {adj.action !== "confirmed" && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select 
                              value={adj.reason || ''} 
                              onChange={e => handleUpdateAdjustment(index, { reason: e.target.value as ProductionMaterialAdjustmentReason })}
                              style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            >
                              <option value="" disabled>Seleccione motivo...</option>
                              <option value="out_of_stock">Falta stock (Sustituido)</option>
                              <option value="authorized_substitution">Sustitucion autorizada</option>
                              <option value="bom_error">Error de calculo BOM</option>
                              <option value="production_decision">Decision piso producción</option>
                              <option value="additional_component">Componente extra req.</option>
                              <option value="other">Otro</option>
                            </select>
                            <input 
                              type="text" 
                              placeholder="Notas adicionales..." 
                              value={adj.notes || ''} 
                              onChange={e => handleUpdateAdjustment(index, { notes: e.target.value })}
                              style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'fabrics' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.05)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Cortina</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Tela Calculada</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Acción</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Ajuste Real</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Motivo / Notas</th>
                </tr>
              </thead>
              <tbody>
                {fabricAdjustments.map((adj, index) => (
                  <tr key={adj.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{adj.curtainLabel}</div>
                      <div style={{ color: 'var(--muted)' }}>{adj.calculatedWidthM} x {adj.calculatedHeightM}m</div>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{adj.calculatedFabricSku}</div>
                      <div>{adj.calculatedFabricDescription}</div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#059669' }}>
                        {adj.calculatedSource === 'roll' ? `Rollo (${adj.calculatedRollWidthM}m)` : `Retazo (${adj.calculatedRemnantSize})`}
                      </div>
                      <div style={{ marginTop: '2px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        Consumo calculado: {adj.calculatedAreaY2 ? adj.calculatedAreaY2.toFixed(2) : '—'} Y2
                      </div>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <select 
                        value={adj.action} 
                        onChange={e => handleUpdateFabricAdjustment(index, { action: e.target.value as ProductionFabricAdjustmentAction })}
                        style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                      >
                        <option value="confirmed">Confirmar</option>
                        <option value="fabric_substituted">Sustituir Tela</option>
                        <option value="roll_width_changed">Cambiar Ancho de Rollo</option>
                        <option value="remnant_changed">Usar Retazo Diferente</option>
                        <option value="consumption_adjusted">Ajustar Área Final (Y2)</option>
                        <option value="removed">No usar</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {adj.action === "confirmed" ? (
                        <div style={{ color: 'var(--muted)' }}>
                           Consumo final: <strong>{adj.actualAreaY2 ? adj.actualAreaY2.toFixed(2) : '—'} Y2</strong><br />
                           <span style={{ fontSize: '0.8em' }}>(Igual a calculado)</span>
                        </div>
                      ) : adj.action === "removed" ? (
                        <span style={{ color: '#dc2626' }}>Eliminado del final</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input 
                            type="text" 
                            placeholder="SKU Tela" 
                            value={adj.actualFabricSku || ''} 
                            onChange={e => handleUpdateFabricAdjustment(index, { actualFabricSku: e.target.value })}
                            style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                          {(adj.action === 'roll_width_changed' || adj.action === 'fabric_substituted') && (
                            <input 
                              type="number" 
                              step="0.01"
                              placeholder="Ancho rollo (m)" 
                              value={adj.actualRollWidthM || ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { actualRollWidthM: parseFloat(e.target.value) })}
                              style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                          )}
                          {adj.action === 'remnant_changed' && (
                            <input 
                              type="text" 
                              placeholder="Medida Retazo (ej 1x1)" 
                              value={adj.actualRemnantSize || ''} 
                              onChange={e => handleUpdateFabricAdjustment(index, { actualRemnantSize: e.target.value })}
                              style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                          )}
                          <input 
                            type="number" 
                            step="0.001"
                            placeholder="Área Final para Sage (Y2)" 
                            value={adj.actualAreaY2 ?? ''} 
                            onChange={e => handleUpdateFabricAdjustment(index, { actualAreaY2: parseFloat(e.target.value) })}
                            style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                            title="Deja vacío si deseas que el sistema intente recalcular el área automáticamente desde la medida de la cortina."
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {adj.action !== "confirmed" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <select 
                            value={adj.reason || ''} 
                            onChange={e => handleUpdateFabricAdjustment(index, { reason: e.target.value as ProductionFabricAdjustmentReason })}
                            style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                          >
                            <option value="" disabled>Seleccione motivo...</option>
                            <option value="out_of_stock">Falta stock de tela/rollo</option>
                            <option value="authorized_substitution">Sustitucion autorizada</option>
                            <option value="fabric_error">Error en tela calculada</option>
                            <option value="roll_width_change">Cambio de ancho para optimizar</option>
                            <option value="remnant_decision">Uso de retazo por producción</option>
                            <option value="production_decision">Decision general de piso</option>
                            <option value="other">Otro</option>
                          </select>
                          <input 
                            type="text" 
                            placeholder="Notas adicionales..." 
                            value={adj.notes || ''} 
                            onChange={e => handleUpdateFabricAdjustment(index, { notes: e.target.value })}
                            style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', borderTop: '1px solid #ddd', paddingTop: '16px' }}>
          <div>
            <Button variant="secondary" onClick={handleConfirmAll}>Confirmar TODO sin cambios</Button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="secondary" onClick={handleSaveDraft}>Guardar Borrador</Button>
            <Button variant="primary" onClick={handleComplete}>Completar Revisión</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
