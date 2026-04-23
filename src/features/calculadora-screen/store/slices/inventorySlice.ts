import { StateCreator } from 'zustand';
import { CalculatorStore, InventorySlice } from '../types';
import { createDefaultInventory } from '../../../../lib/inventory';
import { loadProductionInventory, loadInventoryMovements } from '../../../../lib/storage';

export const createInventorySlice: StateCreator<
  CalculatorStore,
  [],
  [],
  InventorySlice
> = (set) => ({
  productionInventory: loadProductionInventory() ?? createDefaultInventory(),
  inventoryMovements: loadInventoryMovements() || [],

  setProductionInventory: (inventory) => set({ productionInventory: inventory }),
  
  setInventoryMovements: (movements) => set((state) => ({
    inventoryMovements: typeof movements === 'function' ? movements(state.inventoryMovements) : movements
  })),

  saveRollCosts: (costsByWidth) => {
    set((state) => ({
      productionInventory: {
        ...state.productionInventory,
        fabrics: state.productionInventory.fabrics.map((fabric) => {
          if (fabric.kind !== 'roll') {
            return fabric;
          }

          const nextCost = costsByWidth[fabric.widthMeters.toFixed(2)];

          return nextCost === undefined
            ? fabric
            : {
                ...fabric,
                costPerYd2: nextCost,
              };
        }),
      }
    }));
  },
});
