import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalculatorStore } from './types';
import { createUiSlice } from './slices/uiSlice';
import { createCalculationSlice } from './slices/calculationSlice';
import { createInventorySlice } from './slices/inventorySlice';
import { createOrderSlice } from './slices/orderSlice';
import { createWasteSlice } from './slices/wasteSlice';
import { createRulesSlice } from './slices/rulesSlice';
import { getAvailableWidths } from '../../../lib/priceCatalog';

export const useCalculatorStore = create<CalculatorStore>()(
  persist(
    (...a) => ({
      ...createUiSlice(...a),
      ...createCalculationSlice(getAvailableWidths)(...a),
      ...createInventorySlice(...a),
      ...createOrderSlice(...a),
      ...createWasteSlice(...a),
      ...createRulesSlice(...a),
    }),
    {
      name: 'luxia-calculator-storage',
      partialize: (state) => ({
        theme: state.theme,
        formValues: state.formValues,
        orderDraft: state.orderDraft,
        savedOrders: state.savedOrders,
        productionInventory: state.productionInventory,
        inventoryMovements: state.inventoryMovements,
        ruleConfig: state.ruleConfig,
        catalogOverrides: state.catalogOverrides,
        fabricToneRules: state.fabricToneRules,
        screenRecipe: state.screenRecipe,
      }),
    }
  )
);
