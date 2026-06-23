import { FabricSelectionSnapshot } from '../lib/priceCatalog';
import { InventoryItem } from '../domain/inventory/types';

const ROLL_WIDTH_TOLERANCE_METERS = 0.01;

export function areRollWidthsEquivalent(a: number, b: number): boolean {
  return Math.abs(a - b) <= ROLL_WIDTH_TOLERANCE_METERS;
}

export type StockAwareFabricSelectionInput = {
  preferredFabric: FabricSelectionSnapshot | null;
  candidateFabrics: FabricSelectionSnapshot[];
  inventoryItems: InventoryItem[];
  cutLengthMeters: number;
  requiredCutWidthMeters?: number;
};

export type StockAwareFabricSelectionResult = {
  selectedFabric: FabricSelectionSnapshot | null;
  selectedInventoryItemId?: string;
  selectedWidthMeters?: number;
  requiredYd2?: number;
  availableYd2?: number;
  wasSubstituted: boolean;
  originalWidthMeters?: number;
  substitutedWidthMeters?: number;
  reason?:
    | 'optimal_width_available'
    | 'preferred_width_available'
    | 'preferred_width_insufficient_stock'
    | 'substituted_to_larger_width'
    | 'preferred_width_not_carried'
    | 'no_stock_available'
    | 'invalid_input';
  warnings: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    payload?: Record<string, unknown>;
  }>;
};

export function getAvailableFabricWidths(
  family: string,
  openness: string,
  color: string,
  inventoryItems: InventoryItem[],
  candidateFabrics: FabricSelectionSnapshot[]
): number[] {
  const rolls = inventoryItems.filter(item => 
    item.category === 'fabric' && 
    item.kind === 'roll' && 
    item.payload?.source === 'vertilux_api' &&
    item.payload?.family === family && 
    item.payload?.openness === openness && 
    item.payload?.color === color
  );

  const widths = rolls
    .map(r => Number(r.payload?.width_meters))
    .filter(w => !isNaN(w) && w > 0);

  const uniqueNormalized: number[] = [];
  for (const w of widths) {
    if (!uniqueNormalized.some(uw => areRollWidthsEquivalent(uw, w))) {
      uniqueNormalized.push(w);
    }
  }

  return uniqueNormalized.sort((a, b) => a - b);
}

export function selectFabricWithStock(
  input: StockAwareFabricSelectionInput
): StockAwareFabricSelectionResult {
  const { preferredFabric, candidateFabrics, inventoryItems, cutLengthMeters } = input;

  if (cutLengthMeters <= 0 || !preferredFabric) {
    return {
      selectedFabric: preferredFabric || null,
      wasSubstituted: false,
      reason: 'invalid_input',
      warnings: [{
        code: 'INVALID_INPUT',
        message: 'Medidas de corte inválidas o falta tela preferida.',
        severity: 'error'
      }]
    };
  }

  // Identificar telas de la misma familia, openness y color del catálogo
  const targetFamily = preferredFabric.family;
  const targetOpenness = preferredFabric.openness;
  const targetColor = preferredFabric.color;

  // Filtrar el inventario para encontrar rollos disponibles de esta tela exacta
  // Solo rolls que estén 'available', que sean de tipo 'roll', categoría 'fabric', y tengan 'available_yd2'
  const validRolls = inventoryItems.filter(item => {
    if (item.category !== 'fabric' || item.kind !== 'roll' || item.status !== 'available' || item.deleted_at) {
      return false;
    }
    const p = item.payload;
    if (!p) return false;
    
    // Check available_yd2 explicitly
    if (p.available_yd2 === undefined || p.available_yd2 === null || isNaN(Number(p.available_yd2))) {
      return false;
    }

    // Identificar equivalencia por catálogo (los items de inventario guardan esto en payload)
    if (p.family !== targetFamily || p.openness !== targetOpenness || p.color !== targetColor) {
      return false;
    }

    return true;
  });

  const carriedWidths = getAvailableFabricWidths(targetFamily, targetOpenness, targetColor, inventoryItems, candidateFabrics);

  // Determinar el ancho mínimo requerido
  const minRequiredWidth = input.requiredCutWidthMeters ?? preferredFabric.widthMeters;

  // Filtrar anchos reales que cubran el requerimiento
  const coveringWidths = carriedWidths.filter(w => w >= minRequiredWidth || areRollWidthsEquivalent(w, minRequiredWidth));

  if (coveringWidths.length === 0) {
    return {
      selectedFabric: preferredFabric,
      wasSubstituted: false,
      reason: 'no_stock_available',
      warnings: [{
        code: 'NO_SUITABLE_WIDTH',
        message: `Ningún ancho histórico disponible cubre la medida requerida de ${minRequiredWidth}m.`,
        severity: 'error'
      }]
    };
  }

  // El Ancho Óptimo Real es el menor de los que cubren
  const optimalRealWidth = coveringWidths[0];
  const optimalRequiredYd2 = optimalRealWidth * cutLengthMeters * 1.1959900463;

  let optimalCandidate = candidateFabrics.find(c => 
    c.family === targetFamily && c.openness === targetOpenness && c.color === targetColor && 
    areRollWidthsEquivalent(c.widthMeters, optimalRealWidth)
  ) || preferredFabric;

  const optimalMatch = validRolls.find(r => {
    const p = r.payload;
    return areRollWidthsEquivalent(Number(p.width_meters), optimalRealWidth) && Number(p.available_yd2) >= optimalRequiredYd2;
  });

  if (optimalMatch) {
    // Encontramos stock para el Ancho Óptimo Real
    const isDifferentFromPreferred = !areRollWidthsEquivalent(optimalRealWidth, preferredFabric.widthMeters);
    return {
      selectedFabric: optimalCandidate,
      selectedInventoryItemId: optimalMatch.id,
      selectedWidthMeters: optimalRealWidth,
      requiredYd2: optimalRequiredYd2,
      availableYd2: Number(optimalMatch.payload.available_yd2),
      wasSubstituted: isDifferentFromPreferred,
      originalWidthMeters: preferredFabric.widthMeters,
      substitutedWidthMeters: isDifferentFromPreferred ? optimalRealWidth : undefined,
      reason: 'optimal_width_available',
      warnings: [] // NUNCA emitimos warning si se usa el Ancho Óptimo Real
    };
  }

  // Si no hay stock para el Ancho Óptimo Real, iterar los siguientes anchos superiores
  for (let i = 1; i < coveringWidths.length; i++) {
    const candidateWidth = coveringWidths[i];
    const candidateRequiredYd2 = candidateWidth * cutLengthMeters * 1.1959900463;

    const candidateMatch = validRolls.find(r => {
      const p = r.payload;
      return areRollWidthsEquivalent(Number(p.width_meters), candidateWidth) && Number(p.available_yd2) >= candidateRequiredYd2;
    });

    if (candidateMatch) {
      const candidateFabric = candidateFabrics.find(c => 
        c.family === targetFamily && c.openness === targetOpenness && c.color === targetColor && 
        areRollWidthsEquivalent(c.widthMeters, candidateWidth)
      ) || optimalCandidate;

      return {
        selectedFabric: candidateFabric,
        selectedInventoryItemId: candidateMatch.id,
        selectedWidthMeters: candidateWidth,
        requiredYd2: candidateRequiredYd2,
        availableYd2: Number(candidateMatch.payload.available_yd2),
        wasSubstituted: true,
        originalWidthMeters: preferredFabric.widthMeters,
        substitutedWidthMeters: candidateWidth,
        reason: 'substituted_to_larger_width',
        warnings: [{
          code: 'FABRIC_SUBSTITUTED',
          message: `No hay stock suficiente en ancho ${optimalRealWidth}m. Se usará ancho ${candidateWidth}m porque cubre el requerimiento.`,
          severity: 'warning'
        }]
      };
    }
  }

  // Si llegamos aquí, no hay stock ni de la preferida ni de las sustitutas
  // Devolvemos la preferida pero con error de no hay stock
  
  // Agregar un warning por los items que fallaron por no tener available_yd2 (si había alguno del ancho buscado)
  const hadItemsWithoutYd2 = inventoryItems.some(item => 
    item.category === 'fabric' && 
    item.kind === 'roll' && 
    item.status === 'available' && 
    item.payload?.family === targetFamily && 
    item.payload?.openness === targetOpenness && 
    item.payload?.color === targetColor && 
    areRollWidthsEquivalent(Number(item.payload?.width_meters), optimalRealWidth ?? preferredFabric.widthMeters) &&
    (item.payload?.available_yd2 === undefined || item.payload?.available_yd2 === null || isNaN(Number(item.payload?.available_yd2)))
  );

  const warnings: StockAwareFabricSelectionResult['warnings'] = [{
    code: 'INSUFFICIENT_STOCK',
    message: `No hay stock suficiente (en yd2) para la tela ${preferredFabric.itemCode} en ninguno de sus anchos útiles.`,
    severity: 'error'
  }];

  if (hadItemsWithoutYd2) {
    warnings.push({
      code: 'MISSING_AVAILABLE_YD2',
      message: `Existen rollos de ${optimalRealWidth ?? preferredFabric.widthMeters}m pero no tienen el campo available_yd2 calculado.`,
      severity: 'warning'
    });
  }

  return {
    selectedFabric: preferredFabric, // Mantenemos el original para que el flow no rompa del todo
    selectedWidthMeters: optimalRealWidth ?? preferredFabric.widthMeters,
    requiredYd2: optimalRealWidth ? (optimalRealWidth * cutLengthMeters * 1.1959900463) : undefined,
    wasSubstituted: false,
    originalWidthMeters: preferredFabric.widthMeters,
    reason: 'no_stock_available',
    warnings
  };
}
