import type {
  CalculationFormValues,
  ComponentCategory,
  CurtainType,
  ToneGroup,
  ScreenRuleConfig,
  ScreenRuleConfigFormValues,
} from './types';

export const FEET_PER_METER = 3.28084;
export const YARD2_PER_M2 = 1.2;

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

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
  driveType: 'manual',
};

export const SCREEN_FIXED_COMPONENTS = [
  { quantity: 1, name: 'Soporte Lado de Control', unit: 'u', cost: 0 },
  { quantity: 1, name: 'Soporte Lado de End Plug', unit: 'u', cost: 0 },
  { quantity: 1, name: 'Control', unit: 'u', cost: 0 },
  { quantity: 1, name: 'End Plug', unit: 'u', cost: 0 },
  { quantity: 1, name: 'Chapita', unit: 'u', cost: 0 },
  { quantity: 1, name: 'Pesa de Cadena', unit: 'u', cost: 0 },
  { quantity: 2, name: 'Tapaderas de Bottom', unit: 'u', cost: 0 },
  { quantity: 2, name: 'Topes de Cadena', unit: 'u', cost: 0 },
];

export const TONE_GROUP_OPTIONS: Array<{ value: ToneGroup; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'bronze', label: 'Bronze / Café' },
  { value: 'ivory', label: 'Ivory / Beige' },
  { value: 'grey', label: 'Grey / Gris' },
];

export const COMPONENT_CATEGORY_OPTIONS: Array<{ value: ComponentCategory; label: string }> = [
  { value: 'fabric', label: 'Tela' },
  { value: 'tube', label: 'Tubo' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'chain', label: 'Cadena' },
  { value: 'control', label: 'Control' },
  { value: 'bracket', label: 'Soporte' },
  { value: 'endPlug', label: 'End plug' },
  { value: 'bottomCap', label: 'Tapadera bottom' },
  { value: 'chainStop', label: 'Tope cadena' },
  { value: 'chainWeight', label: 'Pesa cadena' },
  { value: 'other', label: 'Otro' },
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
  itemCatalogOverrides: 'luxia-screen-item-catalog-overrides',
  fabricToneRules: 'luxia-screen-fabric-tone-rules',
  screenRecipe: 'luxia-screen-recipe',
} as const;
