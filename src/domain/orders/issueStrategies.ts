import { componentCatalogBySku } from '../inventory/componentCatalog';

export type IssueMode = 
  | 'exact_area'
  | 'full_piece_with_remainders'
  | 'exact_linear'
  | 'exact_each';

export interface ReusableRemainder {
  id: string;
  sku: string;
  description: string;
  originalLengthFt: number;
  remainingLengthFt: number;
  createdFromOrderId?: string;
  createdFromBatchId?: string;
  consumedByOrderIds: string[];
  createdAt: string;
  status: 'available' | 'reserved' | 'consumed';
}

export interface SageDetailLine {
  itemCode: string;
  quantity: number;
  unit?: string;
}

export interface IssueEngineInputLine {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  category?: string;
  orderId?: string;
  itemId?: string;
  curtainRef?: string;
}

export type CutPlanCut = {
  sourceOrderId: string;
  sourceItemId?: string;
  curtainRef?: string;
  lengthFt: number;
  lengthM?: number;
};

export type CutPlanBar = {
  barIndex: number;
  cuts: CutPlanCut[];
  usedFt: number;
  remainingFt: number;
};

export type CutPlan = {
  sku: string;
  description: string;
  pieceLengthFt: number;
  bars: CutPlanBar[];
};

export interface IssueEngineResult {
  sageLines: SageDetailLine[];
  updatedRemainders: ReusableRemainder[];
  cutPlans: CutPlan[];
}

export function determineIssueMode(sku: string, unit: string): IssueMode {
  const catalogEntry = componentCatalogBySku[sku];

  // 1. Usar el catálogo si tiene explícitamente issueMode
  if (catalogEntry?.issueMode) {
    return catalogEntry.issueMode as IssueMode;
  }

  // 2. Fallback conservador puro por unidad
  const lowerUnit = unit.toLowerCase();
  
  if (lowerUnit === 'y2') {
    return 'exact_area';
  }

  if (lowerUnit === 'ea') {
    return 'exact_each';
  }

  if (lowerUnit === 'ft' || lowerUnit === 'm' || lowerUnit === 'yd' || lowerUnit === 'yd2') {
    return 'exact_linear';
  }

  return 'exact_each'; // Default super conservador
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}

export function calculateIssueLines(
  lines: IssueEngineInputLine[], 
  availableRemainders: ReusableRemainder[] = []
): IssueEngineResult {
  const sageExportMap = new Map<string, number>();
  const remainders = [...availableRemainders.map(r => ({...r, consumedByOrderIds: [...r.consumedByOrderIds]}))];
  const cutPlans: CutPlan[] = [];

  // Agrupar líneas por SKU
  const groupedLines = new Map<string, { sku: string, description: string, mode: IssueMode, lines: IssueEngineInputLine[] }>();

  for (const line of lines) {
    if (!line.sku || line.quantity <= 0) continue;
    
    // Override unit and issue mode based on catalog
    const catalogEntry = componentCatalogBySku[line.sku];
    const unitToUse = catalogEntry?.sageUnit || line.unit;
    const mode = determineIssueMode(line.sku, unitToUse);
    
    if (!groupedLines.has(line.sku)) {
       groupedLines.set(line.sku, { sku: line.sku, description: line.description, mode, lines: [] });
    }
    groupedLines.get(line.sku)!.lines.push(line);
  }

  for (const group of groupedLines.values()) {
    const { sku, description, mode, lines: groupLines } = group;

    if (mode === 'exact_area' || mode === 'exact_linear' || mode === 'exact_each') {
      const totalQty = groupLines.reduce((sum, l) => sum + l.quantity, 0);
      const current = sageExportMap.get(sku) || 0;
      sageExportMap.set(sku, current + totalQty);
      continue;
    }

    if (mode === 'full_piece_with_remainders') {
      const FULL_PIECE_FT = componentCatalogBySku[sku]?.pieceLengthFt || 19;
      // First Fit Decreasing asume cortes ideales sin pérdida de sierra (kerf = 0)
      
      const cuts = groupLines.map(line => {
        let ft = line.quantity;
        if (line.unit.toLowerCase() === 'm') {
          ft = line.quantity * 3.28084;
        }
        return {
           lengthFt: ft,
           lengthM: line.unit.toLowerCase() === 'm' ? line.quantity : undefined,
           sourceOrderId: line.orderId || '',
           sourceItemId: line.itemId,
           curtainRef: line.curtainRef,
           line
        };
      });

      // Ordenar de mayor a menor
      cuts.sort((a, b) => b.lengthFt - a.lengthFt);

      // Sobrantes disponibles
      const validRemainders = remainders
        .filter(r => r.sku === sku && r.status === 'available')
        .sort((a, b) => a.remainingLengthFt - b.remainingLengthFt);

      const bars: CutPlanBar[] = [];

      for (const cut of cuts) {
        if (cut.lengthFt > FULL_PIECE_FT) {
           throw new Error(`CUT_EXCEEDS_PIECE_LENGTH: El corte de ${cut.lengthFt.toFixed(2)} FT excede la barra de ${FULL_PIECE_FT} FT para el SKU ${sku}`);
        }

        // 1. Intentar sobrantes existentes
        const suitableRemainder = validRemainders.find(r => r.remainingLengthFt >= cut.lengthFt);
        if (suitableRemainder) {
           suitableRemainder.remainingLengthFt -= cut.lengthFt;
           if (cut.sourceOrderId && !suitableRemainder.consumedByOrderIds.includes(cut.sourceOrderId)) {
             suitableRemainder.consumedByOrderIds.push(cut.sourceOrderId);
           }
           if (suitableRemainder.remainingLengthFt < 0.1) {
             suitableRemainder.status = 'consumed';
           }
           continue; // Resuelto con sobrante
        }

        // 2. Intentar barra abierta en el plan
        let placedInBar = false;
        for (const bar of bars) {
           if (bar.usedFt + cut.lengthFt <= FULL_PIECE_FT) {
             bar.usedFt += cut.lengthFt;
             bar.remainingFt -= cut.lengthFt;
             bar.cuts.push({
               sourceOrderId: cut.sourceOrderId,
               sourceItemId: cut.sourceItemId,
               curtainRef: cut.curtainRef,
               lengthFt: cut.lengthFt,
               lengthM: cut.lengthM
             });
             placedInBar = true;
             break;
           }
        }

        // 3. Abrir nueva barra
        if (!placedInBar) {
           bars.push({
             barIndex: bars.length + 1,
             usedFt: cut.lengthFt,
             remainingFt: FULL_PIECE_FT - cut.lengthFt,
             cuts: [{
               sourceOrderId: cut.sourceOrderId,
               sourceItemId: cut.sourceItemId,
               curtainRef: cut.curtainRef,
               lengthFt: cut.lengthFt,
               lengthM: cut.lengthM
             }]
           });
        }
      }

      // Finalizar descargo a Sage y generar sobrantes
      if (bars.length > 0) {
         cutPlans.push({
           sku,
           description,
           pieceLengthFt: FULL_PIECE_FT,
           bars
         });

         const current = sageExportMap.get(sku) || 0;
         sageExportMap.set(sku, current + (bars.length * FULL_PIECE_FT));

         for (const bar of bars) {
            if (bar.remainingFt > 0) {
              const allOrderIds = Array.from(new Set(bar.cuts.map(c => c.sourceOrderId).filter(Boolean)));
              remainders.push({
                id: generateId(),
                sku: sku,
                description: description,
                originalLengthFt: FULL_PIECE_FT,
                remainingLengthFt: bar.remainingFt,
                consumedByOrderIds: allOrderIds,
                createdAt: new Date().toISOString(),
                status: 'available'
              });
            }
         }
      }
    }
  }

  const sageLines: SageDetailLine[] = [];
  sageExportMap.forEach((quantity, itemCode) => {
    sageLines.push({ 
      itemCode, 
      quantity: Number(quantity.toFixed(4)) 
    });
  });

  return {
    sageLines,
    updatedRemainders: remainders,
    cutPlans
  };
}
