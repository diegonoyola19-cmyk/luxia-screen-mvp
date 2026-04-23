import catalog from '../data/luxia-roller-catalog.json';

interface ImportedCatalogItem {
  family: string;
  openness: string;
  color: string;
  itemCode: string;
  description: string;
  imageUrl: string | null;
  widthMeters: number;
  costPerYd2: number;
}

interface ImportedCatalog {
  generatedAt: string;
  sourceFile: string;
  totalItems: number;
  items: ImportedCatalogItem[];
}

export interface FabricSelectionSnapshot {
  family: string;
  openness: string;
  color: string;
  itemCode: string;
  description: string;
  imageUrl: string | null;
  widthMeters: number;
  costPerYd2: number;
}

export interface RollerFabricColorOption {
  family: string;
  openness: string;
  color: string;
  imageUrl: string | null;
  sampleItemCode: string;
  widthsMeters: number[];
}

export interface ScreenRollCostSuggestion {
  widthMeters: number;
  suggestedCostPerYd2: number;
  sourceItems: number;
  sampleDescription: string | null;
}

const importedCatalog = catalog as ImportedCatalog;
const FAMILY_ORDER = ['Screen', 'Premium', 'Pinpointe'];
const parsedRollerCatalog = importedCatalog.items;

export function getRollerFabricFamilies() {
  return [...new Set(parsedRollerCatalog.map((item) => item.family))].sort(byFamilyOrder);
}

export function getRollerFabricOpennessOptions(family: string) {
  return [...new Set(
    parsedRollerCatalog
      .filter((item) => item.family === family)
      .map((item) => item.openness),
  )].sort((left, right) => left.localeCompare(right, 'es'));
}

export function getRollerFabricColorOptions(
  family: string,
  openness: string,
): RollerFabricColorOption[] {
  const groups = new Map<
    string,
    {
      family: string;
      openness: string;
      color: string;
      imageUrl: string | null;
      sampleItemCode: string;
      widthsMeters: number[];
    }
  >();

  parsedRollerCatalog
    .filter((item) => item.family === family && item.openness === openness)
    .forEach((item) => {
      const existing = groups.get(item.color);

      if (existing) {
        if (!existing.imageUrl && item.imageUrl) {
          existing.imageUrl = item.imageUrl;
        }

        existing.widthsMeters.push(item.widthMeters);
        return;
      }

      groups.set(item.color, {
        family: item.family,
        openness: item.openness,
        color: item.color,
        imageUrl: item.imageUrl,
        sampleItemCode: item.itemCode,
        widthsMeters: [item.widthMeters],
      });
    });

  return [...groups.values()]
    .map((group) => ({
      family: group.family,
      openness: group.openness,
      color: group.color,
      imageUrl: group.imageUrl,
      sampleItemCode: group.sampleItemCode,
      widthsMeters: [...new Set(group.widthsMeters)].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.color.localeCompare(right.color, 'es'));
}

export function getRollerFabricVariants(
  family: string,
  openness: string,
  color: string,
) {
  return parsedRollerCatalog
    .filter(
      (item) =>
        item.family === family &&
        item.openness === openness &&
        item.color === color,
    )
    .sort((left, right) => left.widthMeters - right.widthMeters);
}

export function getAvailableWidths(family: string, openness: string, color: string): number[] {
  const variants = getRollerFabricVariants(family, openness, color);
  return [...new Set(variants.map((v) => v.widthMeters))].sort((a, b) => a - b);
}

export function getRollerFabricSelectionDefaults() {
  const family = getRollerFabricFamilies()[0] ?? '';
  const openness = family ? getRollerFabricOpennessOptions(family)[0] ?? '' : '';
  const color = family && openness
    ? getRollerFabricColorOptions(family, openness)[0]?.color ?? ''
    : '';

  return {
    fabricFamily: family,
    fabricOpenness: openness,
    fabricColor: color,
  };
}

export function resolveFabricSelection(
  family: string,
  openness: string,
  color: string,
  occupiedWidthMeters: number,
  preferredWidthMeters?: number | null,
): FabricSelectionSnapshot | null {
  const variants = getRollerFabricVariants(family, openness, color);

  if (variants.length === 0) {
    return null;
  }

  const minimumWidth = Math.max(occupiedWidthMeters, 0);
  const preferredWidth = preferredWidthMeters ?? minimumWidth;
  const eligibleVariants = variants.filter((item) => item.widthMeters >= minimumWidth);
  const candidates = eligibleVariants.length > 0 ? eligibleVariants : variants;

  return [...candidates].sort((left, right) => {
    const leftDiff = Math.abs(left.widthMeters - preferredWidth);
    const rightDiff = Math.abs(right.widthMeters - preferredWidth);

    if (leftDiff !== rightDiff) {
      return leftDiff - rightDiff;
    }

    return left.widthMeters - right.widthMeters;
  })[0] ?? null;
}

export function getSuggestedScreenRollCosts(): ScreenRollCostSuggestion[] {
  const groups = new Map<
    string,
    {
      widthMeters: number;
      prices: number[];
      sourceItems: number;
      sampleDescription: string | null;
    }
  >();

  parsedRollerCatalog
    .filter((item) => item.family === 'Screen')
    .forEach((item) => {
      const key = item.widthMeters.toFixed(2);
      const existing = groups.get(key);

      if (existing) {
        existing.prices.push(item.costPerYd2);
        existing.sourceItems += 1;
        return;
      }

      groups.set(key, {
        widthMeters: item.widthMeters,
        prices: [item.costPerYd2],
        sourceItems: 1,
        sampleDescription: item.description,
      });
    });

  return [...groups.values()]
    .map((group) => ({
      widthMeters: Number(group.widthMeters.toFixed(2)),
      suggestedCostPerYd2: Number(getMedian(group.prices).toFixed(2)),
      sourceItems: group.sourceItems,
      sampleDescription: group.sampleDescription,
    }))
    .sort((left, right) => left.widthMeters - right.widthMeters);
}

function getMedian(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function byFamilyOrder(left: string, right: string) {
  const leftIndex = FAMILY_ORDER.indexOf(left);
  const rightIndex = FAMILY_ORDER.indexOf(right);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }

  return left.localeCompare(right, 'es');
}
