import { StateCreator } from 'zustand';
import { MultiConfigSlice, CalculatorStore } from '../types';
import { loadMultiProductConfig, saveMultiProductConfig } from '../../../../lib/storage';
import { MultiProductConfig, CurtainType, BaseRuleConfig } from '../../../../domain/curtains/types';
import { DEFAULT_MULTI_PRODUCT_CONFIG, DEFAULT_MULTI_PRODUCT_CONFIG_FORM_VALUES } from '../../../../domain/curtains/constants';

export const createMultiConfigSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  MultiConfigSlice
> = (set, get) => {
  const initialConfig = loadMultiProductConfig();

  // Asignamos todo a rollux para simplificar el mapeo inicial si es screen (migración)
  if (initialConfig.screen && !initialConfig.rollux) {
    initialConfig.rollux = { ...initialConfig.screen };
  }

  return {
    multiConfig: initialConfig,
    activeConfigTab: 'rollux',

    setActiveConfigTab: (tab: CurtainType) => set({ activeConfigTab: tab }),

    updateBaseRule: (model: CurtainType, field: keyof Omit<BaseRuleConfig, 'ruleComponents' | 'fixedComponents'>, value: number) => {
      const state = get();
      const updatedModelConfig = { ...state.multiConfig[model], [field]: value };
      const updatedConfig = { ...state.multiConfig, [model]: updatedModelConfig };
      set({ multiConfig: updatedConfig });
      saveMultiProductConfig(updatedConfig);
    },

    updateRuleComponent: (model: CurtainType, role: 'tube' | 'bottom' | 'chain', itemCode: string, name: string, unit: string, cost: number, imageUrl?: string | null) => {
      const state = get();
      const currentModel = state.multiConfig[model];
      const updatedModelConfig = {
        ...currentModel,
        ruleComponents: {
          ...currentModel.ruleComponents,
          [role]: { itemCode, name, unit, cost, imageUrl }
        }
      };
      const updatedConfig = { ...state.multiConfig, [model]: updatedModelConfig };
      set({ multiConfig: updatedConfig });
      saveMultiProductConfig(updatedConfig);
    },

    addFixedComponent: (model: CurtainType) => {
      const state = get();
      const currentModel = state.multiConfig[model];
      const updatedModelConfig = {
        ...currentModel,
        fixedComponents: [
          ...currentModel.fixedComponents,
          { quantity: 1, itemCode: '', name: '', unit: 'u', cost: 0 }
        ]
      };
      const updatedConfig = { ...state.multiConfig, [model]: updatedModelConfig };
      set({ multiConfig: updatedConfig });
      saveMultiProductConfig(updatedConfig);
    },

    removeFixedComponent: (model: CurtainType, index: number) => {
      const state = get();
      const currentModel = state.multiConfig[model];
      const updatedModelConfig = {
        ...currentModel,
        fixedComponents: currentModel.fixedComponents.filter((_, i) => i !== index)
      };
      const updatedConfig = { ...state.multiConfig, [model]: updatedModelConfig };
      set({ multiConfig: updatedConfig });
      saveMultiProductConfig(updatedConfig);
    },

    updateFixedComponent: (model: CurtainType, index: number, field: string, value: any) => {
      const state = get();
      const currentModel = state.multiConfig[model];
      const updatedModelConfig = {
        ...currentModel,
        fixedComponents: currentModel.fixedComponents.map((comp, i) => 
          i === index ? { ...comp, [field]: value } : comp
        )
      };
      const updatedConfig = { ...state.multiConfig, [model]: updatedModelConfig };
      set({ multiConfig: updatedConfig });
      saveMultiProductConfig(updatedConfig);
    },
    
    saveMultiConfig: () => {
       const state = get();
       saveMultiProductConfig(state.multiConfig);
    }
  };
};
