import { CalculationFormValues, CalculationInput, ScreenRuleConfig, ScreenRuleConfigFormValues, ProductionInventory, WastePiece, OrderDraft, CalculationResult, WasteReuseMatch } from '../../domain/curtains/types';
import { getMinFabricScrapSideMeters } from '../../lib/inventory';

export const MIN_WIDTH_METERS = 0.3;
export const MAX_WIDTH_METERS = 6;
export const MIN_HEIGHT_METERS = 0.3;
export const MAX_HEIGHT_METERS = 4;

export function parseDecimalValue(value: string) {
  const normalized = value.trim().replace(',', '.');
  return normalized === '' ? undefined : Number(normalized);
}

export function parseFormValues(values: CalculationFormValues): Partial<CalculationInput> {
  return {
    curtainType: values.curtainType,
    fabricFamily: values.fabricFamily,
    fabricOpenness: values.fabricOpenness,
    fabricColor: values.fabricColor,
    widthMeters: parseDecimalValue(values.widthMeters),
    heightMeters: parseDecimalValue(values.heightMeters),
  };
}

export function validateDimensionField(
  field: 'widthMeters' | 'heightMeters',
  rawValue: string,
) {
  const numericValue = parseDecimalValue(rawValue);

  if (numericValue === undefined || Number.isNaN(numericValue)) {
    return field === 'widthMeters'
      ? 'Ingresa un ancho valido.'
      : 'Ingresa un alto valido.';
  }

  if (numericValue <= 0) {
    return field === 'widthMeters'
      ? 'El ancho debe ser mayor que cero.'
      : 'El alto debe ser mayor que cero.';
  }

  if (field === 'widthMeters') {
    if (numericValue < MIN_WIDTH_METERS || numericValue > MAX_WIDTH_METERS) {
      return 'Ingresa un ancho entre 30 y 600 cm.';
    }
  } else if (numericValue < MIN_HEIGHT_METERS || numericValue > MAX_HEIGHT_METERS) {
    return 'Ingresa un alto entre 30 y 400 cm.';
  }

  return undefined;
}

export function buildWastePiecesFromInventory(inventory: ProductionInventory): WastePiece[] {
  return inventory.fabrics
    .filter(
      (item) =>
        item.kind === 'scrap' &&
        item.status === 'available' &&
        item.widthMeters >= getMinFabricScrapSideMeters() &&
        item.lengthMeters >= getMinFabricScrapSideMeters(),
    )
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      sourceItemId: item.id,
      sourceItemTitle: item.code,
      fabricFamily: item.family,
      fabricOpenness: item.openness,
      fabricColor: item.color,
      fabricItemCode: item.code,
      widthMeters: item.widthMeters,
      heightMeters: item.lengthMeters,
      areaM2: item.widthMeters * item.lengthMeters,
    }));
}

export function buildWastePiecesFromDraft(order: OrderDraft): WastePiece[] {
  return order.items
    .filter(
      (item) =>
        item.result.wastePieceWidthMeters > 0 && item.result.wastePieceHeightMeters > 0,
    )
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      sourceItemId: item.id,
      sourceItemTitle: item.title,
      sourceOrderNumber: order.orderNumber.trim() || 'Orden actual',
      fabricFamily: item.result.selectedFabric?.family,
      fabricOpenness: item.result.selectedFabric?.openness,
      fabricColor: item.result.selectedFabric?.color,
      fabricItemCode: item.result.selectedFabric?.itemCode,
      widthMeters: item.result.wastePieceWidthMeters,
      heightMeters: item.result.wastePieceHeightMeters,
      areaM2: item.result.wasteM2,
    }));
}

export function collectUsedWastePieceIds(orderDraft: OrderDraft): Set<string> {
  const ids = new Set<string>();

  orderDraft.items.forEach((item) => {
    if (item.reusedWastePiece?.id) {
      ids.add(item.reusedWastePiece.id);
    }
  });

  return ids;
}

export function isSameFabricIdentity(
  piece: WastePiece,
  selectedFabric: NonNullable<CalculationResult['selectedFabric']> | null,
) {
  if (!selectedFabric) {
    return false;
  }

  return (
    piece.fabricFamily?.toLowerCase() === selectedFabric.family.toLowerCase() &&
    piece.fabricOpenness?.toLowerCase() === selectedFabric.openness.toLowerCase() &&
    piece.fabricColor?.toLowerCase() === selectedFabric.color.toLowerCase()
  );
}

export function applyWasteReuseToResult(
  result: CalculationResult,
  selectedMatch: WasteReuseMatch | null,
): CalculationResult {
  if (!selectedMatch) {
    return result;
  }

  return {
    ...result,
    fabricDownloadedM2: 0,
    fabricUsefulM2: 0,
    wasteM2: 0,
    fabricDownloadedYd2: 0,
    fabricUsefulYd2: 0,
    wasteYd2: 0,
    wastePercentage: 0,
    fabricDownloadedCost: 0,
    fabricUsefulCost: 0,
    fabricWasteCost: 0,
    fabricSavingsCost: result.fabricDownloadedYd2 * result.fabricCostPerYd2,
    wasteWidthMeters: 0,
    wastePieceWidthMeters: 0,
    wastePieceHeightMeters: 0,
  };
}

export const YARD2_PER_M2 = 1.19599;

export function getFabricCostPerYd2(
  inventory: ProductionInventory,
  rollWidthMeters: number,
) {
  return (
    inventory.fabrics.find(
      (fabric) =>
        fabric.kind === 'roll' &&
        fabric.status === 'available' &&
        fabric.widthMeters === rollWidthMeters,
    )?.costPerYd2 ?? 0
  );
}

export function applyFabricCostToResult(
  result: CalculationResult,
  costPerYd2: number,
): CalculationResult {
  return {
    ...result,
    fabricCostPerYd2: costPerYd2,
    fabricDownloadedCost: result.fabricDownloadedYd2 * costPerYd2,
    fabricUsefulCost: result.fabricUsefulYd2 * costPerYd2,
    fabricWasteCost: result.wasteYd2 * costPerYd2,
    fabricSavingsCost: 0,
  };
}

export function applyRollOverrideToResult(
  result: CalculationResult,
  selectedRollWidth: number | null,
): CalculationResult {
  if (
    selectedRollWidth === null ||
    selectedRollWidth === result.recommendedRollWidthMeters ||
    selectedRollWidth < result.occupiedRollWidthMeters
  ) {
    return result;
  }

  const fabricDownloadedM2 = selectedRollWidth * result.cutLengthMeters;
  const fabricUsefulM2 = result.occupiedRollWidthMeters * result.cutLengthMeters;
  const wasteM2 = fabricDownloadedM2 - fabricUsefulM2;
  const wasteWidthMeters = selectedRollWidth - result.occupiedRollWidthMeters;

  return {
    ...result,
    recommendedRollWidthMeters: selectedRollWidth,
    wasteWidthMeters,
    wastePieceWidthMeters: wasteWidthMeters,
    wastePieceHeightMeters: result.cutLengthMeters,
    fabricDownloadedM2,
    fabricUsefulM2,
    wasteM2,
    fabricDownloadedYd2: fabricDownloadedM2 * YARD2_PER_M2,
    fabricUsefulYd2: fabricUsefulM2 * YARD2_PER_M2,
    wasteYd2: wasteM2 * YARD2_PER_M2,
    wastePercentage: fabricDownloadedM2 === 0 ? 0 : (wasteM2 / fabricDownloadedM2) * 100,
    fabricDownloadedCost: fabricDownloadedM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricUsefulCost: fabricUsefulM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricWasteCost: wasteM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricSavingsCost: 0,
  };
}
