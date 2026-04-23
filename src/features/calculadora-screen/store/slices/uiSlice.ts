import { StateCreator } from 'zustand';
import { CalculatorStore, UiSlice } from '../types';

export const createUiSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  UiSlice
> = (set) => ({
  activeView: 'production',
  copyFeedbackVisible: false,

  setActiveView: (view) => set({ activeView: view }),
  setCopyFeedbackVisible: (visible) => set({ copyFeedbackVisible: visible }),
});
