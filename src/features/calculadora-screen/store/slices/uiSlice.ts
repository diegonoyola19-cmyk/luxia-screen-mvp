import { StateCreator } from 'zustand';
import { CalculatorStore, UiSlice } from '../types';

export const createUiSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  UiSlice
> = (set) => ({
  theme: 'dark',
  activeView: 'production-v2',
  copyFeedbackVisible: false,

  setTheme: (theme) => set({ theme }),
  setActiveView: (view) => set({ activeView: view }),
  setCopyFeedbackVisible: (visible) => set({ copyFeedbackVisible: visible }),
});
