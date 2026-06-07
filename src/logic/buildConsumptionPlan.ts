import { SavedOrder } from '../domain/curtains/types';

export type ConsumptionPlan = {
  orderId?: string;
  orderNumber?: string;
  generatedAt: string;
  items: ConsumptionPlanItem[];
  warnings: ConsumptionPlanWarning[];
  metadata: Record<string, unknown>;
};

export type ConsumptionPlanItem = {
  action: 'consume' | 'create_scrap' | 'use_scrap';
  category: 'fabric' | 'tube' | 'bottom' | 'component';
  itemCode: string;
  requiredQuantity: number;
  unit: 'm' | 'ft' | 'yd2' | 'pcs';
  widthMeters?: number;
  specificInventoryItemId?: string;
  source: 'bom' | 'fabric_selection' | 'reused_waste' | 'manual';
  notes?: string;
  payload?: Record<string, unknown>;
};

export type ConsumptionPlanWarning = {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  payload?: Record<string, unknown>;
};

export function buildConsumptionPlan(savedOrder: SavedOrder): ConsumptionPlan {
  const plan: ConsumptionPlan = {
    orderId: savedOrder.id,
    orderNumber: savedOrder.orderNumber,
    generatedAt: new Date().toISOString(),
    items: [],
    warnings: [],
    metadata: {},
  };

  if (!savedOrder.items || savedOrder.items.length === 0) {
    plan.warnings.push({
      code: 'EMPTY_ORDER',
      message: 'La orden no tiene items a producir',
      severity: 'warning'
    });
    return plan;
  }

  savedOrder.items.forEach((item, index) => {
    const { result, reusedWastePiece, materialLines } = item;

    // 1. Tela
    if (reusedWastePiece) {
      plan.items.push({
        action: 'use_scrap',
        category: 'fabric',
        itemCode: reusedWastePiece.fabricItemCode || 'UNKNOWN_FABRIC',
        requiredQuantity: 1, // Se usa la pieza completa
        unit: 'pcs',
        widthMeters: reusedWastePiece.widthMeters,
        specificInventoryItemId: reusedWastePiece.id,
        source: 'reused_waste',
        notes: `Retazo reusado para cortina ${index + 1}`
      });
    } else if (result?.selectedFabric) {
      // Consumo normal de rollo
      const downloadedMeters = (result.fabricDownloadedYd2 / 1.19599); // Aproximado yd2 a m2, o tomamos length = yd2 / (width/0.9144)
      // Como no tenemos el largo en m exacto en el result, calculamos a partir de los M2
      const cutLengthMeters = result.fabricDownloadedM2 / result.recommendedRollWidthMeters;
      
      if (cutLengthMeters > 0) {
        plan.items.push({
          action: 'consume',
          category: 'fabric',
          itemCode: result.selectedFabric.itemCode,
          requiredQuantity: cutLengthMeters,
          unit: 'm',
          widthMeters: result.recommendedRollWidthMeters,
          source: 'fabric_selection',
          notes: `Corte de rollo para cortina ${index + 1}`,
          payload: {
            fabricDownloadedM2: result.fabricDownloadedM2,
            recommendedRollWidthMeters: result.recommendedRollWidthMeters
          }
        });
      } else {
        plan.warnings.push({
          code: 'ZERO_FABRIC_CONSUMPTION',
          message: `Cortina ${index + 1} tiene consumo de tela en cero o calculo fallido`,
          severity: 'warning'
        });
      }

      // Si hay desperdicio (merma) generamos create_scrap
      if (result.wastePieceWidthMeters > 0 && result.wastePieceHeightMeters > 0) {
        plan.items.push({
          action: 'create_scrap',
          category: 'fabric',
          itemCode: result.selectedFabric.itemCode,
          requiredQuantity: result.wastePieceHeightMeters,
          unit: 'm',
          widthMeters: result.wastePieceWidthMeters,
          source: 'bom',
          notes: `Sobrante generado de cortina ${index + 1}`,
          payload: {
            width_meters: result.wastePieceWidthMeters,
            length_meters: result.wastePieceHeightMeters
          }
        });
      }
    } else {
      plan.warnings.push({
        code: 'MISSING_FABRIC',
        message: `Cortina ${index + 1} no tiene selectedFabric ni reusedWastePiece`,
        severity: 'error'
      });
    }

    // 2. Componentes / Tubo / BottomRail
    if (materialLines && materialLines.length > 0) {
      materialLines.forEach((line) => {
        if (!line.itemCode) {
          plan.warnings.push({
            code: 'MISSING_ITEM_CODE',
            message: `Línea de material sin código en cortina ${index + 1}`,
            severity: 'warning',
            payload: { line }
          });
          return;
        }

        if (line.quantity === undefined || isNaN(line.quantity)) {
          plan.warnings.push({
            code: 'INVALID_QUANTITY',
            message: `Línea de material con cantidad inválida en cortina ${index + 1}`,
            severity: 'warning',
            payload: { line }
          });
          return;
        }

        const isTube = line.category === 'tube';
        const isBottom = line.category === 'bottom';
        let actionCat: 'tube' | 'bottom' | 'component' = 'component';
        if (isTube) actionCat = 'tube';
        else if (isBottom) actionCat = 'bottom';

        plan.items.push({
          action: 'consume',
          category: actionCat,
          itemCode: line.itemCode,
          requiredQuantity: line.quantity,
          unit: (line.unit as 'm'|'ft'|'pcs'|'yd2') || 'pcs',
          source: 'bom',
          notes: `Consumo BOM cortina ${index + 1}: ${line.description}`
        });
      });
    }
  });

  return plan;
}
