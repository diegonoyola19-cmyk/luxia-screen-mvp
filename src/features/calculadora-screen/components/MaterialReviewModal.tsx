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
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const isV3 = orderItems.some(i => i?.materialLines && i.materialLines.length > 0);

    if (isV3) {
      for (const item of orderItems) {
        if (!item?.materialLines) continue;
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
    for (const item of orderItems) {
      if (!item?.input) continue;
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
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    return orderItems.map(item => {
      const fabric = item?.result?.selectedFabric;
      const rollWidth = item?.result?.recommendedRollWidthMeters;
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
        calculatedWidthM: item.input?.widthMeters,
        calculatedHeightM: item.input?.heightMeters,
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

  // Helpers to determine review completeness per row
  const isComponentAdjustmentComplete = (adj: ProductionMaterialAdjustment): boolean => {
    if (!adj.action) return false;
    if (adj.action === "confirmed") return true;
    if (["substituted", "quantity_adjusted", "added"].includes(adj.action)) {
      const skuValid = adj.action === "quantity_adjusted" 
        ? true 
        : (!!adj.actualSku && adj.actualSku.trim() !== "" && !/^X+$/i.test(adj.actualSku.trim()));
      const qtyValid = adj.actualQuantity !== undefined && adj.actualQuantity > 0;
      const reasonValid = !!adj.reason && adj.reason.trim() !== "";
      return skuValid && qtyValid && reasonValid;
    }
    if (adj.action === "removed") {
      return !!adj.reason && adj.reason.trim() !== "";
    }
    return false;
  };

  const isFabricAdjustmentComplete = (adj: ProductionFabricAdjustment): boolean => {
    if (!adj.action) return false;
    if (adj.action === "confirmed") {
      return adj.actualAreaY2 !== undefined && adj.actualAreaY2 > 0;
    }
    if (adj.action === "removed") {
      return !!adj.reason && adj.reason.trim() !== "";
    }
    if (["fabric_substituted", "roll_width_changed", "consumption_adjusted", "remnant_changed"].includes(adj.action)) {
      const areaValid = adj.actualAreaY2 !== undefined && adj.actualAreaY2 > 0;
      const skuValid = adj.action === "fabric_substituted" 
        ? (!!adj.actualFabricSku && adj.actualFabricSku.trim() !== "" && !/^X+$/i.test(adj.actualFabricSku.trim()))
        : true;
      const reasonValid = !!adj.reason && adj.reason.trim() !== "";
      let specificValid = true;
      if (adj.action === "roll_width_changed" && !adj.actualRollWidthM) specificValid = false;
      if (adj.action === "remnant_changed" && !adj.actualRemnantSize && !adj.actualRemnantId) specificValid = false;
      return areaValid && skuValid && reasonValid && specificValid;
    }
    return false;
  };

  const reviewedComponentsCount = useMemo(() => {
    return adjustments.filter(isComponentAdjustmentComplete).length;
  }, [adjustments]);

  const componentsProgressPercent = adjustments.length > 0
    ? Math.round((reviewedComponentsCount / adjustments.length) * 100)
    : 0;

  const reviewedFabricsCount = useMemo(() => {
    return fabricAdjustments.filter(isFabricAdjustmentComplete).length;
  }, [fabricAdjustments]);

  const fabricsProgressPercent = fabricAdjustments.length > 0
    ? Math.round((reviewedFabricsCount / fabricAdjustments.length) * 100)
    : 0;

  const totalIncomplete = (adjustments.length - reviewedComponentsCount) + (fabricAdjustments.length - reviewedFabricsCount);

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

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const hasItems = orderItems.length > 0;

  const handleSaveDraft = () => {
    if (!hasItems) return;
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
    if (!hasItems) return;
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

    // Pre-calcular totales originales por SKU para distribuir ajustes consolidados
    const originalSkuTotals = new Map<string, number>();
    const originalSkuCounts = new Map<string, number>();

    for (const item of orderItems) {
      if (!item?.materialLines) continue;
      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        if (!originalSku) continue;
        originalSkuTotals.set(originalSku, (originalSkuTotals.get(originalSku) || 0) + mLine.quantity);
        originalSkuCounts.set(originalSku, (originalSkuCounts.get(originalSku) || 0) + 1);
      }
    }

    // Rastrear remanente asignado por SKU durante la distribución
    const remainingAdjustedQty = new Map<string, number>();
    const processedSkuCounts = new Map<string, number>();

    for (const item of orderItems) {
      if (!item?.materialLines) continue;
      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        if (!originalSku) continue;
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

        if (adjustment && (adjustment.action === "quantity_adjusted" || (adjustment.action === "substituted" && adjustment.actualQuantity !== undefined)) && adjustment.actualQuantity !== undefined) {
          const totalOriginal = originalSkuTotals.get(originalSku) || 0;
          const totalCount = originalSkuCounts.get(originalSku) || 1;
          const currentCount = (processedSkuCounts.get(originalSku) || 0) + 1;
          processedSkuCounts.set(originalSku, currentCount);

          let currentRemaining = remainingAdjustedQty.has(originalSku) 
            ? remainingAdjustedQty.get(originalSku)! 
            : adjustment.actualQuantity;

          if (currentCount === totalCount) {
            finalQuantity = Math.max(0, Number(currentRemaining.toFixed(4)));
          } else {
            const share = totalOriginal > 0 ? (mLine.quantity / totalOriginal) : (1 / totalCount);
            const allocated = Number((adjustment.actualQuantity * share).toFixed(4));
            finalQuantity = allocated;
            remainingAdjustedQty.set(originalSku, currentRemaining - allocated);
          }
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

    // Convert to Sage units
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
    if (!hasItems) return 'mrm-status-badge--warning';
    const status = normalizeOrderStatus(order.status);
    if (status === 'materials_checked' || status === 'sent_to_sage') return 'mrm-status-badge--completed';
    if (order.productionReview?.status === 'draft') return 'mrm-status-badge--pending';
    return 'mrm-status-badge--draft';
  };

  const getStatusBadgeLabel = () => {
    if (!hasItems) return 'Datos Incompletos';
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
              Componentes / Herrajes ({adjustments.length})
            </button>
            <button 
              className={`mrm-tab ${activeTab === 'fabrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('fabrics')}
            >
              Telas / Paños ({fabricAdjustments.length})
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

          {!hasItems ? (
            <div className="mrm-empty-state--warning" role="alert">
              <div className="mrm-empty-title">
                <span style={{ fontSize: '20px' }}>⚠️</span> Esta orden no contiene persianas ni materiales registrados.
              </div>
              <div className="mrm-empty-subtitle">
                Puede tratarse de una orden de prueba o de una orden creada con una versión anterior sin datos persistidos.
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'components' && (
                <div className="mrm-worklist-container">
                  {/* Progress toolbar */}
                  <div className="mrm-worklist-toolbar">
                    <div className="mrm-progress-group">
                      <span className="mrm-progress-label">
                        Revisados <strong>{reviewedComponentsCount}</strong> de <strong>{adjustments.length}</strong>
                      </span>
                      <div className="mrm-progress-bar-track" title={`${componentsProgressPercent}% completado`}>
                        <div 
                          className="mrm-progress-bar-fill" 
                          style={{ width: `${componentsProgressPercent}%` }} 
                        />
                      </div>
                      <span className="mrm-progress-percent">{componentsProgressPercent}%</span>
                    </div>

                    <Button variant="secondary" size="sm" onClick={handleAddMaterial} className="mrm-btn-add-extra">
                      + Agregar Material Extra
                    </Button>
                  </div>

                  {adjustments.length === 0 ? (
                    <div className="mrm-empty-state mrm-empty-state--info">
                      ℹ No hay componentes/herrajes que requieran revisión para esta orden.
                    </div>
                  ) : (
                    <div className="mrm-table-wrapper">
                      {/* Sticky Table Header */}
                      <div className="mrm-table-header mrm-table-header--components">
                        <div className="mrm-th mrm-th--material">MATERIAL / SKU</div>
                        <div className="mrm-th mrm-th--calculated">CALCULADO</div>
                        <div className="mrm-th mrm-th--action">REVISIÓN</div>
                        <div className="mrm-th mrm-th--detail">DETALLE / AJUSTE</div>
                        <div className="mrm-th mrm-th--status">ESTADO</div>
                      </div>

                      {/* Table Rows */}
                      <div className="mrm-table-body">
                        {adjustments.map((adj, index) => {
                          const isConfirmed = adj.action === 'confirmed';
                          const isAdded = adj.action === 'added';
                          const isRemoved = adj.action === 'removed';
                          const isSubstituted = adj.action === 'substituted';
                          const isQtyAdjusted = adj.action === 'quantity_adjusted';
                          const isComplete = isComponentAdjustmentComplete(adj);

                          let rowClass = 'mrm-row';
                          if (isConfirmed) rowClass += ' mrm-row--confirmed';
                          if (isSubstituted) rowClass += ' mrm-row--substituted';
                          if (isQtyAdjusted) rowClass += ' mrm-row--modified';
                          if (isAdded) rowClass += ' mrm-row--added';
                          if (isRemoved) rowClass += ' mrm-row--removed';
                          if (!isComplete) rowClass += ' mrm-row--incomplete';

                          return (
                            <div key={adj.id} className={rowClass}>
                              {/* 1. Material / SKU */}
                              <div className="mrm-cell mrm-cell--material">
                                <div className="mrm-cell-title" title={adj.calculatedDescription || adj.actualDescription || 'Línea extra'}>
                                  {adj.calculatedDescription || adj.actualDescription || (isAdded ? 'Material Extra' : 'Componente')}
                                </div>
                                <div className="mrm-cell-sku">
                                  {isAdded ? (
                                    <span className="mrm-sku-badge mrm-sku-badge--extra">Extra</span>
                                  ) : (
                                    adj.calculatedSku
                                  )}
                                </div>
                              </div>

                              {/* 2. Calculado */}
                              <div className="mrm-cell mrm-cell--calculated">
                                {isAdded ? (
                                  <span className="mrm-muted-dash">—</span>
                                ) : (
                                  <span className="mrm-qty-display">
                                    <strong>{adj.calculatedQuantity}</strong> {adj.calculatedUnit}
                                  </span>
                                )}
                              </div>

                              {/* 3. Acción */}
                              <div className="mrm-cell mrm-cell--action">
                                <select 
                                  className="mrm-compact-select"
                                  value={adj.action} 
                                  onChange={e => handleUpdateAdjustment(index, { action: e.target.value as ProductionMaterialAdjustmentAction })}
                                >
                                  {adj.calculatedSku && <option value="confirmed">✓ Confirmar</option>}
                                  {adj.calculatedSku && <option value="substituted">⇄ Sustituir SKU</option>}
                                  {adj.calculatedSku && <option value="quantity_adjusted">± Ajustar Cant.</option>}
                                  {adj.calculatedSku && <option value="removed">× Remover / No usar</option>}
                                  {adj.action === "added" && <option value="added">+ Agregado extra</option>}
                                </select>
                              </div>

                              {/* 4. Detalle / Ajuste */}
                              <div className="mrm-cell mrm-cell--detail">
                                {isConfirmed ? (
                                  <span className="mrm-detail-confirmed">Igual a calculado</span>
                                ) : isRemoved ? (
                                  <div className="mrm-inline-edit-group">
                                    <span className="mrm-detail-removed">No se descontará en Sage</span>
                                    <select 
                                      className="mrm-compact-select mrm-compact-select--reason"
                                      value={adj.reason || ''} 
                                      onChange={e => handleUpdateAdjustment(index, { reason: e.target.value as ProductionMaterialAdjustmentReason })}
                                    >
                                      <option value="" disabled>Motivo (Req)...</option>
                                      <option value="out_of_stock">Falta stock</option>
                                      <option value="authorized_substitution">Sustitución autorizada</option>
                                      <option value="bom_error">Error de BOM</option>
                                      <option value="production_decision">Decisión de piso</option>
                                      <option value="other">Otro</option>
                                    </select>
                                  </div>
                                ) : (
                                  <div className="mrm-inline-edit-group">
                                    {(isSubstituted || isAdded) && (
                                      <input 
                                        type="text" 
                                        className="mrm-compact-input mrm-compact-input--sku"
                                        placeholder="SKU Real..." 
                                        value={adj.actualSku || ''} 
                                        onChange={e => handleUpdateAdjustment(index, { actualSku: e.target.value })}
                                      />
                                    )}

                                    <div className="mrm-compact-qty-group">
                                      <input 
                                        type="number" 
                                        step="0.001"
                                        className="mrm-compact-input mrm-compact-input--qty"
                                        placeholder="Cant." 
                                        value={adj.actualQuantity ?? ''} 
                                        onChange={e => handleUpdateAdjustment(index, { actualQuantity: parseFloat(e.target.value) })}
                                      />
                                      <input 
                                        type="text" 
                                        className="mrm-compact-input mrm-compact-input--unit"
                                        placeholder="Unid." 
                                        value={adj.actualUnit || ''} 
                                        onChange={e => handleUpdateAdjustment(index, { actualUnit: e.target.value })}
                                      />
                                    </div>

                                    <select 
                                      className="mrm-compact-select mrm-compact-select--reason"
                                      value={adj.reason || ''} 
                                      onChange={e => handleUpdateAdjustment(index, { reason: e.target.value as ProductionMaterialAdjustmentReason })}
                                    >
                                      <option value="" disabled>Motivo (Req)...</option>
                                      <option value="out_of_stock">Falta stock (Sustituido)</option>
                                      <option value="authorized_substitution">Sustitución autorizada</option>
                                      <option value="bom_error">Error de cálculo BOM</option>
                                      <option value="production_decision">Decisión piso producción</option>
                                      <option value="additional_component">Componente extra req.</option>
                                      <option value="other">Otro</option>
                                    </select>

                                    <input 
                                      type="text" 
                                      className="mrm-compact-input mrm-compact-input--notes"
                                      placeholder="Notas adicionales..." 
                                      value={adj.notes || ''} 
                                      onChange={e => handleUpdateAdjustment(index, { notes: e.target.value })}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* 5. Estado Badge */}
                              <div className="mrm-cell mrm-cell--status">
                                {isConfirmed ? (
                                  <span className="mrm-status-pill mrm-status-pill--confirmed">✓ Igual</span>
                                ) : !isComplete ? (
                                  <span className="mrm-status-pill mrm-status-pill--warning" title="Faltan datos requeridos (SKU, cantidad o motivo)">
                                    ⚠ Revisar
                                  </span>
                                ) : isSubstituted ? (
                                  <span className="mrm-status-pill mrm-status-pill--substituted">⇄ Sustituido</span>
                                ) : isQtyAdjusted ? (
                                  <span className="mrm-status-pill mrm-status-pill--modified">± Ajustado</span>
                                ) : isAdded ? (
                                  <span className="mrm-status-pill mrm-status-pill--added">+ Extra</span>
                                ) : isRemoved ? (
                                  <span className="mrm-status-pill mrm-status-pill--removed">× Removido</span>
                                ) : (
                                  <span className="mrm-status-pill mrm-status-pill--modified">Δ Modificado</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'fabrics' && (
                <div className="mrm-worklist-container">
                  {/* Progress toolbar */}
                  <div className="mrm-worklist-toolbar">
                    <div className="mrm-progress-group">
                      <span className="mrm-progress-label">
                        Revisadas <strong>{reviewedFabricsCount}</strong> de <strong>{fabricAdjustments.length}</strong>
                      </span>
                      <div className="mrm-progress-bar-track" title={`${fabricsProgressPercent}% completado`}>
                        <div 
                          className="mrm-progress-bar-fill" 
                          style={{ width: `${fabricsProgressPercent}%` }} 
                        />
                      </div>
                      <span className="mrm-progress-percent">{fabricsProgressPercent}%</span>
                    </div>
                  </div>

                  {fabricAdjustments.length === 0 ? (
                    <div className="mrm-empty-state mrm-empty-state--info">
                      ℹ No hay telas/paños que requieran revisión para esta orden.
                    </div>
                  ) : (
                    <div className="mrm-table-wrapper">
                      {/* Sticky Table Header */}
                      <div className="mrm-table-header mrm-table-header--fabrics">
                        <div className="mrm-th mrm-th--material">CORTINA / TELA</div>
                        <div className="mrm-th mrm-th--dims">MEDIDAS / ORIGEN</div>
                        <div className="mrm-th mrm-th--calculated">CALCULADO</div>
                        <div className="mrm-th mrm-th--action">REVISIÓN</div>
                        <div className="mrm-th mrm-th--detail">DETALLE SAGE</div>
                        <div className="mrm-th mrm-th--status">ESTADO</div>
                      </div>

                      {/* Table Rows */}
                      <div className="mrm-table-body">
                        {fabricAdjustments.map((adj, index) => {
                          const isConfirmed = adj.action === 'confirmed';
                          const isRemoved = adj.action === 'removed';
                          const isSubstituted = adj.action === 'fabric_substituted';
                          const isComplete = isFabricAdjustmentComplete(adj);

                          let rowClass = 'mrm-row mrm-row--fabric';
                          if (isConfirmed) rowClass += ' mrm-row--confirmed';
                          if (isSubstituted) rowClass += ' mrm-row--substituted';
                          if (isRemoved) rowClass += ' mrm-row--removed';
                          if (!isComplete) rowClass += ' mrm-row--incomplete';

                          return (
                            <div key={adj.id} className={rowClass}>
                              {/* 1. Cortina / Tela */}
                              <div className="mrm-cell mrm-cell--material">
                                <div className="mrm-cell-title">{adj.curtainLabel}</div>
                                <div className="mrm-cell-sku">{adj.calculatedFabricSku}</div>
                              </div>

                              {/* 2. Medidas / Origen */}
                              <div className="mrm-cell mrm-cell--dims">
                                <div className="mrm-dims-text">{adj.calculatedWidthM} x {adj.calculatedHeightM}m</div>
                                <div className="mrm-origin-pill">
                                  {adj.calculatedSource === 'roll' ? `Rollo ${adj.calculatedRollWidthM}m` : `Retazo ${adj.calculatedRemnantSize}`}
                                </div>
                              </div>

                              {/* 3. Calculado */}
                              <div className="mrm-cell mrm-cell--calculated">
                                <span className="mrm-qty-display">
                                  <strong>{adj.calculatedAreaY2 ? adj.calculatedAreaY2.toFixed(2) : '—'}</strong> Y2
                                </span>
                              </div>

                              {/* 4. Acción */}
                              <div className="mrm-cell mrm-cell--action">
                                <select 
                                  className="mrm-compact-select"
                                  value={adj.action} 
                                  onChange={e => handleUpdateFabricAdjustment(index, { action: e.target.value as ProductionFabricAdjustmentAction })}
                                >
                                  <option value="confirmed">✓ Confirmar</option>
                                  <option value="fabric_substituted">⇄ Sustituir Tela</option>
                                  <option value="roll_width_changed">↔ Cambiar Ancho Rollo</option>
                                  <option value="remnant_changed">▫ Usar Retazo</option>
                                  <option value="consumption_adjusted">± Ajustar Área (Y2)</option>
                                  <option value="removed">× Remover / No usar</option>
                                </select>
                              </div>

                              {/* 5. Detalle Sage */}
                              <div className="mrm-cell mrm-cell--detail">
                                {isConfirmed ? (
                                  <span className="mrm-detail-confirmed">
                                    Final: <strong>{adj.actualAreaY2 ? adj.actualAreaY2.toFixed(2) : '—'}</strong> Y2
                                  </span>
                                ) : isRemoved ? (
                                  <div className="mrm-inline-edit-group">
                                    <span className="mrm-detail-removed">No se descontará en Sage</span>
                                    <select 
                                      className="mrm-compact-select mrm-compact-select--reason"
                                      value={adj.reason || ''} 
                                      onChange={e => handleUpdateFabricAdjustment(index, { reason: e.target.value as ProductionFabricAdjustmentReason })}
                                    >
                                      <option value="" disabled>Motivo (Req)...</option>
                                      <option value="out_of_stock">Falta stock tela/rollo</option>
                                      <option value="authorized_substitution">Sustitución autorizada</option>
                                      <option value="production_decision">Decisión de piso</option>
                                      <option value="other">Otro</option>
                                    </select>
                                  </div>
                                ) : (
                                  <div className="mrm-inline-edit-group">
                                    <input 
                                      type="text" 
                                      className="mrm-compact-input mrm-compact-input--sku"
                                      placeholder="SKU Tela Final..." 
                                      value={adj.actualFabricSku || ''} 
                                      onChange={e => handleUpdateFabricAdjustment(index, { actualFabricSku: e.target.value })}
                                    />

                                    {(adj.action === 'roll_width_changed' || adj.action === 'fabric_substituted') && (
                                      <input 
                                        type="number" 
                                        step="0.01"
                                        className="mrm-compact-input mrm-compact-input--qty"
                                        placeholder="Ancho rollo (m)" 
                                        value={adj.actualRollWidthM || ''} 
                                        onChange={e => handleUpdateFabricAdjustment(index, { actualRollWidthM: parseFloat(e.target.value) })}
                                      />
                                    )}

                                    {adj.action === 'remnant_changed' && (
                                      <input 
                                        type="text" 
                                        className="mrm-compact-input"
                                        placeholder="Medida Retazo (1x1)" 
                                        value={adj.actualRemnantSize || ''} 
                                        onChange={e => handleUpdateFabricAdjustment(index, { actualRemnantSize: e.target.value })}
                                      />
                                    )}

                                    <input 
                                      type="number" 
                                      step="0.001"
                                      className="mrm-compact-input mrm-compact-input--qty"
                                      placeholder="Área Final (Y2)" 
                                      value={adj.actualAreaY2 ?? ''} 
                                      onChange={e => handleUpdateFabricAdjustment(index, { actualAreaY2: parseFloat(e.target.value) })}
                                    />

                                    <select 
                                      className="mrm-compact-select mrm-compact-select--reason"
                                      value={adj.reason || ''} 
                                      onChange={e => handleUpdateFabricAdjustment(index, { reason: e.target.value as ProductionFabricAdjustmentReason })}
                                    >
                                      <option value="" disabled>Motivo (Req)...</option>
                                      <option value="out_of_stock">Falta stock tela/rollo</option>
                                      <option value="authorized_substitution">Sustitución autorizada</option>
                                      <option value="fabric_error">Error en tela calculada</option>
                                      <option value="roll_width_change">Cambio ancho optimizar</option>
                                      <option value="remnant_decision">Uso de retazo (piso)</option>
                                      <option value="production_decision">Decisión general piso</option>
                                      <option value="other">Otro</option>
                                    </select>

                                    <input 
                                      type="text" 
                                      className="mrm-compact-input mrm-compact-input--notes"
                                      placeholder="Notas adicionales..." 
                                      value={adj.notes || ''} 
                                      onChange={e => handleUpdateFabricAdjustment(index, { notes: e.target.value })}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* 6. Estado Badge */}
                              <div className="mrm-cell mrm-cell--status">
                                {isConfirmed ? (
                                  <span className="mrm-status-pill mrm-status-pill--confirmed">✓ Igual</span>
                                ) : !isComplete ? (
                                  <span className="mrm-status-pill mrm-status-pill--warning" title="Faltan datos requeridos (área Y2 o motivo)">
                                    ⚠ Revisar
                                  </span>
                                ) : isSubstituted ? (
                                  <span className="mrm-status-pill mrm-status-pill--substituted">⇄ Sustituido</span>
                                ) : isRemoved ? (
                                  <span className="mrm-status-pill mrm-status-pill--removed">× Removido</span>
                                ) : (
                                  <span className="mrm-status-pill mrm-status-pill--modified">Δ Modificado</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="mrm-footer">
          <div className="mrm-footer__left">
            <Button 
              variant="secondary" 
              onClick={handleConfirmAll} 
              className="mrm-btn-action"
              disabled={!hasItems}
              title={!hasItems ? "No hay materiales para confirmar en esta orden." : undefined}
            >
              ✓ Confirmar todo sin cambios
            </Button>
          </div>
          <div className="mrm-footer__right">
            {hasItems && totalIncomplete > 0 && (
              <div className="mrm-footer-alert" role="status">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                <span>{totalIncomplete} {totalIncomplete === 1 ? 'material con datos pendientes' : 'materiales con datos pendientes'}</span>
              </div>
            )}
            <Button variant="ghost" onClick={onClose} className="mrm-btn-action">Cancelar</Button>
            <Button 
              variant="secondary" 
              onClick={handleSaveDraft} 
              className="mrm-btn-action"
              disabled={!hasItems}
              title={!hasItems ? "No hay materiales registrados para guardar borrador." : undefined}
            >
              Guardar Borrador
            </Button>
            <Button 
              variant="primary" 
              onClick={handleComplete} 
              className="mrm-btn-action" 
              style={{ backgroundColor: 'var(--primary-dark)', borderColor: 'var(--primary-dark)', boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)' }}
              disabled={!hasItems}
              title={!hasItems ? "No es posible completar la revisión porque la orden no contiene materiales registrados." : undefined}
            >
              Completar Revisión
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
