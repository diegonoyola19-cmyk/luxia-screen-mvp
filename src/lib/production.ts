import type { ProjectCurtainItem, SavedOrder } from '../domain/curtains/types';

export const STOCK_BAR_FEET = 19;

export interface LinearMaterialSummary {
  totalUsedFeet: number;
  stockLengthFeet: number;
  barsNeeded: number;
  totalPurchasedFeet: number;
  wasteFeet: number;
  wastePercentage: number;
}

export interface FixedComponentSummary {
  name: string;
  quantity: number;
  unit: string;
  totalCost: number;
}

export interface ProductionSummary {
  curtains: number;
  reusedWasteCurtains: number;
  curtainAreaM2: number;
  fabricDownloadedM2: number;
  fabricDownloadedYd2: number;
  fabricWasteM2: number;
  fabricWasteYd2: number;
  fabricWastePercentage: number;
  fabricDownloadedCost: number;
  fabricWasteCost: number;
  fabricSavingsCost: number;
  fixedComponentsCost: number;
  totalOrderCost: number;
  chainFeet: number;
  tube: LinearMaterialSummary;
  bottom: LinearMaterialSummary;
  fixedComponents: FixedComponentSummary[];
}

function optimizeLinearCuts(cutsFeet: number[], stockLengthFeet: number): LinearMaterialSummary {
  const sortedCuts = [...cutsFeet]
    .filter((cut) => cut > 0)
    .sort((left, right) => right - left);
  const bars: number[] = [];

  sortedCuts.forEach((cut) => {
    const barIndex = bars.findIndex((remaining) => remaining >= cut);

    if (barIndex === -1) {
      bars.push(stockLengthFeet - cut);
      return;
    }

    bars[barIndex] -= cut;
  });

  const totalUsedFeet = sortedCuts.reduce((sum, cut) => sum + cut, 0);
  const barsNeeded = bars.length;
  const totalPurchasedFeet = barsNeeded * stockLengthFeet;

  return {
    totalUsedFeet,
    stockLengthFeet,
    barsNeeded,
    totalPurchasedFeet,
    wasteFeet: totalPurchasedFeet - totalUsedFeet,
    wastePercentage:
      totalPurchasedFeet === 0 ? 0 : ((totalPurchasedFeet - totalUsedFeet) / totalPurchasedFeet) * 100,
  };
}

function summarizeFixedComponents(items?: ProjectCurtainItem[]): FixedComponentSummary[] {
  const safeItems = Array.isArray(items) ? items : [];
  const totals = new Map<string, FixedComponentSummary>();

  safeItems.forEach((item) => {
    const fixedComponents = Array.isArray(item?.result?.fixedComponents)
      ? item.result.fixedComponents
      : [];

    fixedComponents.forEach((component) => {
      if (!component?.name || !component?.unit) return;
      const key = `${component.name.toLowerCase()}::${component.unit.toLowerCase()}`;
      const existing = totals.get(key);

      if (existing) {
        existing.quantity += (component.quantity ?? 0);
        existing.totalCost += (component.quantity ?? 0) * (component.cost ?? 0);
        return;
      }

      totals.set(key, {
        name: component.name,
        quantity: component.quantity ?? 0,
        unit: component.unit,
        totalCost: (component.quantity ?? 0) * (component.cost ?? 0),
      });
    });
  });

  return [...totals.values()].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function summarizeProduction(items?: ProjectCurtainItem[]): ProductionSummary {
  const safeItems = Array.isArray(items) ? items : [];

  const curtainAreaM2 = safeItems.reduce(
    (sum, item) => sum + ((item?.input?.widthMeters ?? 0) * (item?.input?.heightMeters ?? 0)),
    0,
  );
  const fabricDownloadedM2 = safeItems.reduce(
    (sum, item) => sum + (item?.result?.fabricDownloadedM2 ?? 0),
    0,
  );
  const fabricDownloadedYd2 = safeItems.reduce(
    (sum, item) => sum + (item?.result?.fabricDownloadedYd2 ?? 0),
    0,
  );
  const fabricWasteM2 = safeItems.reduce((sum, item) => sum + (item?.result?.wasteM2 ?? 0), 0);
  const fabricWasteYd2 = safeItems.reduce((sum, item) => sum + (item?.result?.wasteYd2 ?? 0), 0);
  const fabricDownloadedCost = safeItems.reduce(
    (sum, item) => sum + (item?.result?.fabricDownloadedCost ?? 0),
    0,
  );
  const fabricWasteCost = safeItems.reduce((sum, item) => sum + (item?.result?.fabricWasteCost ?? 0), 0);
  const fabricSavingsCost = safeItems.reduce(
    (sum, item) => sum + (item?.result?.fabricSavingsCost ?? 0),
    0,
  );
  const fixedComponentsCost = safeItems.reduce(
    (sum, item) => {
      const fixed = Array.isArray(item?.result?.fixedComponents)
        ? item.result.fixedComponents
        : [];
      return (
        sum +
        fixed.reduce(
          (componentSum, component) =>
            componentSum + (component?.quantity ?? 0) * (component?.cost ?? 0),
          0,
        )
      );
    },
    0,
  );
  const chainFeet = safeItems.reduce((sum, item) => sum + (item?.result?.chainFeet ?? 0), 0);

  return {
    curtains: safeItems.length,
    reusedWasteCurtains: safeItems.filter((item) => Boolean(item?.reusedWastePiece)).length,
    curtainAreaM2,
    fabricDownloadedM2,
    fabricDownloadedYd2,
    fabricWasteM2,
    fabricWasteYd2,
    fabricWastePercentage:
      fabricDownloadedM2 === 0 ? 0 : (fabricWasteM2 / fabricDownloadedM2) * 100,
    fabricDownloadedCost,
    fabricWasteCost,
    fabricSavingsCost,
    fixedComponentsCost,
    totalOrderCost: fabricDownloadedCost + fixedComponentsCost,
    chainFeet,
    tube: optimizeLinearCuts(
      safeItems.map((item) => item?.result?.tubeFeet ?? 0),
      STOCK_BAR_FEET,
    ),
    bottom: optimizeLinearCuts(
      safeItems.map((item) => item?.result?.bottomRailFeet ?? 0),
      STOCK_BAR_FEET,
    ),
    fixedComponents: summarizeFixedComponents(safeItems),
  };
}

export function summarizeOrdersProduction(orders: SavedOrder[]): ProductionSummary {
  return summarizeProduction((orders || []).flatMap((order) => order?.items || []));
}
