import type {
  CalculationFormValues,
  CurtainType,
  ScreenRuleConfig,
  ScreenRuleConfigFormValues,
  MultiProductConfig,
  MultiProductConfigFormValues,
  BaseRuleConfig,
  BaseRuleConfigFormValues,
} from './types';

export const FEET_PER_METER = 3.28084;
export const YARD2_PER_M2 = 1.19599;

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

export const CURTAIN_OPTIONS: Array<{ value: CurtainType; label: string }> = [
  { value: 'screen', label: 'Screen (Legacy)' },
  { value: 'rollux', label: 'Rollux' },
  { value: 'neolux', label: 'Neolux' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'madera', label: 'Madera' },
];

export const DEFAULT_FORM_VALUES: CalculationFormValues = {
  curtainType: 'screen',
  fabricFamily: '',
  fabricOpenness: '',
  fabricColor: '',
  widthMeters: '',
  heightMeters: '',
};

export const SCREEN_FIXED_COMPONENTS = [
  { quantity: 2, name: 'soportes', unit: 'u', cost: 0 },
  { quantity: 1, name: 'control', unit: 'u', cost: 0 },
  { quantity: 1, name: 'end plug', unit: 'u', cost: 0 },
  { quantity: 1, name: 'chapita', unit: 'u', cost: 0 },
  { quantity: 1, name: 'pesa de cadena', unit: 'u', cost: 0 },
  { quantity: 2, name: 'tapaderas de bottom', unit: 'u', cost: 0 },
  { quantity: 2, name: 'topes de cadena', unit: 'u', cost: 0 },
];

export const DEFAULT_SCREEN_RULE_CONFIG: ScreenRuleConfig = {
  cutHeightExtraMeters: 0.3,
  maxWidthMeters: 3,
  chainMultiplier: 2,
  smallRollMeters: 2.5,
  largeRollMeters: 3,
  fixedComponents: SCREEN_FIXED_COMPONENTS,
};

export const DEFAULT_WASTE_REUSE_MARGIN_METERS = 0.3;

export const DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES: ScreenRuleConfigFormValues = {
  cutHeightExtraMeters: '0.30',
  maxWidthMeters: '3.00',
  chainMultiplier: '2',
  smallRollMeters: '2.50',
  largeRollMeters: '3.00',
  fixedComponents: SCREEN_FIXED_COMPONENTS.map((component) => ({
    quantity: String(component.quantity),
    name: component.name,
    unit: component.unit,
    cost: component.cost.toFixed(2),
  })),
};

export const STORAGE_KEYS = {
  history: 'luxia-screen-history',
  formDraft: 'luxia-screen-form-draft',
  screenRuleConfig: 'luxia-screen-rule-config',
  multiProductConfig: 'luxia-multi-product-config',
  projectDraft: 'luxia-screen-project-draft',
  savedOrders: 'luxia-screen-saved-orders',
  productionInventory: 'luxia-screen-production-inventory',
  inventoryMovements: 'luxia-screen-inventory-movements',
} as const;

const DEFAULT_BASE_RULE_CONFIG: BaseRuleConfig = {
  cutHeightExtraMeters: 0.3,
  maxWidthMeters: 3,
  chainMultiplier: 2,
  smallRollMeters: 2.5,
  largeRollMeters: 3,
  ruleComponents: {
    tube: null,
    bottom: null,
    chain: null,
  },
  fixedComponents: [],
};

const DEFAULT_BASE_RULE_CONFIG_FORM_VALUES: BaseRuleConfigFormValues = {
  cutHeightExtraMeters: '0.30',
  maxWidthMeters: '3.00',
  chainMultiplier: '2',
  smallRollMeters: '2.50',
  largeRollMeters: '3.00',
  ruleComponents: {
    tube: null,
    bottom: null,
    chain: null,
  },
  fixedComponents: [],
};

export const DEFAULT_MULTI_PRODUCT_CONFIG: MultiProductConfig = {
  screen: DEFAULT_BASE_RULE_CONFIG, // Legacy
  rollux: DEFAULT_BASE_RULE_CONFIG,
  neolux: DEFAULT_BASE_RULE_CONFIG,
  vertical: DEFAULT_BASE_RULE_CONFIG,
  madera: DEFAULT_BASE_RULE_CONFIG,
};

export const DEFAULT_MULTI_PRODUCT_CONFIG_FORM_VALUES: MultiProductConfigFormValues = {
  screen: DEFAULT_BASE_RULE_CONFIG_FORM_VALUES,
  rollux: DEFAULT_BASE_RULE_CONFIG_FORM_VALUES,
  neolux: DEFAULT_BASE_RULE_CONFIG_FORM_VALUES,
  vertical: DEFAULT_BASE_RULE_CONFIG_FORM_VALUES,
  madera: DEFAULT_BASE_RULE_CONFIG_FORM_VALUES,
};
