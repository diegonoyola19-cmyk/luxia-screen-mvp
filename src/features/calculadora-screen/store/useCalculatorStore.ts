import { create } from 'zustand';
import { CalculatorStore } from './types';
import { createUiSlice } from './slices/uiSlice';
import { createCalculationSlice } from './slices/calculationSlice';
import { createInventorySlice } from './slices/inventorySlice';
import { createOrderSlice } from './slices/orderSlice';
import { createWasteSlice } from './slices/wasteSlice';
import { createRulesSlice } from './slices/rulesSlice';
import { createMultiConfigSlice } from './slices/multiConfigSlice';
import { getAvailableWidths } from '../../../lib/priceCatalog';

export const useCalculatorStore = create<CalculatorStore>()((...a) => ({
  ...createUiSlice(...a),
  ...createCalculationSlice(getAvailableWidths)(...a),
  ...createInventorySlice(...a),
  ...createOrderSlice(...a),
  ...createWasteSlice(...a),
  ...createRulesSlice(...a),
  ...createMultiConfigSlice(...a),
}));
