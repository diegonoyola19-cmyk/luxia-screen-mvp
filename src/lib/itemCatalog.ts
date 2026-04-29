import catalog from '../data/luxia-item-catalog.json';
import { COMPONENT_CATEGORY_OPTIONS, TONE_GROUP_OPTIONS } from '../domain/curtains/constants';
import type {
  CatalogItem,
  CatalogItemOverride,
  ComponentCategory,
  ToneGroup,
} from '../domain/curtains/types';

interface ImportedItemCatalog {
  generatedAt: string;
  sourceFile: string;
  totalItems: number;
  items: CatalogItem[];
}

const importedCatalog = catalog as ImportedItemCatalog;

export const componentCategoryOptions = COMPONENT_CATEGORY_OPTIONS;
export const toneGroupOptions = TONE_GROUP_OPTIONS;

export function getBaseCatalogItems(): CatalogItem[] {
  return importedCatalog.items;
}

export function applyCatalogOverrides(
  items: CatalogItem[],
  overrides: Record<string, CatalogItemOverride>,
): CatalogItem[] {
  return items.map((item) => {
    const override = overrides[item.itemCode];

    if (!override) {
      return item;
    }

    return {
      ...item,
      category: override.category ?? item.category,
      color: override.color === undefined ? item.color : override.color,
      sageItemCode: override.sageItemCode ?? item.sageItemCode,
    };
  });
}

export function searchCatalogItems(
  items: CatalogItem[],
  query: string,
  category: ComponentCategory | 'all' = 'all',
  limit = 80,
): CatalogItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items
    .filter((item) => {
      if (category !== 'all' && item.category !== category) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        item.itemCode,
        item.sageItemCode,
        item.description,
        item.unit,
        item.category,
        item.color ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .slice(0, limit);
}

export function getItemsByCategory(
  items: CatalogItem[],
  category: ComponentCategory,
): CatalogItem[] {
  return items
    .filter((item) => item.category === category)
    .sort(compareCatalogItems);
}

export function compareCatalogItems(left: CatalogItem, right: CatalogItem) {
  const sageCodeComparison = left.sageItemCode.localeCompare(
    right.sageItemCode,
    'es',
    { numeric: true },
  );

  if (sageCodeComparison !== 0) {
    return sageCodeComparison;
  }

  return left.itemCode.localeCompare(right.itemCode, 'es', { numeric: true });
}

export function getRecipeItemOptions(
  items: CatalogItem[],
  category: ComponentCategory,
  _componentLabel: string,
): CatalogItem[] {
  if (category === 'fabric') {
    return getItemsByCategory(items, category);
  }

  return items
    .filter((item) => item.category !== 'fabric')
    .sort(compareCatalogItems);
}

export function getCatalogItemLabel(item: CatalogItem | undefined) {
  if (!item) {
    return 'Sin item asignado';
  }

  return `${item.sageItemCode} - ${item.description}`;
}

export function inferToneGroupFromColor(color: string): ToneGroup {
  const normalized = color.trim().toLowerCase();

  if (
    normalized.includes('grey') ||
    normalized.includes('gray') ||
    normalized.includes('smoke') ||
    normalized.includes('stone') ||
    normalized.includes('silver')
  ) {
    return 'grey';
  }

  if (
    normalized.includes('beige') ||
    normalized.includes('bisque') ||
    normalized.includes('sand') ||
    normalized.includes('taupe') ||
    normalized.includes('linen') ||
    normalized.includes('ivory') ||
    normalized.includes('tan') ||
    normalized.includes('custard') ||
    normalized.includes('fawn')
  ) {
    return 'ivory';
  }

  if (
    normalized.includes('bronze') ||
    normalized.includes('brown') ||
    normalized.includes('chocolate') ||
    normalized.includes('coffee') ||
    normalized.includes('ebony') ||
    normalized.includes('black') ||
    normalized.includes('gold')
  ) {
    return 'bronze';
  }

  return 'white';
}

export function getToneLabel(tone: ToneGroup) {
  return toneGroupOptions.find((option) => option.value === tone)?.label ?? tone;
}
