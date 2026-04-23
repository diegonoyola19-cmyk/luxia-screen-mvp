import { StateCreator } from 'zustand';
import { CalculatorStore, WasteSlice, SessionWastePiece } from '../types';

export const createWasteSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  WasteSlice
> = (set) => ({
  selectedWastePieceId: null,
  selectedRollWidth: null,
  sessionWastePieces: [],

  setSelectedWastePieceId: (id) => set({ selectedWastePieceId: id }),
  setSelectedRollWidth: (width) => set({ selectedRollWidth: width }),

  addSessionWastePiece: (piece: SessionWastePiece) =>
    set((state) => ({
      sessionWastePieces: [...state.sessionWastePieces, piece],
    })),

  clearSessionWastePieces: () => set({ sessionWastePieces: [] }),
});
