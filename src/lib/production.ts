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

function summarizeFixedComponents(items: ProjectCurtainItem[]): FixedComponentSummary[] {
  const totals = new Map<string, FixedComponentSummary>();

  items.forEach((item) => {
    item.result.fixedComponents.forEach((component) => {
      const key = `${component.name.toLowerCase()}::${component.unit.toLowerCase()}`;
      const existing = totals.get(key);

      if (existing) {
        existing.quantity += component.quantity;
        existing.totalCost += component.quantity * component.cost;
        return;
      }

      totals.set(key, {
        name: component.name,
        quantity: component.quantity,
        unit: component.unit,
        totalCost: component.quantity * component.cost,
      });
    });
  });

  return [...totals.values()].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function summarizeProduction(items: ProjectCurtainItem[]): ProductionSummary {
  const curtainAreaM2 = items.reduce(
    (sum, item) => sum + item.input.widthMeters * item.input.heightMeters,
    0,
  );
  const fabricDownloadedM2 = items.reduce(
    (sum, item) => sum + item.result.fabricDownloadedM2,
    0,
  );
  const fabricDownloadedYd2 = items.reduce(
    (sum, item) => sum + item.result.fabricDownloadedYd2,
    0,
  );
  const fabricWasteM2 = items.reduce((sum, item) => sum + item.result.wasteM2, 0);
  const fabricWasteYd2 = items.reduce((sum, item) => sum + item.result.wasteYd2, 0);
  const fabricDownloadedCost = items.reduce(
    (sum, item) => sum + item.result.fabricDownloadedCost,
    0,
  );
  const fabricWasteCost = items.reduce((sum, item) => sum + item.result.fabricWasteCost, 0);
  const fabricSavingsCost = items.reduce(
    (sum, item) => sum + item.result.fabricSavingsCost,
    0,
  );
  const fixedComponentsCost = items.reduce(
    (sum, item) =>
      sum +
      item.result.fixedComponents.reduce(
        (componentSum, component) => componentSum + component.quantity * component.cost,
        0,
      ),
    0,
  );
  const chainFeet = items.reduce((sum, item) => sum + item.result.chainFeet, 0);

  return {
    curtains: items.length,
    reusedWasteCurtains: items.filter((item) => Boolean(item.reusedWastePiece)).length,
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
      items.map((item) => item.result.tubeFeet),
      STOCK_BAR_FEET,
    ),
    bottom: optimizeLinearCuts(
      items.map((item) => item.result.bottomRailFeet),
      STOCK_BAR_FEET,
    ),
    fixedComponents: summarizeFixedComponents(items),
  };
}

export function summarizeOrdersProduction(orders: SavedOrder[]): ProductionSummary {
  return summarizeProduction(orders.flatMap((order) => order.items));
}
