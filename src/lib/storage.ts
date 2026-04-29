import {
  DEFAULT_FORM_VALUES,
  DEFAULT_SCREEN_RULE_CONFIG,
} from '../domain/curtains/constants';
import type {
  CalculationFormValues,
  CatalogItemOverride,
  CurtainRecipe,
  FabricToneRule,
  InventoryMovement,
  OrderDraft,
  ProductionInventory,
  SavedOrder,
  SavedCalculation,
  ScreenRuleConfig,
} from '../domain/curtains/types';

export function loadHistory(): SavedCalculation[] { return []; }
export function saveHistory(_history: SavedCalculation[]) {}

export function loadFormDraft(): CalculationFormValues { return DEFAULT_FORM_VALUES; }
export function saveFormDraft(_values: CalculationFormValues) {}

export function loadScreenRuleConfig(): ScreenRuleConfig { return DEFAULT_SCREEN_RULE_CONFIG; }
export function saveScreenRuleConfig(_config: ScreenRuleConfig) {}

export function loadProjectDraft(): OrderDraft { return { orderNumber: '', items: [] }; }
export function saveProjectDraft(_project: OrderDraft) {}

export function loadSavedOrders(): SavedOrder[] { return []; }
export function saveSavedOrders(_orders: SavedOrder[]) {}

export function loadProductionInventory(): ProductionInventory | null { return null; }
export function saveProductionInventory(_inventory: ProductionInventory) {}

export function loadInventoryMovements(): InventoryMovement[] { return []; }
export function saveInventoryMovements(_movements: InventoryMovement[]) {}

export function loadItemCatalogOverrides(): Record<string, CatalogItemOverride> { return {}; }
export function saveItemCatalogOverrides(_overrides: Record<string, CatalogItemOverride>) {}

export function loadFabricToneRules(): FabricToneRule[] { return []; }
export function saveFabricToneRules(_rules: FabricToneRule[]) {}

export function loadScreenRecipe(): CurtainRecipe | null { return null; }
export function saveScreenRecipe(_recipe: CurtainRecipe) {}
