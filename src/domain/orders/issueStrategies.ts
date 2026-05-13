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
  category?: string; // Optional if we infer mode from unit or description
  orderId?: string;
}

export interface IssueEngineResult {
  sageLines: SageDetailLine[];
  updatedRemainders: ReusableRemainder[];
}

export function determineIssueMode(sku: string, description: string, unit: string): IssueMode {
  // Infer the issue mode based on units or known strings since we don't have a rigid catalog DB here yet.
  const lowerDesc = description.toLowerCase();
  
  // Fabric is already pre-filtered out and exported directly as Y2 via finalFabricLines, 
  // but if it ever gets here, its unit would be Y2 or m2.
  if (unit === 'Y2') {
    return 'exact_area';
  }

  // Tubes and Bottomrails -> full piece
  if (
    lowerDesc.includes('tubo') || 
    lowerDesc.includes('tube') || 
    lowerDesc.includes('bottomrail') || 
    lowerDesc.includes('riel inferior') ||
    lowerDesc.includes('perfil')
  ) {
    return 'full_piece_with_remainders';
  }

  // Linear elements (Bottomrail, chain, cord, fascia) -> exact_linear
  if (unit === 'ft' || unit === 'm' || unit === 'yd') {
    return 'exact_linear';
  }

  // Default to exact_each
  return 'exact_each';
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

  for (const line of lines) {
    if (!line.sku || line.quantity <= 0) continue;

    const mode = determineIssueMode(line.sku, line.description, line.unit.toLowerCase());

    if (mode === 'exact_area' || mode === 'exact_linear' || mode === 'exact_each') {
      const current = sageExportMap.get(line.sku) || 0;
      sageExportMap.set(line.sku, current + line.quantity);
      continue;
    }

    if (mode === 'full_piece_with_remainders') {
      const FULL_PIECE_FT = 19;
      let neededFt = line.quantity;
      
      // Assume unit is FT. If it's meters we'd have to convert, but let's assume FT for tubes in Luxia.
      if (line.unit.toLowerCase() === 'm') {
        neededFt = line.quantity * 3.28084;
      }

      // Try to find a remainder
      let usedRemainder = false;
      
      // Sort remainders ascending so we use the smallest valid one first to minimize waste
      const validRemainders = remainders
        .filter(r => r.sku === line.sku && r.status === 'available' && r.remainingLengthFt >= neededFt)
        .sort((a, b) => a.remainingLengthFt - b.remainingLengthFt);

      if (validRemainders.length > 0) {
        const remainder = validRemainders[0];
        remainder.remainingLengthFt -= neededFt;
        if (line.orderId && !remainder.consumedByOrderIds.includes(line.orderId)) {
          remainder.consumedByOrderIds.push(line.orderId);
        }
        if (remainder.remainingLengthFt < 0.1) {
          remainder.status = 'consumed';
        }
        usedRemainder = true;
      }

      if (!usedRemainder) {
        // Issue a full piece
        const current = sageExportMap.get(line.sku) || 0;
        sageExportMap.set(line.sku, current + FULL_PIECE_FT); // Exporting 19 FT

        // Create a new remainder
        const leftOver = FULL_PIECE_FT - neededFt;
        if (leftOver > 0) {
          remainders.push({
            id: generateId(),
            sku: line.sku,
            description: line.description,
            originalLengthFt: FULL_PIECE_FT,
            remainingLengthFt: leftOver,
            createdFromOrderId: line.orderId,
            consumedByOrderIds: line.orderId ? [line.orderId] : [],
            createdAt: new Date().toISOString(),
            status: 'available'
          });
        }
      }
    }
  }

  const sageLines: SageDetailLine[] = [];
  sageExportMap.forEach((quantity, itemCode) => {
    // Round quantity to 4 decimals to avoid floating point precision issues
    sageLines.push({ 
      itemCode, 
      quantity: Number(quantity.toFixed(4)) 
    });
  });

  return {
    sageLines,
    updatedRemainders: remainders
  };
}
