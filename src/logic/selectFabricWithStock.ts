import { FabricSelectionSnapshot } from '../lib/priceCatalog';
import { InventoryItem } from '../domain/inventory/types';

export type StockAwareFabricSelectionInput = {
  preferredFabric: FabricSelectionSnapshot | null;
  candidateFabrics: FabricSelectionSnapshot[];
  inventoryItems: InventoryItem[];
  cutLengthMeters: number;
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
    | 'preferred_width_available'
    | 'preferred_width_insufficient_stock'
    | 'substituted_to_larger_width'
    | 'no_stock_available'
    | 'invalid_input';
  warnings: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    payload?: Record<string, unknown>;
  }>;
};

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

  // Intentar con el preferredFabric primero
  const preferredWidth = preferredFabric.widthMeters;
  const preferredRequiredYd2 = preferredWidth * cutLengthMeters * 1.1959900463;

  const preferredMatch = validRolls.find(r => {
    const p = r.payload;
    return Number(p.width_meters) === preferredWidth && Number(p.available_yd2) >= preferredRequiredYd2;
  });

  if (preferredMatch) {
    return {
      selectedFabric: preferredFabric,
      selectedInventoryItemId: preferredMatch.id,
      selectedWidthMeters: preferredWidth,
      requiredYd2: preferredRequiredYd2,
      availableYd2: Number(preferredMatch.payload.available_yd2),
      wasSubstituted: false,
      originalWidthMeters: preferredWidth,
      reason: 'preferred_width_available',
      warnings: []
    };
  }

  // Si no hay suficiente stock del preferido, buscar equivalentes superiores
  // Buscar en el catálogo variantes que sean de mayor ancho
  const largerCandidates = candidateFabrics
    .filter(c => 
      c.family === targetFamily && 
      c.openness === targetOpenness && 
      c.color === targetColor && 
      c.widthMeters > preferredWidth
    )
    .sort((a, b) => a.widthMeters - b.widthMeters);

  for (const candidate of largerCandidates) {
    const candidateWidth = candidate.widthMeters;
    const candidateRequiredYd2 = candidateWidth * cutLengthMeters * 1.1959900463;

    const candidateMatch = validRolls.find(r => {
      const p = r.payload;
      return Number(p.width_meters) === candidateWidth && Number(p.available_yd2) >= candidateRequiredYd2;
    });

    if (candidateMatch) {
      return {
        selectedFabric: candidate,
        selectedInventoryItemId: candidateMatch.id,
        selectedWidthMeters: candidateWidth,
        requiredYd2: candidateRequiredYd2,
        availableYd2: Number(candidateMatch.payload.available_yd2),
        wasSubstituted: true,
        originalWidthMeters: preferredWidth,
        substitutedWidthMeters: candidateWidth,
        reason: 'substituted_to_larger_width',
        warnings: [{
          code: 'FABRIC_SUBSTITUTED',
          message: `Se usará rollo de ${candidateWidth}m porque no hay stock suficiente de ${preferredWidth}m.`,
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
    Number(item.payload?.width_meters) === preferredWidth &&
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
      message: `Existen rollos de ${preferredWidth}m pero no tienen el campo available_yd2 calculado.`,
      severity: 'warning'
    });
  }

  return {
    selectedFabric: preferredFabric, // Mantenemos el original para que el flow no rompa del todo
    selectedWidthMeters: preferredWidth,
    requiredYd2: preferredRequiredYd2,
    wasSubstituted: false,
    originalWidthMeters: preferredWidth,
    reason: 'no_stock_available',
    warnings
  };
}
