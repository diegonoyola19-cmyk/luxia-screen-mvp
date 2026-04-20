import type {
  CalculationFormValues,
  CurtainType,
  ScreenRuleConfig,
  ScreenRuleConfigFormValues,
} from './types';

export const CURTAIN_OPTIONS: Array<{ value: CurtainType; label: string }> = [
  { value: 'screen', label: 'Roller' },
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
  projectDraft: 'luxia-screen-project-draft',
  savedOrders: 'luxia-screen-saved-orders',
  productionInventory: 'luxia-screen-production-inventory',
  inventoryMovements: 'luxia-screen-inventory-movements',
} as const;
