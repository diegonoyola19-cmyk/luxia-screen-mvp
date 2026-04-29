import type {
  CalculationInput,
  CalculationResult,
  CatalogItem,
  ComponentCategory,
  CurtainRecipe,
  FabricToneRule,
  RecipeComponentRule,
  ResolvedMaterialLine,
  ScreenFixedComponent,
  ToneGroup,
} from '../domain/curtains/types';
import { generateId } from '../domain/curtains/constants';
import { inferToneGroupFromColor } from './itemCatalog';

const DEFAULT_RECIPE_COMPONENTS: Array<{
  label: string;
  category: ComponentCategory;
  quantityMode: RecipeComponentRule['quantityMode'];
  fixedQuantity: number;
  condition: RecipeComponentRule['condition'];
}> = [
  { label: 'Tubo', category: 'tube', quantityMode: 'tubeFeet', fixedQuantity: 1, condition: 'always' },
  { label: 'Bottom', category: 'bottom', quantityMode: 'bottomFeet', fixedQuantity: 1, condition: 'always' },
  { label: 'Cadena', category: 'chain', quantityMode: 'chainFeet', fixedQuantity: 1, condition: 'manual_only' },
  { label: 'Soporte Lado de Control', category: 'bracket', quantityMode: 'fixed', fixedQuantity: 1, condition: 'always' },
  { label: 'Soporte Lado de End Plug', category: 'bracket', quantityMode: 'fixed', fixedQuantity: 1, condition: 'always' },
  { label: 'Control', category: 'control', quantityMode: 'fixed', fixedQuantity: 1, condition: 'manual_only' },
  { label: 'End Plug', category: 'endPlug', quantityMode: 'fixed', fixedQuantity: 1, condition: 'always' },
  { label: 'Chapita', category: 'other', quantityMode: 'fixed', fixedQuantity: 1, condition: 'manual_only' },
  { label: 'Pesa de Cadena', category: 'chainWeight', quantityMode: 'fixed', fixedQuantity: 1, condition: 'manual_only' },
  { label: 'Tapaderas de Bottom', category: 'bottomCap', quantityMode: 'fixed', fixedQuantity: 2, condition: 'always' },
  { label: 'Topes de Cadena', category: 'chainStop', quantityMode: 'fixed', fixedQuantity: 2, condition: 'manual_only' },
  { label: 'Motor', category: 'other', quantityMode: 'fixed', fixedQuantity: 1, condition: 'motorized_only' },
  { label: 'Control Remoto', category: 'control', quantityMode: 'fixed', fixedQuantity: 1, condition: 'motorized_only' },
  { label: 'Adaptador de Motor', category: 'other', quantityMode: 'fixed', fixedQuantity: 1, condition: 'motorized_only' },
  { label: 'Adaptador Tubo Grande', category: 'other', quantityMode: 'fixed', fixedQuantity: 1, condition: 'large_tube_only' },
];

export interface RecipeResolution {
  toneGroup: ToneGroup;
  materialLines: ResolvedMaterialLine[];
  warnings: string[];
}

export function createDefaultScreenRecipe(items: CatalogItem[]): CurtainRecipe {
  return {
    id: 'screen-default',
    curtainType: 'screen',
    name: 'Screen / Roller estandar',
    components: DEFAULT_RECIPE_COMPONENTS.map((component) => ({
      id: generateId(),
      ...component,
      itemByTone: buildDefaultItemsByTone(items, component.category),
    })),
  };
}

export function normalizeRecipeToneGroups(recipe: CurtainRecipe): CurtainRecipe {
  const normalized = splitLegacyBracketRule(recipe.components).map((component) => {
    // Backfill condition from the DEFAULT template if it's missing (old saved recipes)
    const defaultMatch = DEFAULT_RECIPE_COMPONENTS.find(
      (d) => d.label.toLowerCase() === component.label.trim().toLowerCase(),
    );
    return {
      ...component,
      condition: component.condition ?? defaultMatch?.condition ?? ('always' as const),
      label: normalizeRecipeLabel(component.label),
      itemByTone: normalizeItemByTone(component.itemByTone),
    };
  });

  // Inject new components from DEFAULT that don't exist yet (e.g. Motor, Adaptadores)
  const existingLabels = new Set(normalized.map((c) => c.label.toLowerCase()));
  const injected = DEFAULT_RECIPE_COMPONENTS.filter(
    (d) => !existingLabels.has(d.label.toLowerCase()),
  ).map((d) => ({
    id: generateId(),
    ...d,
    itemByTone: {} as Partial<Record<ToneGroup, string>>,
  }));

  return {
    ...recipe,
    components: [...normalized, ...injected],
  };
}


function getLegacyToneItem(
  itemByTone: Partial<Record<ToneGroup, string>>,
  legacyTone: string,
) {
  return (itemByTone as Record<string, string | undefined>)[legacyTone];
}

function normalizeItemByTone(itemByTone: Partial<Record<ToneGroup, string>>) {
  return {
    white: itemByTone.white ?? getLegacyToneItem(itemByTone, 'claro'),
    grey: itemByTone.grey ?? getLegacyToneItem(itemByTone, 'gris'),
    ivory: itemByTone.ivory ?? getLegacyToneItem(itemByTone, 'calido'),
    bronze: itemByTone.bronze ?? getLegacyToneItem(itemByTone, 'oscuro'),
  };
}

function splitLegacyBracketRule(components: RecipeComponentRule[]) {
  return components.flatMap((component) => {
    if (component.category !== 'bracket' || component.fixedQuantity !== 2) {
      return [component];
    }

    return [
      {
        ...component,
        id: `${component.id}-control-side`,
        label: 'Soporte Lado de Control',
        fixedQuantity: 1,
      },
      {
        ...component,
        id: `${component.id}-end-plug-side`,
        label: 'Soporte Lado de End Plug',
        fixedQuantity: 1,
      },
    ];
  });
}

function normalizeRecipeLabel(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === 'end plug') {
    return 'End Plug';
  }

  if (normalized === 'pesa de cadena') {
    return 'Pesa de Cadena';
  }

  if (normalized === 'tapaderas de bottom') {
    return 'Tapaderas de Bottom';
  }

  if (normalized === 'topes de cadena') {
    return 'Topes de Cadena';
  }

  return label;
}

export function getFabricToneGroup(
  input: Pick<CalculationInput, 'fabricFamily' | 'fabricOpenness' | 'fabricColor'>,
  rules: FabricToneRule[],
): ToneGroup {
  const match = rules.find(
    (rule) =>
      rule.family === input.fabricFamily &&
      rule.openness === input.fabricOpenness &&
      rule.color === input.fabricColor,
  );

  return match?.toneGroup ?? inferToneGroupFromColor(input.fabricColor);
}

export function resolveScreenRecipeMaterials(
  input: CalculationInput,
  result: CalculationResult,
  recipe: CurtainRecipe,
  toneRules: FabricToneRule[],
  catalogItems: CatalogItem[],
): RecipeResolution {
  const toneGroup = getFabricToneGroup(input, toneRules);
  const warnings: string[] = [];
  const materialLines: ResolvedMaterialLine[] = [];

  if (result.selectedFabric) {
    materialLines.push({
      id: `fabric-${result.selectedFabric.itemCode}`,
      itemCode: result.selectedFabric.itemCode,
      sageItemCode: result.selectedFabric.itemCode,
      description: result.selectedFabric.description,
      category: 'fabric',
      toneGroup,
      quantity: result.fabricDownloadedYd2,
      unit: 'SQYD',
      unitCost: result.fabricCostPerYd2,
      totalCost: result.fabricDownloadedCost,
      source: 'Tela seleccionada',
    });
  }

  recipe.components.forEach((component) => {
    const itemCode = component.itemByTone[toneGroup];

    if (!itemCode) {
      warnings.push(`Falta item para ${component.label} en tono ${toneGroup}.`);
      return;
    }

    const item = catalogItems.find((candidate) => candidate.itemCode === itemCode);

    if (!item) {
      warnings.push(`El item ${itemCode} configurado para ${component.label} no existe en catalogo.`);
      return;
    }

    const quantity = getQuantityForRule(component, result);
    materialLines.push({
      id: `${component.id}-${toneGroup}`,
      itemCode: item.itemCode,
      sageItemCode: item.sageItemCode,
      description: item.description,
      category: component.category,
      toneGroup,
      quantity,
      unit: item.unit,
      unitCost: item.avgCost,
      totalCost: quantity * item.avgCost,
      source: component.label,
    });
  });

  return { toneGroup, materialLines, warnings };
}

export function materialLinesToFixedComponents(
  lines: ResolvedMaterialLine[],
  fallback: ScreenFixedComponent[],
): ScreenFixedComponent[] {
  const componentLines = lines.filter((line) => line.category !== 'fabric');

  if (componentLines.length === 0) {
    return fallback;
  }

  return componentLines.map((line) => ({
    quantity: line.quantity,
    name: line.description,
    unit: line.unit,
    cost: line.unitCost,
  }));
}

function getQuantityForRule(
  component: RecipeComponentRule,
  result: CalculationResult,
) {
  switch (component.quantityMode) {
    case 'tubeFeet':
      return result.tubeDownloadedFeet ?? result.tubeFeet;
    case 'bottomFeet':
      return result.bottomRailDownloadedFeet ?? result.bottomRailFeet;
    case 'chainFeet':
      return result.chainFeet;
    default:
      return component.fixedQuantity;
  }
}

function buildDefaultItemsByTone(
  items: CatalogItem[],
  category: ComponentCategory,
): Partial<Record<ToneGroup, string>> {
  return {
    white: findDefaultItem(items, category, ['white', 'clear'])?.itemCode,
    bronze: findDefaultItem(items, category, ['bronze', 'brown', 'black'])?.itemCode,
    ivory: findDefaultItem(items, category, ['ivory', 'beige', 'bisque', 'fawn'])?.itemCode,
    grey: findDefaultItem(items, category, ['grey', 'gray', 'aluminum', 'zinc'])?.itemCode,
  };
}

function findDefaultItem(
  items: CatalogItem[],
  category: ComponentCategory,
  colorHints: string[],
) {
  const candidates = items.filter((item) => item.category === category);
  const byColor = candidates.find((item) => {
    const normalized = `${item.description} ${item.color ?? ''}`.toLowerCase();
    return colorHints.some((hint) => normalized.includes(hint));
  });

  return byColor ?? candidates[0];
}
