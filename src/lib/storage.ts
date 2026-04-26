import {
  DEFAULT_FORM_VALUES,
  DEFAULT_SCREEN_RULE_CONFIG,
  DEFAULT_MULTI_PRODUCT_CONFIG,
  STORAGE_KEYS,
} from '../domain/curtains/constants';
import type {
  CalculationFormValues,
  InventoryMovement,
  OrderDraft,
  ProductionInventory,
  SavedOrder,
  SavedCalculation,
  ScreenFixedComponent,
  ScreenRuleConfig,
  SelectedFabric,
  WastePiece,
  MultiProductConfig,
} from '../domain/curtains/types';

function isBrowserAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadHistory(): SavedCalculation[] {
  if (!isBrowserAvailable()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.history);

  if (!rawValue) {
    return [];
  }

  try {
    return (JSON.parse(rawValue) as SavedCalculation[]).map(normalizeOrderItemFixedComponents);
  } catch {
    return [];
  }
}

export function saveHistory(history: SavedCalculation[]) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

export function loadFormDraft(): CalculationFormValues {
  if (!isBrowserAvailable()) {
    return DEFAULT_FORM_VALUES;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.formDraft);

  if (!rawValue) {
    return DEFAULT_FORM_VALUES;
  }

  try {
    return {
      ...DEFAULT_FORM_VALUES,
      ...(JSON.parse(rawValue) as Partial<CalculationFormValues>),
    };
  } catch {
    return DEFAULT_FORM_VALUES;
  }
}

export function saveFormDraft(values: CalculationFormValues) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.formDraft, JSON.stringify(values));
}

export function loadScreenRuleConfig(): ScreenRuleConfig {
  if (!isBrowserAvailable()) {
    return DEFAULT_SCREEN_RULE_CONFIG;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.screenRuleConfig);

  if (!rawValue) {
    return DEFAULT_SCREEN_RULE_CONFIG;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<ScreenRuleConfig> & {
      fixedComponents?: Array<string | ScreenFixedComponent>;
    };

    const normalizedFixedComponents =
      parsedValue.fixedComponents?.map((component) =>
        typeof component === 'string'
          ? normalizeLegacyComponent(component)
          : {
              ...component,
              unit: typeof component.unit === 'string' ? component.unit : 'u',
              cost: typeof component.cost === 'number' ? component.cost : 0,
            },
      ) ?? DEFAULT_SCREEN_RULE_CONFIG.fixedComponents;

    return {
      ...DEFAULT_SCREEN_RULE_CONFIG,
      ...parsedValue,
      fixedComponents: normalizedFixedComponents,
    };
  } catch {
    return DEFAULT_SCREEN_RULE_CONFIG;
  }
}

export function saveMultiProductConfig(config: MultiProductConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.multiProductConfig, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save multi product config:', error);
  }
}

export function loadMultiProductConfig(): MultiProductConfig {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.multiProductConfig);
    if (!data) return DEFAULT_MULTI_PRODUCT_CONFIG;
    
    // Merge con los defaults por si hay nuevos campos o tipos de cortinas
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_MULTI_PRODUCT_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_MULTI_PRODUCT_CONFIG;
  }
}

export function saveScreenRuleConfig(config: ScreenRuleConfig) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.screenRuleConfig,
    JSON.stringify(config),
  );
}

export function loadProjectDraft(): OrderDraft {
  if (!isBrowserAvailable()) {
    return { orderNumber: '', items: [] };
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.projectDraft);

  if (!rawValue) {
    return { orderNumber: '', items: [] };
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<OrderDraft> & {
      name?: string;
    };

    return {
      orderNumber:
        typeof parsedValue.orderNumber === 'string' ? parsedValue.orderNumber : '',
      items: Array.isArray(parsedValue.items)
        ? parsedValue.items.map(normalizeOrderItemFixedComponents)
        : [],
    };
  } catch {
    return { orderNumber: '', items: [] };
  }
}

export function saveProjectDraft(project: OrderDraft) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.projectDraft, JSON.stringify(project));
}

export function loadSavedOrders(): SavedOrder[] {
  if (!isBrowserAvailable()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.savedOrders);

  if (!rawValue) {
    return [];
  }

  try {
    return (JSON.parse(rawValue) as SavedOrder[]).map((order) => ({
      ...order,
      items: Array.isArray(order.items)
        ? order.items.map(normalizeOrderItemFixedComponents)
        : [],
    }));
  } catch {
    return [];
  }
}

export function saveSavedOrders(orders: SavedOrder[]) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.savedOrders, JSON.stringify(orders));
}

export function loadProductionInventory(): ProductionInventory | null {
  if (!isBrowserAvailable()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.productionInventory);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ProductionInventory;

    return {
      ...parsedValue,
      fabrics: Array.isArray(parsedValue.fabrics)
        ? parsedValue.fabrics.map((fabric) => ({
            ...fabric,
            family: typeof fabric.family === 'string' ? fabric.family : undefined,
            imageUrl: typeof fabric.imageUrl === 'string' ? fabric.imageUrl : null,
            costPerYd2: typeof fabric.costPerYd2 === 'number' ? fabric.costPerYd2 : 0,
          }))
        : [],
      tubes: Array.isArray(parsedValue.tubes) ? parsedValue.tubes : [],
      bottoms: Array.isArray(parsedValue.bottoms) ? parsedValue.bottoms : [],
      components: Array.isArray(parsedValue.components) ? parsedValue.components : [],
    };
  } catch {
    return null;
  }
}

export function saveProductionInventory(inventory: ProductionInventory) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.productionInventory,
    JSON.stringify(inventory),
  );
}

export function loadInventoryMovements(): InventoryMovement[] {
  if (!isBrowserAvailable()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.inventoryMovements);

  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as InventoryMovement[];
  } catch {
    return [];
  }
}

export function saveInventoryMovements(movements: InventoryMovement[]) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.inventoryMovements,
    JSON.stringify(movements),
  );
}

function normalizeLegacyComponent(value: string): ScreenFixedComponent {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);

  if (!match) {
    return {
      quantity: 1,
      name: trimmedValue,
      unit: 'u',
      cost: 0,
    };
  }

  return {
    quantity: Number(match[1]),
    name: match[2],
    unit: 'u',
    cost: 0,
  };
}

function normalizeOrderItemFixedComponents<T extends { result: { fixedComponents: Array<string | ScreenFixedComponent> } }>(
  item: T,
): T {
  const normalizedSelectedFabric = normalizeSelectedFabric(
    (item as T & { result: { selectedFabric?: SelectedFabric | null } }).result.selectedFabric,
  );
  const normalizedWastePiece = normalizeWastePiece(
    (item as T & { reusedWastePiece?: WastePiece | null }).reusedWastePiece,
  );

  return {
    ...item,
    ...(normalizedWastePiece !== undefined ? { reusedWastePiece: normalizedWastePiece } : {}),
    result: {
      ...item.result,
      ...(normalizedSelectedFabric !== undefined
        ? { selectedFabric: normalizedSelectedFabric }
        : {}),
      fixedComponents: Array.isArray(item.result.fixedComponents)
        ? item.result.fixedComponents.map((component) =>
            typeof component === 'string'
              ? normalizeLegacyComponent(component)
              : {
                  ...component,
                  unit: typeof component.unit === 'string' ? component.unit : 'u',
                  cost: typeof component.cost === 'number' ? component.cost : 0,
                },
          )
        : [],
    },
  };
}

function normalizeSelectedFabric(value?: SelectedFabric | null) {
  if (!value) {
    return value;
  }

  return {
    ...value,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    costPerYd2: typeof value.costPerYd2 === 'number' ? value.costPerYd2 : 0,
  };
}

function normalizeWastePiece(value?: WastePiece | null) {
  if (!value) {
    return value;
  }

  return {
    ...value,
    fabricFamily:
      typeof value.fabricFamily === 'string' ? value.fabricFamily : undefined,
    fabricOpenness:
      typeof value.fabricOpenness === 'string' ? value.fabricOpenness : undefined,
    fabricColor:
      typeof value.fabricColor === 'string' ? value.fabricColor : undefined,
    fabricItemCode:
      typeof value.fabricItemCode === 'string' ? value.fabricItemCode : undefined,
  };
}
