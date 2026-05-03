import { StateCreator } from 'zustand';
import { CalculatorStore, InventorySlice } from '../types';
import { createDefaultInventory } from '../../../../lib/inventory';
export const createInventorySlice: StateCreator<
  CalculatorStore,
  [],
  [],
  InventorySlice
> = (set) => ({
  productionInventory: createDefaultInventory(),
  inventoryMovements: [],

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

  discardInventoryItem: (id, category) => {
    set((state) => {
      const { productionInventory, inventoryMovements } = state;
      const nextInventory = { ...productionInventory };
      const newMovements = [...inventoryMovements];

      let itemToDiscard: any = null;

      if (category === 'fabric') {
        const index = nextInventory.fabrics.findIndex((f) => f.id === id);
        if (index !== -1) {
          itemToDiscard = nextInventory.fabrics[index];
          nextInventory.fabrics[index] = { ...itemToDiscard, status: 'discarded' };
        }
      } else if (category === 'tube') {
        const index = nextInventory.tubes.findIndex((t) => t.id === id);
        if (index !== -1) {
          itemToDiscard = nextInventory.tubes[index];
          nextInventory.tubes[index] = { ...itemToDiscard, status: 'discarded' };
        }
      } else if (category === 'bottom') {
        const index = nextInventory.bottoms.findIndex((b) => b.id === id);
        if (index !== -1) {
          itemToDiscard = nextInventory.bottoms[index];
          nextInventory.bottoms[index] = { ...itemToDiscard, status: 'discarded' };
        }
      }

      if (itemToDiscard) {
        newMovements.unshift({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          category,
          action: 'discard',
          itemCode: itemToDiscard.code,
          itemLabel: itemToDiscard.kind === 'scrap' ? `Retazo dado de baja` : `Sobrante dado de baja`,
          quantity: category === 'fabric' ? itemToDiscard.widthMeters * itemToDiscard.lengthMeters : itemToDiscard.lengthMeters,
          unit: category === 'fabric' ? 'm2' : 'm',
          notes: 'Removido manualmente por usuario (Limpieza de piso).',
        });
      }

      return {
        productionInventory: nextInventory,
        inventoryMovements: newMovements,
      };
    });
  },
});
