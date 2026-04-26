import { StateCreator } from 'zustand';
import { CalculatorStore, CalculationSlice } from '../types';
import { DEFAULT_FORM_VALUES, generateId } from '../../../../domain/curtains/constants';
import { getRollerFabricSelectionDefaults, getRollerFabricOpennessOptions, getRollerFabricColorOptions } from '../../../../lib/priceCatalog';
import { formatNumber } from '../../../../lib/format';
import { loadFormDraft } from '../../../../lib/storage';
import { optimizeCuts } from '../../../../domain/curtains/cuttingOptimizer';

export const createCalculationSlice = (
  getAvailableWidths: (f: string, o: string, c: string) => number[]
): StateCreator<
  CalculatorStore,
  [],
  [],
  CalculationSlice
> => (set, get) => {
  const defaultFabricSelection = getRollerFabricSelectionDefaults();
  const draft = loadFormDraft();

  const buildOptimizedGroups = (
    items: CalculatorStore['itemsAProducir'],
    ruleConfig: BaseRuleConfig,
  ) => {
    if (items.length === 0) {
      return [];
    }

    const itemsByFabric = new Map<string, CalculatorStore['itemsAProducir']>();

    items.forEach((item) => {
      const key = [
        item.input.fabricFamily,
        item.input.fabricOpenness,
        item.input.fabricColor,
      ].join('||');
      const current = itemsByFabric.get(key) ?? [];
      current.push(item);
      itemsByFabric.set(key, current);
    });

    return [...itemsByFabric.values()].flatMap((groupItems) => {
      const firstItem = groupItems[0];
      const widths = getAvailableWidths(
        firstItem.input.fabricFamily,
        firstItem.input.fabricOpenness,
        firstItem.input.fabricColor,
      );

      return optimizeCuts(groupItems, widths, ruleConfig);
    });
  };

  return {
    formValues: {
      ...DEFAULT_FORM_VALUES,
      ...defaultFabricSelection,
      ...draft,
      fabricFamily: draft.fabricFamily || defaultFabricSelection.fabricFamily,
      fabricOpenness: draft.fabricOpenness || defaultFabricSelection.fabricOpenness,
      fabricColor: draft.fabricColor || defaultFabricSelection.fabricColor,
    },
    result: null,
    errors: {},
    sessionHistory: [],
    blurredFields: { widthMeters: false, heightMeters: false },
    itemsAProducir: [],
    cuttingGroups: [],

    setFormValues: (updater) => set((state) => ({ formValues: typeof updater === 'function' ? updater(state.formValues) : updater })),
    
    setFormValue: (field, value) => set((state) => {
      const nextValues = { ...state.formValues, [field]: value };
      return { formValues: nextValues, errors: { ...state.errors, general: undefined }, selectedWastePieceId: null };
    }),

    setFabricFamily: (value) => set((state) => {
      const nextOpennessOptions = getRollerFabricOpennessOptions(value);
      const nextOpenness = nextOpennessOptions[0] ?? '';
      const nextColor = getRollerFabricColorOptions(value, nextOpenness)[0]?.color ?? '';
      return {
        formValues: {
          ...state.formValues,
          fabricFamily: value,
          fabricOpenness: nextOpenness,
          fabricColor: nextColor,
        },
        errors: { ...state.errors, fabricFamily: undefined, fabricOpenness: undefined, fabricColor: undefined, general: undefined },
        selectedWastePieceId: null
      };
    }),

    setFabricOpenness: (value) => set((state) => {
      const nextColor = getRollerFabricColorOptions(state.formValues.fabricFamily, value)[0]?.color ?? '';
      return {
        formValues: {
          ...state.formValues,
          fabricOpenness: value,
          fabricColor: nextColor,
        },
        errors: { ...state.errors, fabricOpenness: undefined, fabricColor: undefined, general: undefined },
        selectedWastePieceId: null
      };
    }),

    setFabricColor: (value) => set((state) => ({
      formValues: { ...state.formValues, fabricColor: value },
      errors: { ...state.errors, fabricColor: undefined, general: undefined },
      selectedWastePieceId: null
    })),

    setErrors: (updater) => set((state) => ({ errors: typeof updater === 'function' ? updater(state.errors) : updater })),
    
    setResult: (result) => set({ result }),

    handleFieldBlur: (field) => set((state) => ({ blurredFields: { ...state.blurredFields, [field]: true } })),

    handleNewCurtain: () => set((state) => ({
      formValues: {
        ...DEFAULT_FORM_VALUES,
        fabricFamily: state.formValues.fabricFamily,
        fabricOpenness: state.formValues.fabricOpenness,
        fabricColor: state.formValues.fabricColor,
      },
      selectedWastePieceId: null,
      selectedRollWidth: null,
      errors: { ...state.errors, general: undefined },
      blurredFields: { widthMeters: false, heightMeters: false },
    })),

    addToHistory: (displayResult, parsedFormValues) => {
      const { formValues } = get();
      if (!displayResult || parsedFormValues.widthMeters === undefined || parsedFormValues.heightMeters === undefined) return;

      const widthMeters = parsedFormValues.widthMeters;
      const heightMeters = parsedFormValues.heightMeters;

      set((state) => ({
        sessionHistory: [
          {
            id: generateId(),
            createdAt: new Date().toISOString(),
            widthMeters,
            heightMeters,
            fabricFamily: formValues.fabricFamily,
            fabricOpenness: formValues.fabricOpenness,
            fabricColor: formValues.fabricColor,
            fabricLabel: `${formValues.fabricFamily} ${formValues.fabricOpenness}`,
            yd2: displayResult.fabricDownloadedYd2,
            wasteYd2: displayResult.wasteYd2,
          },
          ...state.sessionHistory,
        ].slice(0, 10)
      }));
    },

    copySummary: async () => {
      const { sessionHistory } = get();
      if (sessionHistory.length === 0) return;

      const summaryText = sessionHistory
        .map(
          (item, index) =>
            `Cortina ${index + 1}: ${Math.round(item.widthMeters * 100)}x${Math.round(item.heightMeters * 100)}cm | Tela: ${item.fabricLabel} | Color: ${item.fabricColor} | Y²: ${formatNumber(item.yd2)} | Merma: ${formatNumber(item.wasteYd2)}`,
        )
        .join('\n');

      try {
        await navigator.clipboard.writeText(summaryText);
        set({ copyFeedbackVisible: true });
      } catch {
        set((state) => ({ errors: { ...state.errors, general: 'No se pudo copiar el resumen al portapapeles.' } }));
      }
    },

    addProductionItem: (item) => {
      try {
        const state = get();
        const nextItems = [...state.itemsAProducir, item];
        
        // Evitar optimizar si no hay datos de tela o medidas
        if (!item.input.fabricFamily || !item.input.widthMeters) {
          set({ itemsAProducir: nextItems });
          return;
        }
        const nextGroups = buildOptimizedGroups(nextItems, state.multiConfig.rollux);

        set({ 
          itemsAProducir: nextItems,
          cuttingGroups: nextGroups
        });
      } catch (err) {
        console.error('Error adding production item:', err);
        set((state) => ({ 
          itemsAProducir: [...state.itemsAProducir, item],
          errors: { ...state.errors, general: 'Error al optimizar el lote.' } 
        }));
      }
    },

    removeProductionItem: (id) => {
      const state = get();
      const nextItems = state.itemsAProducir.filter(i => i.id !== id);
      const nextGroups = buildOptimizedGroups(nextItems, state.multiConfig.rollux);
      
      set({ 
        itemsAProducir: nextItems,
        cuttingGroups: nextGroups
      });
    },

    recalculateOptimizedGroups: (fetchWidths) => {
      const { itemsAProducir, multiConfig } = get();
      if (itemsAProducir.length === 0) {
        set({ cuttingGroups: [] });
        return;
      }

      const itemsByFabric = new Map<string, typeof itemsAProducir>();

      itemsAProducir.forEach((item) => {
        const key = [
          item.input.fabricFamily,
          item.input.fabricOpenness,
          item.input.fabricColor,
        ].join('||');
        const current = itemsByFabric.get(key) ?? [];
        current.push(item);
        itemsByFabric.set(key, current);
      });

      const nextGroups = [...itemsByFabric.values()].flatMap((groupItems) => {
        const firstItem = groupItems[0];
        const widths = fetchWidths(
          firstItem.input.fabricFamily,
          firstItem.input.fabricOpenness,
          firstItem.input.fabricColor,
        );

        return optimizeCuts(groupItems, widths, multiConfig.rollux as any);
      });

      set({ cuttingGroups: nextGroups });
    }
  };
};
