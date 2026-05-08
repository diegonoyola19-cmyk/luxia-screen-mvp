import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CalculatorStore, RulesSlice } from '../types';
import { 
  DEFAULT_SCREEN_RULE_CONFIG,
  DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES,
} from '../../../../domain/curtains/constants';
import { validateScreenRuleConfig } from '../../../../domain/curtains/screen';
import type { ScreenRuleConfig, ScreenRuleConfigFormValues } from '../../../../domain/curtains/types';
import { loadScreenRuleConfig, saveScreenRuleConfig } from '../../../../lib/storage';

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
    isSyncing: false,

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

  addFixedComponent: () => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: [
          ...state.ruleFormValues.fixedComponents,
          { quantity: '1', name: '', unit: 'u', cost: '0' },
        ],
      },
    }));
  },

  removeFixedComponent: (index) => {
    set((state) => ({
      ruleFormValues: {
        ...state.ruleFormValues,
        fixedComponents: state.ruleFormValues.fixedComponents.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  },

  saveRules: () => {
    const state = get();
    const parsedConfig = parseConfigFormValues(state.ruleFormValues);
    const configErrors = validateScreenRuleConfig(parsedConfig);

    if (Object.keys(configErrors).length > 0) {
      set({ ruleErrors: { ...configErrors, general: 'Por favor, corrige los errores antes de guardar.' } });
      toast.error('Corrige los errores antes de guardar');
      return;
    }

    const newConfig = parsedConfig as ScreenRuleConfig;
    saveScreenRuleConfig(newConfig);
    set({
      ruleConfig: newConfig,
      ruleFormValues: mapConfigToFormValues(newConfig),
      ruleErrors: {},
    });

    toast.success('Configuración guardada correctamente');
  },

  resetRules: () => {
    set({
      ruleFormValues: DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES,
      ruleErrors: {},
    });
  },

  };
};
