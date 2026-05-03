import { StateCreator } from 'zustand';
import { CalculatorStore, RulesSlice } from '../types';
import { 
  DEFAULT_SCREEN_RULE_CONFIG, 
  DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES 
} from '../../../../domain/curtains/constants';
import { validateScreenRuleConfig } from '../../../../domain/curtains/screen';
import { StateCreator } from 'zustand';
import { CalculatorStore, RulesSlice } from '../types';
import { 
  DEFAULT_SCREEN_RULE_CONFIG, 
  DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES 
} from '../../../../domain/curtains/constants';
import { validateScreenRuleConfig } from '../../../../domain/curtains/screen';
import type { ScreenRuleConfig, ScreenRuleConfigFormValues } from '../../../../domain/curtains/types';
import { applyCatalogOverrides, getBaseCatalogItems } from '../../../../lib/itemCatalog';
import {
  createDefaultScreenRecipe,
  normalizeRecipeToneGroups,
} from '../../../../lib/recipeResolver';
import {
  loadFabricToneRules,
  loadItemCatalogOverrides,
  loadScreenRecipe,
  loadScreenRuleConfig,
  saveFabricToneRules,
  saveItemCatalogOverrides,
  saveScreenRecipe,
  saveScreenRuleConfig,
} from '../../../../lib/storage';
import {
  fetchRecipes,
  fetchFabricToneRules as fetchFabricToneRulesFromCloud,
  upsertRecipe,
  upsertFabricToneRules,
} from '../../../../lib/supabaseRepository';

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
  const initialCatalogOverrides = loadItemCatalogOverrides();
  const initialCatalogItems = applyCatalogOverrides(
    getBaseCatalogItems(),
    initialCatalogOverrides,
  );
  const initialRecipe =
    normalizeRecipeToneGroups(
      loadScreenRecipe() ?? createDefaultScreenRecipe(initialCatalogItems),
    );
  
  return {
    ruleConfig: initialConfig,
    ruleFormValues: mapConfigToFormValues(initialConfig),
    ruleErrors: {},
    catalogOverrides: initialCatalogOverrides,
    catalogItems: initialCatalogItems,
    fabricToneRules: loadFabricToneRules(),
    screenRecipe: initialRecipe,
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

  updateCatalogItemCategory: (itemCode, category) => {
    set((state) => {
      const catalogOverrides = {
        ...state.catalogOverrides,
        [itemCode]: {
          ...state.catalogOverrides[itemCode],
          category,
        },
      };

      return {
        catalogOverrides,
        catalogItems: applyCatalogOverrides(getBaseCatalogItems(), catalogOverrides),
      };
    });
  },

  updateCatalogItemColor: (itemCode, color) => {
    set((state) => {
      const nextColor = color.trim() === '' ? null : color.trim();
      const catalogOverrides = {
        ...state.catalogOverrides,
        [itemCode]: {
          ...state.catalogOverrides[itemCode],
          color: nextColor,
        },
      };

      return {
        catalogOverrides,
        catalogItems: applyCatalogOverrides(getBaseCatalogItems(), catalogOverrides),
      };
    });
  },

  updateCatalogItemSageCode: (itemCode, sageItemCode) => {
    set((state) => {
      const catalogOverrides = {
        ...state.catalogOverrides,
        [itemCode]: {
          ...state.catalogOverrides[itemCode],
          sageItemCode: sageItemCode.trim() || itemCode,
        },
      };

      return {
        catalogOverrides,
        catalogItems: applyCatalogOverrides(getBaseCatalogItems(), catalogOverrides),
      };
    });
  },

  updateFabricToneRule: (family, openness, color, toneGroup) => {
    set((state) => {
      const existingIndex = state.fabricToneRules.findIndex(
        (rule) =>
          rule.family === family &&
          rule.openness === openness &&
          rule.color === color,
      );
      const nextRule = {
        id: `${family}::${openness}::${color}`,
        family,
        openness,
        color,
        toneGroup,
      };
      const fabricToneRules =
        existingIndex === -1
          ? [...state.fabricToneRules, nextRule]
          : state.fabricToneRules.map((rule, index) =>
              index === existingIndex ? nextRule : rule,
            );

      return { fabricToneRules };
    });
  },

  updateRecipeItem: (componentId, toneGroup, itemCode) => {
    set((state) => ({
      screenRecipe: {
        ...state.screenRecipe,
        components: state.screenRecipe.components.map((component) =>
          component.id === componentId
            ? {
                ...component,
                itemByTone: {
                  ...component.itemByTone,
                  [toneGroup]: itemCode,
                },
              }
            : component,
        ),
      },
    }));
  },

  saveRules: () => {
    const { ruleFormValues } = get();
    const parsedConfig = parseConfigFormValues(ruleFormValues);
    const validationErrors = validateScreenRuleConfig(parsedConfig);

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

  saveRecipeSettings: () => {
    const { catalogOverrides, fabricToneRules, screenRecipe, ruleFormValues } = get();
    const parsedConfig = parseConfigFormValues(ruleFormValues);
    const validationErrors = validateScreenRuleConfig(parsedConfig);

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

  resetRecipe: () => {
    set((state) => ({
      screenRecipe: createDefaultScreenRecipe(state.catalogItems),
      fabricToneRules: [],
    }));
  },

  syncRecipeToCloud: async () => {
    const { screenRecipe, fabricToneRules } = get();
    set({ isSyncing: true });
    try {
      await Promise.all([
        upsertRecipe(screenRecipe),
        upsertFabricToneRules(fabricToneRules),
      ]);
      // Let Zustand persist handle local storage as usual
    } catch (error) {
      console.error('Error syncing recipe to cloud:', error);
      alert('Error al guardar en la nube: ' + (error as Error).message);
    } finally {
      set({ isSyncing: false });
    }
  },

  loadRecipeFromCloud: async () => {
    set({ isSyncing: true });
    try {
      const [recipes, toneRules] = await Promise.all([
        fetchRecipes(),
        fetchFabricToneRulesFromCloud(),
      ]);
      
      const defaultRecipe = recipes.find(r => r.id === 'screen-default') || recipes[0];
      
      if (defaultRecipe) {
        set({ 
          screenRecipe: normalizeRecipeToneGroups(defaultRecipe),
          fabricToneRules: toneRules 
        });
      } else {
        alert('No se encontro ninguna receta guardada en la nube.');
      }
    } catch (error) {
      console.error('Error loading recipe from cloud:', error);
      alert('Error al cargar de la nube: ' + (error as Error).message);
    } finally {
      set({ isSyncing: false });
    }
  },
};
};
