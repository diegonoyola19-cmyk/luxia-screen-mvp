import { StateCreator } from 'zustand';
import { CalculatorStore, OrderSlice, SessionWastePiece } from '../types';
import { ProjectCurtainItem, SavedCalculation, SavedOrder, CalculationInput, ProductionBatchItem } from '../../../../domain/curtains/types';
import { DEFAULT_FORM_VALUES, FEET_PER_METER, YARD2_PER_M2, generateId } from '../../../../domain/curtains/constants';
import { applyOrderToInventory } from '../../../../lib/inventory';
// storage removed
import { getAvailableWidths, resolveFabricSelection } from '../../../../lib/priceCatalog';
import { calculateScreenMaterials } from '../../../../domain/curtains/screen';
import {
  materialLinesToFixedComponents,
  resolveScreenRecipeMaterials,
} from '../../../../lib/recipeResolver';

const LINEAR_STOCK_FEET = 19;
const LINEAR_DISCOUNT_METERS = 0.03;

function calculateLinearDownloadedFeetByItem(items: ProductionBatchItem[]) {
  const cuts = items
    .map((item) => ({
      id: item.id,
      feet: Math.max(item.input.widthMeters - LINEAR_DISCOUNT_METERS, 0) * FEET_PER_METER,
    }))
    .filter((cut) => cut.feet > 0)
    .sort((left, right) => right.feet - left.feet);
  const downloadedByItem = new Map<string, number>();
  const bars: Array<{ remainingFeet: number; cuts: typeof cuts }> = [];

  cuts.forEach((cut) => {
    const bar = bars.find((current) => current.remainingFeet >= cut.feet);

    if (!bar) {
      bars.push({
        remainingFeet: LINEAR_STOCK_FEET - cut.feet,
        cuts: [cut],
      });
      return;
    }

    bar.remainingFeet -= cut.feet;
    bar.cuts.push(cut);
  });

  bars.forEach((bar) => {
    const usedFeet = bar.cuts.reduce((sum, cut) => sum + cut.feet, 0);
    const downloadedFeet = LINEAR_STOCK_FEET;

    bar.cuts.forEach((cut) => {
      const share = usedFeet > 0 ? cut.feet / usedFeet : 0;
      downloadedByItem.set(cut.id, (downloadedByItem.get(cut.id) ?? 0) + downloadedFeet * share);
    });
  });

  return downloadedByItem;
}

export const createOrderSlice: StateCreator<
  CalculatorStore,
  [],
  [],
  OrderSlice
> = (set, get) => ({
  orderDraft: {
    orderNumber: '',
    items: [],
  },
  savedOrders: [],
  selectedOrderId: null,

  setOrderDraft: (updater) => set((state) => ({ orderDraft: typeof updater === 'function' ? updater(state.orderDraft) : updater })),
  
  addToOrder: (displayResult, parsedFormValues, selectedWasteMatch) => {
    const { orderDraft, formValues } = get();
    if (!displayResult || parsedFormValues.widthMeters === undefined || parsedFormValues.heightMeters === undefined) {
      set((state) => ({ errors: { ...state.errors, general: 'Completa una medida valida antes de agregarla a la orden.' } }));
      return;
    }

    const orderItem: ProjectCurtainItem = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      title: `Cortina ${orderDraft.items.length + 1}`,
      input: parsedFormValues as CalculationInput,
      result: displayResult,
      reusedWastePiece: selectedWasteMatch?.wastePiece ?? null,
    };

    const historyItem: SavedCalculation = {
      id: orderItem.id,
      createdAt: orderItem.createdAt,
      input: orderItem.input,
      result: orderItem.result,
    };

    // Si la cortina genera merma, registrarla como retazo temporal de sesión
    const wasteW = displayResult.wastePieceWidthMeters ?? 0;
    const wasteH = displayResult.wastePieceHeightMeters ?? 0;
    if (wasteW > 0 && wasteH > 0) {
      const sessionPiece: SessionWastePiece = {
        id: orderItem.id + '-waste',
        createdAt: orderItem.createdAt,
        sourceItemId: orderItem.id,
        sourceItemTitle: orderItem.title,
        sourceOrderNumber: 'Sesión actual',
        fabricFamily: displayResult.selectedFabric?.family,
        fabricOpenness: displayResult.selectedFabric?.openness,
        fabricColor: displayResult.selectedFabric?.color,
        fabricItemCode: displayResult.selectedFabric?.itemCode,
        widthMeters: wasteW,
        heightMeters: wasteH,
        areaM2: wasteW * wasteH,
        isSessionPiece: true,
      };
      get().addSessionWastePiece(sessionPiece);
    }

    set((state) => ({
      orderDraft: {
        ...state.orderDraft,
        items: [...state.orderDraft.items, orderItem],
      },
      formValues: {
        ...DEFAULT_FORM_VALUES,
        fabricFamily: formValues.fabricFamily,
        fabricOpenness: formValues.fabricOpenness,
        fabricColor: formValues.fabricColor,
      },
      selectedWastePieceId: null,
      selectedRollWidth: null,
      errors: { ...state.errors, general: undefined },
      blurredFields: { widthMeters: false, heightMeters: false }
    }));
  },

  removeOrderItem: (id) => set((state) => ({
    orderDraft: {
      ...state.orderDraft,
      items: state.orderDraft.items.filter((item) => item.id !== id),
    }
  })),

  setOrderNumber: (value) => set((state) => ({
    orderDraft: { ...state.orderDraft, orderNumber: value }
  })),

  setCustomerName: (_value) => {},

  clearOrder: () => set((state) => ({
    orderDraft: {
      orderNumber: '',
      items: [],
    },
    sessionWastePieces: [],
    selectedWastePieceId: null,
    selectedRollWidth: null,
    errors: { ...state.errors, general: undefined }
  })),

  saveOrder: () => {
    const {
      orderDraft,
      itemsAProducir,
      cuttingGroups,
      productionInventory,
      ruleConfig,
      screenRecipe,
      fabricToneRules,
      catalogItems,
    } = get();
    const trimmedOrderNumber = orderDraft.orderNumber.trim();

    if (trimmedOrderNumber === '') {
      set((state) => ({ errors: { ...state.errors, general: 'Ingresa un numero de orden antes de guardarla.' } }));
      return;
    }

    if (itemsAProducir.length === 0) {
      set((state) => ({ errors: { ...state.errors, general: 'Agrega al menos una cortina al lote antes de guardar la orden.' } }));
      return;
    }

    const itemValues = new Map<
      string,
      {
        downloadedYd2: number;
        wasteYd2: number;
        rollWidth: number;
        wastePieceWidthMeters: number;
        wastePieceHeightMeters: number;
      }
    >();

    cuttingGroups.forEach((group) => {
      if (group.items.length === 0 || group.error) {
        group.items.forEach((item) => {
          itemValues.set(item.id, {
            downloadedYd2: 0,
            wasteYd2: 0,
            rollWidth: 0,
            wastePieceWidthMeters: 0,
            wastePieceHeightMeters: 0,
          });
        });
        return;
      }

      const totalItemCutWidth = group.items.reduce(
        (sum, item) => sum + item.input.widthMeters + 0.1,
        0,
      );
      const groupWasteYd2 =
        Math.max(group.rollWidth - totalItemCutWidth, 0) * group.cutHeight * YARD2_PER_M2;

      group.items.forEach((item, itemIndex) => {
        const itemCutWidth = item.input.widthMeters + 0.1;
        const share =
          totalItemCutWidth > 0 ? itemCutWidth / totalItemCutWidth : 1 / group.items.length;
        const usefulYd2 = itemCutWidth * group.cutHeight * YARD2_PER_M2;
        const wasteYd2 = groupWasteYd2 * share;
        const ownsPhysicalScrap = itemIndex === 0 && group.waste > 0;

        itemValues.set(item.id, {
          downloadedYd2: usefulYd2 + wasteYd2,
          wasteYd2,
          rollWidth: group.rollWidth,
          wastePieceWidthMeters: ownsPhysicalScrap ? group.waste : 0,
          wastePieceHeightMeters: ownsPhysicalScrap ? group.cutHeight : 0,
        });
      });
    });

    const materialIssues: string[] = [];
    const linearDownloadedFeetByItem = calculateLinearDownloadedFeetByItem(itemsAProducir);
    const orderItems: ProjectCurtainItem[] = itemsAProducir.map((batchItem, idx) => {
      const availableWidths = getAvailableWidths(
        batchItem.input.fabricFamily,
        batchItem.input.fabricOpenness,
        batchItem.input.fabricColor,
      );
      const baseResult = calculateScreenMaterials(
        batchItem.input,
        ruleConfig,
        availableWidths.length > 0 ? availableWidths : [ruleConfig.smallRollMeters, ruleConfig.largeRollMeters],
      );
      const vals = batchItem.reusedWastePiece
        ? {
            downloadedYd2: 0,
            wasteYd2: 0,
            rollWidth: baseResult.recommendedRollWidthMeters,
            wastePieceWidthMeters: 0,
            wastePieceHeightMeters: 0,
          }
        : itemValues.get(batchItem.id) ?? {
            downloadedYd2: baseResult.fabricDownloadedYd2,
            wasteYd2: baseResult.wasteYd2,
            rollWidth: baseResult.recommendedRollWidthMeters,
            wastePieceWidthMeters: baseResult.wastePieceWidthMeters,
            wastePieceHeightMeters: baseResult.wastePieceHeightMeters,
          };
      const recommendedRollWidth =
        vals.rollWidth > 0 ? vals.rollWidth : baseResult.recommendedRollWidthMeters;
      const selectedFabric = resolveFabricSelection(
        batchItem.input.fabricFamily,
        batchItem.input.fabricOpenness,
        batchItem.input.fabricColor,
        baseResult.occupiedRollWidthMeters,
        recommendedRollWidth,
      );
      const fabricCostPerYd2 =
        selectedFabric?.costPerYd2 ??
        productionInventory.fabrics.find(
          (fabric) =>
            fabric.kind === 'roll' &&
            fabric.status === 'available' &&
            fabric.widthMeters === recommendedRollWidth,
        )?.costPerYd2 ??
        0;
      const fabricDownloadedM2 = vals.downloadedYd2 / YARD2_PER_M2;
      const wasteM2 = vals.wasteYd2 / YARD2_PER_M2;
      const fabricUsefulM2 = Math.max(fabricDownloadedM2 - wasteM2, 0);
      const fabricUsefulYd2 = fabricUsefulM2 * YARD2_PER_M2;

      const calculatedResult = {
        ...baseResult,
        selectedFabric,
        recommendedRollWidthMeters: recommendedRollWidth,
        fabricCostPerYd2,
        fabricDownloadedM2,
        fabricUsefulM2,
        wasteM2,
        fabricDownloadedYd2: vals.downloadedYd2,
        fabricUsefulYd2,
        wasteYd2: vals.wasteYd2,
        wastePercentage: fabricDownloadedM2 === 0 ? 0 : (wasteM2 / fabricDownloadedM2) * 100,
        fabricDownloadedCost: vals.downloadedYd2 * fabricCostPerYd2,
        fabricUsefulCost: fabricUsefulYd2 * fabricCostPerYd2,
        fabricWasteCost: vals.wasteYd2 * fabricCostPerYd2,
        fabricSavingsCost: batchItem.reusedWastePiece
          ? baseResult.fabricDownloadedYd2 * fabricCostPerYd2
          : 0,
        wasteWidthMeters: vals.wastePieceWidthMeters,
        wastePieceWidthMeters: vals.wastePieceWidthMeters,
        wastePieceHeightMeters: vals.wastePieceHeightMeters,
        tubeDownloadedFeet: linearDownloadedFeetByItem.get(batchItem.id) ?? baseResult.tubeFeet,
        bottomRailDownloadedFeet:
          linearDownloadedFeetByItem.get(batchItem.id) ?? baseResult.bottomRailFeet,
      };

      const recipeResolution = resolveScreenRecipeMaterials(
        batchItem.input,
        calculatedResult,
        screenRecipe,
        fabricToneRules,
        catalogItems,
      );

      if (recipeResolution.warnings.length > 0) {
        materialIssues.push(
          `Cortina ${idx + 1}: ${recipeResolution.warnings.join(' ')}`,
        );
      }

      const resultWithMaterials = {
        ...calculatedResult,
        fixedComponents: materialLinesToFixedComponents(
          recipeResolution.materialLines,
          calculatedResult.fixedComponents,
        ),
        materialLines: recipeResolution.materialLines,
        materialWarnings: recipeResolution.warnings,
      };

      return {
        id: batchItem.id,
        createdAt: new Date().toISOString(),
        title: `Cortina ${idx + 1}`,
        input: batchItem.input,
        result: resultWithMaterials,
        materialLines: recipeResolution.materialLines,
        materialWarnings: recipeResolution.warnings,
        reusedWastePiece: batchItem.reusedWastePiece ?? null,
      };
    });

    if (materialIssues.length > 0) {
      set((state) => ({
        errors: {
          ...state.errors,
          general: `Completa la receta antes de guardar. ${materialIssues.join(' ')}`,
        },
      }));
      return;
    }

    const savedOrder: SavedOrder = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      orderNumber: trimmedOrderNumber,
      items: orderItems,
      status: 'pending',
      sageExportedAt: null,
    };

    const inventoryResult = applyOrderToInventory(
      productionInventory,
      savedOrder,
      ruleConfig,
    );

    set((state) => ({
      savedOrders: [savedOrder, ...state.savedOrders],
      productionInventory: inventoryResult.inventory,
      inventoryMovements: [...inventoryResult.movements.reverse(), ...state.inventoryMovements],
      selectedOrderId: savedOrder.id,
      orderDraft: { orderNumber: '', items: [] },
      itemsAProducir: [],
      cuttingGroups: [],
      sessionWastePieces: [],
      result: null,
      selectedWastePieceId: null,
      selectedRollWidth: null,
      errors: {},
      activeView: 'orders'
    }));
  },
  deleteSavedOrder: (id) => set((state) => ({
    savedOrders: state.savedOrders.filter((order) => order.id !== id),
    selectedOrderId: state.selectedOrderId === id ? null : state.selectedOrderId
  })),

  updateSavedOrderStatus: (id, status) => set((state) => ({
    savedOrders: state.savedOrders.map((order) =>
      order.id === id
        ? {
            ...order,
            status: status ?? 'pending',
            sageExportedAt: status === 'sent_to_sage'
              ? order.sageExportedAt ?? new Date().toISOString()
              : null,
          }
        : order,
    ),
  })),

  markOrdersSentToSage: (ids) => set((state) => {
    const idSet = new Set(ids);
    const exportedAt = new Date().toISOString();

    return {
      savedOrders: state.savedOrders.map((order) =>
        idSet.has(order.id)
          ? { ...order, status: 'sent_to_sage', sageExportedAt: exportedAt }
          : order,
      ),
    };
  }),

  setSelectedOrderId: (id) => set({ selectedOrderId: id }),

  setSavedOrders: (updater) => set((state) => ({ savedOrders: typeof updater === 'function' ? updater(state.savedOrders) : updater })),

  importOrders: (importedOrders) => set((state) => {
    if (importedOrders.length === 0) {
      return { errors: { ...state.errors, general: 'El archivo no contiene ordenes validas para importar.' } };
    }

    const mergedOrders = [...state.savedOrders];
    importedOrders.forEach((order) => {
      const exists = mergedOrders.some((currentOrder) => currentOrder.id === order.id);
      if (!exists) {
        mergedOrders.push({
          ...order,
          status: order.status ?? 'pending',
          sageExportedAt: order.sageExportedAt ?? null,
        });
      }
    });

    return {
      savedOrders: mergedOrders,
      selectedOrderId: importedOrders[0]?.id ?? null,
      errors: { ...state.errors, general: undefined },
      activeView: 'orders'
    };
  })
});
