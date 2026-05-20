export type SageMaterialLine = {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
};

export type ProductionMaterialAdjustmentAction = 
  | "confirmed"
  | "substituted"
  | "quantity_adjusted"
  | "added"
  | "removed";

export type ProductionMaterialAdjustmentReason =
  | "out_of_stock"
  | "authorized_substitution"
  | "bom_error"
  | "production_decision"
  | "additional_component"
  | "other";

export type ProductionMaterialAdjustment = {
  id: string;

  calculatedSku?: string;
  calculatedDescription?: string;
  calculatedQuantity?: number;
  calculatedUnit?: string;

  actualSku?: string;
  actualDescription?: string;
  actualQuantity?: number;
  actualUnit?: string;

  action: ProductionMaterialAdjustmentAction;
  reason?: ProductionMaterialAdjustmentReason;
  notes?: string;
};

export type DiscardedLinearRemainder = {
  sku: string;
  materialKind?: "tube" | "bottomrail" | "other";
  lengthFt: number;
  lengthM: number;
  reason: "Menor a 1.00 m";
  barIndex?: number;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
};

export type ProductionIssueSnapshot = {
  generatedAt: string;
  snapshotStatus: 'preview' | 'final';
  issueLines: SageMaterialLine[];
  cutPlans: any[]; // Avoid circular deps, will use actual type in components or import it if needed. Let's import CutPlan and CutFromRemainder
  cutsFromRemainders: any[];
  createdRemainders: any[];
  discardedLinearRemainders?: DiscardedLinearRemainder[];
};

export type ProductionMaterialReview = {
  reviewedAt: string;
  reviewedBy?: string;
  status: "draft" | "completed";
  adjustments: ProductionMaterialAdjustment[];
  finalMaterialLines: SageMaterialLine[];
  fabricAdjustments?: ProductionFabricAdjustment[];
  finalFabricLines?: SageMaterialLine[];
  issueSnapshot?: ProductionIssueSnapshot;
};

export type ProductionFabricAdjustmentAction =
  | 'confirmed'
  | 'fabric_substituted'
  | 'roll_width_changed'
  | 'consumption_adjusted'
  | 'remnant_changed'
  | 'removed';

export type ProductionFabricAdjustmentReason =
  | 'out_of_stock'
  | 'authorized_substitution'
  | 'fabric_error'
  | 'roll_width_change'
  | 'remnant_decision'
  | 'production_decision'
  | 'other';

export type ProductionFabricAdjustment = {
  id: string;
  curtainId: string;
  curtainLabel?: string;

  calculatedFabricSku?: string;
  calculatedFabricDescription?: string;
  calculatedWidthM?: number;
  calculatedHeightM?: number;
  calculatedRollWidthM?: number;
  calculatedConsumptionM?: number;
  calculatedConsumptionYd?: number;
  calculatedWastePercent?: number;
  calculatedSource?: 'roll' | 'remnant';
  calculatedRemnantId?: string;
  calculatedRemnantSize?: string;
  calculatedAreaY2?: number;

  actualFabricSku?: string;
  actualFabricDescription?: string;
  actualRollWidthM?: number;
  actualConsumptionM?: number;
  actualConsumptionYd?: number;
  actualAreaM2?: number;
  actualAreaY2?: number;
  actualSource?: 'roll' | 'remnant';
  actualRemnantId?: string;
  actualRemnantSize?: string;

  action: ProductionFabricAdjustmentAction;
  reason?: ProductionFabricAdjustmentReason;
  notes?: string;
};

export function generateFinalMaterialLines(adjustments: ProductionMaterialAdjustment[]): SageMaterialLine[] {
  const aggregated = new Map<string, SageMaterialLine>();

  const addOrUpdate = (sku: string, desc: string, qty: number, unit: string) => {
    // Key por sku + unidad para evitar mezcla
    const key = `${sku}_${unit}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      aggregated.set(key, {
        sku,
        description: desc,
        quantity: qty,
        unit
      });
    }
  };

  for (const adj of adjustments) {
    if (adj.action === "removed") {
      continue;
    }

    if (adj.action === "confirmed") {
      if (adj.calculatedSku && adj.calculatedQuantity !== undefined && adj.calculatedUnit) {
        addOrUpdate(adj.calculatedSku, adj.calculatedDescription || adj.calculatedSku, adj.calculatedQuantity, adj.calculatedUnit);
      }
    } else if (adj.action === "substituted" || adj.action === "quantity_adjusted" || adj.action === "added") {
      if (adj.actualSku && adj.actualQuantity !== undefined && adj.actualUnit) {
        addOrUpdate(adj.actualSku, adj.actualDescription || adj.actualSku, adj.actualQuantity, adj.actualUnit);
      }
    }
  }

  return Array.from(aggregated.values());
}


export function generateFinalFabricLines(adjustments: ProductionFabricAdjustment[]): SageMaterialLine[] {
  const aggregated = new Map<string, SageMaterialLine>();

  const addOrUpdate = (sku: string, desc: string, qtyY2: number) => {
    const key = sku + '_Y2';
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += qtyY2;
    } else {
      aggregated.set(key, {
        sku,
        description: desc,
        quantity: qtyY2,
        unit: 'Y2'
      });
    }
  };

  for (const adj of adjustments) {
    if (adj.action === 'removed') {
      continue;
    }

    let sku = '';
    let desc = '';
    let areaY2 = 0;

    if (adj.action === 'confirmed') {
      sku = adj.calculatedFabricSku || '';
      desc = adj.calculatedFabricDescription || sku;
      areaY2 = adj.actualAreaY2 || adj.calculatedAreaY2 || 0;
    } else {
      sku = adj.actualFabricSku || adj.calculatedFabricSku || '';
      desc = adj.actualFabricDescription || adj.calculatedFabricDescription || sku;
      areaY2 = adj.actualAreaY2 || 0;
    }

    if (sku && areaY2 > 0) {
      addOrUpdate(sku, desc, areaY2);
    }
  }

  // Round quantities to 4 decimal places for Sage
  const result = Array.from(aggregated.values());
  result.forEach(r => {
    r.quantity = Number(r.quantity.toFixed(4));
  });

  return result;
}
