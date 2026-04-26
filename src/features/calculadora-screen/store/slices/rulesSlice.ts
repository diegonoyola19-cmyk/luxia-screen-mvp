import { StateCreator } from 'zustand';
import { CalculatorStore, RulesSlice } from '../types';
import { 
  DEFAULT_SCREEN_RULE_CONFIG, 
  DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES 
} from '../../../../domain/curtains/constants';
import { validateBaseRuleConfig } from '../../../../domain/curtains/screen';
import type { ScreenRuleConfig, ScreenRuleConfigFormValues } from '../../../../domain/curtains/types';
import { loadScreenRuleConfig } from '../../../../lib/storage';

function mapConfigToFormValues(config: ScreenRuleConfig): ScreenRuleConfigFormValues {
  return {
    cutHeightExtraMeters: config.cutHeightExtraMeters.toFixed(2),
    maxWidthMeters: config.maxWidthMeters.toFixed(2),
    chainMultiplier: String(config.chainMultiplier),
    smallRollMeters: config.smallRollMeters.toFixed(2),
    largeRollMeters: config.largeRollMeters.toFixed(2),
    fixedComponents: config.fixedComponents.map((component) => ({
      quantity: String(component.quantity),
      name: component.name,
      unit: component.unit,
      cost: component.cost.toFixed(2),
    })),
  };
}

function parseConfigFormValues(values: ScreenRuleConfigFormValues): Partial<ScreenRuleConfig> {
  const fixedComponents = values.fixedComponents
    .map((item) => ({
      quantity: Number(item.quantity),
      name: item.name.trim(),
      unit: item.unit.trim(),
      cost: Number(item.cost),
    }))
    .filter((item) => item.name !== '');

  return {
    cutHeightExtraMeters: values.cutHeightExtraMeters.trim() === '' ? undefined : Number(values.cutHeightExtraMeters),
    maxWidthMeters: values.maxWidthMeters.trim() === '' ? undefined : Number(values.maxWidthMeters),
    chainMultiplier: values.chainMultiplier.trim() === '' ? undefined : Number(values.chainMultiplier),
    smallRollMeters: values.smallRollMeters.trim() === '' ? undefined : Number(values.smallRollMeters),
    largeRollMeters: values.largeRollMeters.trim() === '' ? undefined : Number(values.largeRollMeters),
    fixedComponents,
  };
}

export const createRulesSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  RulesSlice
> = (set, get) => {
  const initialConfig = loadScreenRuleConfig();
  
  return {
    ruleConfig: initialConfig,
    ruleFormValues: mapConfigToFormValues(initialConfig),
    ruleErrors: {},

  setRuleConfig: (config) => set({ ruleConfig: config }),
  setRuleFormValues: (updater) => set((state) => ({ ruleFormValues: typeof updater === 'function' ? updater(state.ruleFormValues) : updater })),
  setRuleErrors: (errors) => set({ ruleErrors: errors }),

  handleRuleChange: (field, value) => {
    set((state) => ({
      ruleFormValues: { ...state.ruleFormValues, [field]: value },
      ruleErrors: { ...state.ruleErrors, [field]: undefined, general: undefined }
    }));
  },

  handleFixedComponentChange: (index, value) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.map((item, itemIndex) =>
          itemIndex === index ? { ...item, name: value } : item,
        ),
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  handleFixedComponentQuantityChange: (index, value) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity: value } : item,
        ),
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  handleFixedComponentUnitChange: (index, value) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.map((item, itemIndex) =>
          itemIndex === index ? { ...item, unit: value } : item,
        ),
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  handleFixedComponentCostChange: (index, value) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.map((item, itemIndex) =>
          itemIndex === index ? { ...item, cost: value } : item,
        ),
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  handleAddFixedComponent: () => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: [
          ...state.ruleFormValues.fixedComponents,
          { quantity: '1', name: '', unit: 'u', cost: '0.00' },
        ],
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  handleRemoveFixedComponent: (index) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.filter((_, itemIndex) => itemIndex !== index),
      },
      ruleErrors: { ...state.ruleErrors, fixedComponents: undefined, general: undefined }
    }));
  },

  saveRules: () => {
    const { ruleFormValues } = get();
    const parsedConfig = parseConfigFormValues(ruleFormValues);
    const validationErrors = validateBaseRuleConfig(parsedConfig);

    if (Object.keys(validationErrors).length > 0) {
      set({ ruleErrors: validationErrors });
      return;
    }

    const nextConfig = parsedConfig as ScreenRuleConfig;
    set({
      ruleConfig: nextConfig,
      ruleFormValues: mapConfigToFormValues(nextConfig),
      ruleErrors: {},
    });
  },

  resetRules: () => {
    set({
      ruleConfig: DEFAULT_SCREEN_RULE_CONFIG,
      ruleFormValues: DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES,
      ruleErrors: {},
    });
  },
};
};
