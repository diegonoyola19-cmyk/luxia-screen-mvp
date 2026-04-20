import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_FORM_VALUES,
  DEFAULT_SCREEN_RULE_CONFIG,
  DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES,
  DEFAULT_WASTE_REUSE_MARGIN_METERS,
} from '../../domain/curtains/constants';
import {
  calculateScreenMaterials,
  findReusableWasteMatches,
  validateScreenInput,
  validateScreenRuleConfig,
} from '../../domain/curtains/screen';
import type {
  CalculationFormValues,
  CalculationInput,
  CalculationResult,
  InventoryMovement,
  OrderDraft,
  ProductionInventory,
  ProjectCurtainItem,
  SavedCalculation,
  SavedOrder,
  ScreenRuleConfig,
  ScreenRuleConfigErrors,
  ScreenRuleConfigFormValues,
  ScreenValidationErrors,
  WastePiece,
  WasteReuseMatch,
} from '../../domain/curtains/types';
import {
  loadFormDraft,
  loadHistory,
  loadInventoryMovements,
  loadProductionInventory,
  loadProjectDraft,
  loadSavedOrders,
  loadScreenRuleConfig,
  saveFormDraft,
  saveHistory,
  saveInventoryMovements,
  saveProductionInventory,
  saveProjectDraft,
  saveSavedOrders,
  saveScreenRuleConfig,
} from '../../lib/storage';
import { downloadSavedOrders, importSavedOrdersFile } from '../../lib/orderTransfer';
import {
  applyOrderToInventory,
  createDefaultInventory,
  getMinFabricScrapSideMeters,
} from '../../lib/inventory';
import {
  getRollerFabricColorOptions,
  getRollerFabricFamilies,
  getRollerFabricOpennessOptions,
  getRollerFabricSelectionDefaults,
  getRollerFabricVariants,
  resolveFabricSelection,
} from '../../lib/priceCatalog';
import { ProductionModule } from './components/ProductionModule';
const InventoryPanel = lazy(async () => {
  const module = await import('./components/InventoryPanel');
  return { default: module.InventoryPanel };
});
const RulesPanel = lazy(async () => {
  const module = await import('./components/RulesPanel');
  return { default: module.RulesPanel };
});
const SavedOrdersPanel = lazy(async () => {
  const module = await import('./components/SavedOrdersPanel');
  return { default: module.SavedOrdersPanel };
});

function parseFormValues(values: CalculationFormValues): Partial<CalculationInput> {
  return {
    curtainType: values.curtainType,
    fabricFamily: values.fabricFamily,
    fabricOpenness: values.fabricOpenness,
    fabricColor: values.fabricColor,
    widthMeters:
      values.widthMeters.trim() === '' ? undefined : Number(values.widthMeters),
    heightMeters:
      values.heightMeters.trim() === '' ? undefined : Number(values.heightMeters),
  };
}

function mapConfigToFormValues(
  config: ScreenRuleConfig,
): ScreenRuleConfigFormValues {
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

function parseConfigFormValues(
  values: ScreenRuleConfigFormValues,
): Partial<ScreenRuleConfig> {
  const fixedComponents = values.fixedComponents
    .map((item) => ({
      quantity: Number(item.quantity),
      name: item.name.trim(),
      unit: item.unit.trim(),
      cost: Number(item.cost),
    }))
    .filter((item) => item.name !== '');

  return {
    cutHeightExtraMeters:
      values.cutHeightExtraMeters.trim() === ''
        ? undefined
        : Number(values.cutHeightExtraMeters),
    maxWidthMeters:
      values.maxWidthMeters.trim() === '' ? undefined : Number(values.maxWidthMeters),
    chainMultiplier:
      values.chainMultiplier.trim() === ''
        ? undefined
        : Number(values.chainMultiplier),
    smallRollMeters:
      values.smallRollMeters.trim() === ''
        ? undefined
        : Number(values.smallRollMeters),
    largeRollMeters:
      values.largeRollMeters.trim() === ''
        ? undefined
        : Number(values.largeRollMeters),
    fixedComponents,
  };
}

function buildWastePiecesFromInventory(inventory: ProductionInventory): WastePiece[] {
  return inventory.fabrics
    .filter(
      (item) =>
        item.kind === 'scrap' &&
        item.status === 'available' &&
        item.widthMeters >= getMinFabricScrapSideMeters() &&
        item.lengthMeters >= getMinFabricScrapSideMeters(),
    )
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      sourceItemId: item.id,
      sourceItemTitle: item.code,
      fabricFamily: item.family,
      fabricOpenness: item.openness,
      fabricColor: item.color,
      fabricItemCode: item.code,
      widthMeters: item.widthMeters,
      heightMeters: item.lengthMeters,
      areaM2: item.widthMeters * item.lengthMeters,
    }));
}

function buildWastePiecesFromDraft(order: OrderDraft): WastePiece[] {
  return order.items
    .filter(
      (item) =>
        item.result.wastePieceWidthMeters > 0 && item.result.wastePieceHeightMeters > 0,
    )
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      sourceItemId: item.id,
      sourceItemTitle: item.title,
      sourceOrderNumber: order.orderNumber.trim() || 'Orden actual',
      fabricFamily: item.result.selectedFabric?.family,
      fabricOpenness: item.result.selectedFabric?.openness,
      fabricColor: item.result.selectedFabric?.color,
      fabricItemCode: item.result.selectedFabric?.itemCode,
      widthMeters: item.result.wastePieceWidthMeters,
      heightMeters: item.result.wastePieceHeightMeters,
      areaM2: item.result.wasteM2,
    }));
}

function collectUsedWastePieceIds(orderDraft: OrderDraft): Set<string> {
  const ids = new Set<string>();

  orderDraft.items.forEach((item) => {
    if (item.reusedWastePiece?.id) {
      ids.add(item.reusedWastePiece.id);
    }
  });

  return ids;
}

function isSameFabricIdentity(
  piece: WastePiece,
  selectedFabric: NonNullable<CalculationResult['selectedFabric']> | null,
) {
  if (!selectedFabric) {
    return false;
  }

  return (
    piece.fabricFamily?.toLowerCase() === selectedFabric.family.toLowerCase() &&
    piece.fabricOpenness?.toLowerCase() === selectedFabric.openness.toLowerCase() &&
    piece.fabricColor?.toLowerCase() === selectedFabric.color.toLowerCase()
  );
}

function applyWasteReuseToResult(
  result: CalculationResult,
  selectedMatch: WasteReuseMatch | null,
): CalculationResult {
  if (!selectedMatch) {
    return result;
  }

  return {
    ...result,
    fabricDownloadedM2: 0,
    fabricUsefulM2: 0,
    wasteM2: 0,
    fabricDownloadedYd2: 0,
    fabricUsefulYd2: 0,
    wasteYd2: 0,
    wastePercentage: 0,
    fabricDownloadedCost: 0,
    fabricUsefulCost: 0,
    fabricWasteCost: 0,
    fabricSavingsCost: result.fabricDownloadedYd2 * result.fabricCostPerYd2,
    wasteWidthMeters: 0,
    wastePieceWidthMeters: 0,
    wastePieceHeightMeters: 0,
  };
}

const YARD2_PER_M2 = 1.19599;

function getFabricCostPerYd2(
  inventory: ProductionInventory,
  rollWidthMeters: number,
) {
  return (
    inventory.fabrics.find(
      (fabric) =>
        fabric.kind === 'roll' &&
        fabric.status === 'available' &&
        fabric.widthMeters === rollWidthMeters,
    )?.costPerYd2 ?? 0
  );
}

function applyFabricCostToResult(
  result: CalculationResult,
  costPerYd2: number,
): CalculationResult {
  return {
    ...result,
    fabricCostPerYd2: costPerYd2,
    fabricDownloadedCost: result.fabricDownloadedYd2 * costPerYd2,
    fabricUsefulCost: result.fabricUsefulYd2 * costPerYd2,
    fabricWasteCost: result.wasteYd2 * costPerYd2,
    fabricSavingsCost: 0,
  };
}

function applyRollOverrideToResult(
  result: CalculationResult,
  selectedRollWidth: number | null,
): CalculationResult {
  if (
    selectedRollWidth === null ||
    selectedRollWidth === result.recommendedRollWidthMeters ||
    selectedRollWidth < result.occupiedRollWidthMeters
  ) {
    return result;
  }

  const fabricDownloadedM2 = selectedRollWidth * result.cutLengthMeters;
  const fabricUsefulM2 = result.occupiedRollWidthMeters * result.cutLengthMeters;
  const wasteM2 = fabricDownloadedM2 - fabricUsefulM2;
  const wasteWidthMeters = selectedRollWidth - result.occupiedRollWidthMeters;

  return {
    ...result,
    recommendedRollWidthMeters: selectedRollWidth,
    wasteWidthMeters,
    wastePieceWidthMeters: wasteWidthMeters,
    wastePieceHeightMeters: result.cutLengthMeters,
    fabricDownloadedM2,
    fabricUsefulM2,
    wasteM2,
    fabricDownloadedYd2: fabricDownloadedM2 * YARD2_PER_M2,
    fabricUsefulYd2: fabricUsefulM2 * YARD2_PER_M2,
    wasteYd2: wasteM2 * YARD2_PER_M2,
    wastePercentage: fabricDownloadedM2 === 0 ? 0 : (wasteM2 / fabricDownloadedM2) * 100,
    fabricDownloadedCost: fabricDownloadedM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricUsefulCost: fabricUsefulM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricWasteCost: wasteM2 * YARD2_PER_M2 * result.fabricCostPerYd2,
    fabricSavingsCost: 0,
  };
}

function DeferredPanel({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="content-grid">
          <div className="card">
            <span className="section-heading__eyebrow">Cargando</span>
            <h2>Preparando modulo</h2>
            <p className="rules-panel__copy">
              Esta vista se carga bajo demanda para que Produccion abra mas rapido.
            </p>
          </div>
        </section>
      }
    >
      {children}
    </Suspense>
  );
}

export function ScreenCalculatorPage() {
  const defaultFabricSelection = getRollerFabricSelectionDefaults();
  const [activeView, setActiveView] = useState<
    'production' | 'inventory' | 'orders' | 'settings'
  >('production');
  const [formValues, setFormValues] = useState<CalculationFormValues>(() => {
    const draft = loadFormDraft();
    return {
      ...DEFAULT_FORM_VALUES,
      ...defaultFabricSelection,
      ...draft,
      fabricFamily: draft.fabricFamily || defaultFabricSelection.fabricFamily,
      fabricOpenness: draft.fabricOpenness || defaultFabricSelection.fabricOpenness,
      fabricColor: draft.fabricColor || defaultFabricSelection.fabricColor,
    };
  });
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [errors, setErrors] = useState<ScreenValidationErrors>({});
  const [history, setHistory] = useState<SavedCalculation[]>(() => loadHistory());
  const [orderDraft, setOrderDraft] = useState<OrderDraft>(() => loadProjectDraft());
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>(() => loadSavedOrders());
  const [productionInventory, setProductionInventory] = useState<ProductionInventory>(
    () => loadProductionInventory() ?? createDefaultInventory(),
  );
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(
    () => loadInventoryMovements(),
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ruleConfig, setRuleConfig] = useState<ScreenRuleConfig>(() =>
    loadScreenRuleConfig(),
  );
  const [ruleFormValues, setRuleFormValues] = useState<ScreenRuleConfigFormValues>(() =>
    mapConfigToFormValues(loadScreenRuleConfig()),
  );
  const [ruleErrors, setRuleErrors] = useState<ScreenRuleConfigErrors>({});
  const [selectedWastePieceId, setSelectedWastePieceId] = useState<string | null>(null);
  const [selectedRollWidth, setSelectedRollWidth] = useState<number | null>(null);

  useEffect(() => {
    saveFormDraft(formValues);
  }, [formValues]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    saveProjectDraft(orderDraft);
  }, [orderDraft]);

  useEffect(() => {
    saveSavedOrders(savedOrders);
  }, [savedOrders]);

  useEffect(() => {
    saveScreenRuleConfig(ruleConfig);
  }, [ruleConfig]);

  useEffect(() => {
    saveProductionInventory(productionInventory);
  }, [productionInventory]);

  useEffect(() => {
    saveInventoryMovements(inventoryMovements);
  }, [inventoryMovements]);

  const fabricFamilies = useMemo(() => getRollerFabricFamilies(), []);
  const fabricOpennessOptions = useMemo(
    () => getRollerFabricOpennessOptions(formValues.fabricFamily),
    [formValues.fabricFamily],
  );
  const fabricColorOptions = useMemo(
    () => getRollerFabricColorOptions(formValues.fabricFamily, formValues.fabricOpenness),
    [formValues.fabricFamily, formValues.fabricOpenness],
  );

  useEffect(() => {
    if (
      fabricFamilies.length === 0 ||
      fabricOpennessOptions.length === 0 ||
      fabricColorOptions.length === 0
    ) {
      return;
    }

    const nextFamily = fabricFamilies.includes(formValues.fabricFamily)
      ? formValues.fabricFamily
      : fabricFamilies[0];
    const validOpennessOptions = getRollerFabricOpennessOptions(nextFamily);
    const nextOpenness = validOpennessOptions.includes(formValues.fabricOpenness)
      ? formValues.fabricOpenness
      : validOpennessOptions[0] ?? '';
    const validColorOptions = getRollerFabricColorOptions(nextFamily, nextOpenness);
    const nextColor = validColorOptions.some((option) => option.color === formValues.fabricColor)
      ? formValues.fabricColor
      : validColorOptions[0]?.color ?? '';

    if (
      nextFamily === formValues.fabricFamily &&
      nextOpenness === formValues.fabricOpenness &&
      nextColor === formValues.fabricColor
    ) {
      return;
    }

    setFormValues((current) => ({
      ...current,
      fabricFamily: nextFamily,
      fabricOpenness: nextOpenness,
      fabricColor: nextColor,
    }));
  }, [
    fabricColorOptions,
    fabricFamilies,
    fabricOpennessOptions,
    formValues.fabricColor,
    formValues.fabricFamily,
    formValues.fabricOpenness,
  ]);

  const savedWastePieces = useMemo(() => {
    const usedWastePieceIds = collectUsedWastePieceIds(orderDraft);

    return buildWastePiecesFromInventory(productionInventory).filter(
      (piece) => !usedWastePieceIds.has(piece.id),
    );
  }, [orderDraft, productionInventory]);

  const draftWastePieces = useMemo(
    () => buildWastePiecesFromDraft(orderDraft),
    [orderDraft],
  );

  const wasteMatches = useMemo(() => {
    const parsedValues = parseFormValues(formValues);

    if (
      !result ||
      parsedValues.widthMeters === undefined ||
      parsedValues.heightMeters === undefined ||
      !parsedValues.curtainType
    ) {
      return [];
    }

    return findReusableWasteMatches(
      parsedValues as CalculationInput,
      savedWastePieces,
      DEFAULT_WASTE_REUSE_MARGIN_METERS,
      ruleConfig,
    );
  }, [formValues, result, ruleConfig, savedWastePieces]);

  const rollOptions = useMemo(() => {
    const selectedColor = fabricColorOptions.find(
      (option) => option.color === formValues.fabricColor,
    );
    const options =
      selectedColor?.widthsMeters.length
        ? selectedColor.widthsMeters
        : [ruleConfig.smallRollMeters, ruleConfig.largeRollMeters];

    return [...new Set(options)].sort((left, right) => left - right);
  }, [
    fabricColorOptions,
    formValues.fabricColor,
    ruleConfig.largeRollMeters,
    ruleConfig.smallRollMeters,
  ]);

  const selectedFabricPreview = useMemo(() => {
    const parsedValues = parseFormValues(formValues);
    const occupiedWidth = parsedValues.widthMeters ?? 0;

    return resolveFabricSelection(
      formValues.fabricFamily,
      formValues.fabricOpenness,
      formValues.fabricColor,
      occupiedWidth,
      selectedRollWidth,
    );
  }, [
    formValues,
    selectedRollWidth,
  ]);

  const relatedFabricVariants = useMemo(
    () =>
      getRollerFabricVariants(
        formValues.fabricFamily,
        formValues.fabricOpenness,
        formValues.fabricColor,
      ),
    [formValues.fabricColor, formValues.fabricFamily, formValues.fabricOpenness],
  );

  const colorWastePieces = useMemo(() => {
    if (!selectedFabricPreview) {
      return [];
    }

    return [...savedWastePieces, ...draftWastePieces].filter(
      (piece) => isSameFabricIdentity(piece, selectedFabricPreview),
    );
  }, [draftWastePieces, savedWastePieces, selectedFabricPreview]);

  const colorWasteMatches = useMemo(() => {
    if (!selectedFabricPreview) {
      return [];
    }

    return wasteMatches.filter((match) =>
      isSameFabricIdentity(match.wastePiece, selectedFabricPreview),
    );
  }, [selectedFabricPreview, wasteMatches]);

  const selectedWasteMatch =
    colorWasteMatches.find((match) => match.wastePiece.id === selectedWastePieceId) ?? null;

  const adjustedResult = useMemo(
    () => {
      if (!result) {
        return null;
      }

      const rollAdjustedResult = applyRollOverrideToResult(result, selectedRollWidth);
      const selectedFabric = resolveFabricSelection(
        formValues.fabricFamily,
        formValues.fabricOpenness,
        formValues.fabricColor,
        rollAdjustedResult.occupiedRollWidthMeters,
        rollAdjustedResult.recommendedRollWidthMeters,
      );

      const costAwareResult = applyFabricCostToResult(
        rollAdjustedResult,
        selectedFabric?.costPerYd2 ??
          getFabricCostPerYd2(
            productionInventory,
            rollAdjustedResult.recommendedRollWidthMeters,
          ),
      );

      return {
        ...costAwareResult,
        selectedFabric,
      };
    },
    [formValues.fabricColor, formValues.fabricFamily, formValues.fabricOpenness, productionInventory, result, selectedRollWidth],
  );

  const handleSaveRollCosts = (costsByWidth: Record<string, number>) => {
    setProductionInventory((current) => ({
      ...current,
      fabrics: current.fabrics.map((fabric) => {
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
    }));
  };

  const displayResult = useMemo(
    () => (adjustedResult ? applyWasteReuseToResult(adjustedResult, selectedWasteMatch) : null),
    [adjustedResult, selectedWasteMatch],
  );

  const handleChange = (field: keyof CalculationFormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, general: undefined }));
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
  };

  const handleFabricFamilyChange = (value: string) => {
    const nextOpennessOptions = getRollerFabricOpennessOptions(value);
    const nextOpenness = nextOpennessOptions[0] ?? '';
    const nextColor = getRollerFabricColorOptions(value, nextOpenness)[0]?.color ?? '';

    setFormValues((current) => ({
      ...current,
      fabricFamily: value,
      fabricOpenness: nextOpenness,
      fabricColor: nextColor,
    }));
    setErrors((current) => ({
      ...current,
      fabricFamily: undefined,
      fabricOpenness: undefined,
      fabricColor: undefined,
      general: undefined,
    }));
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
  };

  const handleFabricOpennessChange = (value: string) => {
    const nextColor = getRollerFabricColorOptions(formValues.fabricFamily, value)[0]?.color ?? '';

    setFormValues((current) => ({
      ...current,
      fabricOpenness: value,
      fabricColor: nextColor,
    }));
    setErrors((current) => ({
      ...current,
      fabricOpenness: undefined,
      fabricColor: undefined,
      general: undefined,
    }));
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
  };

  const handleFabricColorChange = (value: string) => {
    setFormValues((current) => ({ ...current, fabricColor: value }));
    setErrors((current) => ({ ...current, fabricColor: undefined, general: undefined }));
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
  };

  const handleSubmit = () => {
    const parsedValues = parseFormValues(formValues);
    const validationErrors = validateScreenInput(parsedValues, ruleConfig);

    if (Object.keys(validationErrors).length > 0) {
      setResult(null);
      setErrors(validationErrors);
      return;
    }

    try {
      const nextResult = calculateScreenMaterials(parsedValues as CalculationInput, ruleConfig);
      setResult(nextResult);
      const initialSelection = resolveFabricSelection(
        parsedValues.fabricFamily ?? '',
        parsedValues.fabricOpenness ?? '',
        parsedValues.fabricColor ?? '',
        nextResult.occupiedRollWidthMeters,
        nextResult.recommendedRollWidthMeters,
      );
      setSelectedRollWidth(
        initialSelection?.widthMeters ?? nextResult.recommendedRollWidthMeters,
      );
      setErrors({});
      setSelectedWastePieceId(null);
    } catch (error) {
      setResult(null);
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : 'No fue posible calcular los materiales.',
      });
    }
  };

  const handleClear = () => {
    setFormValues((current) => ({
      ...DEFAULT_FORM_VALUES,
      fabricFamily: current.fabricFamily,
      fabricOpenness: current.fabricOpenness,
      fabricColor: current.fabricColor,
    }));
    setResult(null);
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
    setErrors({});
  };

  const handleAddToOrder = () => {
    if (!result) {
      setErrors({
        general: 'Primero calcula una medida valida antes de agregarla a la orden.',
      });
      return;
    }

    const parsedValues = parseFormValues(formValues);
    const orderItem: ProjectCurtainItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: `Cortina ${orderDraft.items.length + 1}`,
      input: parsedValues as CalculationInput,
      result: displayResult ?? result,
      reusedWastePiece: selectedWasteMatch?.wastePiece ?? null,
    };

    const historyItem: SavedCalculation = {
      id: orderItem.id,
      createdAt: orderItem.createdAt,
      input: orderItem.input,
      result: orderItem.result,
    };

    setOrderDraft((current) => ({
      ...current,
      items: [...current.items, orderItem],
    }));
    setHistory((current) => [historyItem, ...current].slice(0, 10));
    setFormValues((current) => ({
      ...DEFAULT_FORM_VALUES,
      fabricFamily: current.fabricFamily,
      fabricOpenness: current.fabricOpenness,
      fabricColor: current.fabricColor,
    }));
    setResult(null);
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
    setErrors({});
  };

  const handleRemoveOrderItem = (id: string) => {
    setOrderDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }));
  };

  const handleOrderNumberChange = (value: string) => {
    setOrderDraft((current) => ({
      ...current,
      orderNumber: value,
    }));
  };

  const handleCustomerNameChange = (value: string) => {
    setOrderDraft((current) => ({
      ...current,
      customerName: value,
    }));
  };

  const handleClearOrder = () => {
    setOrderDraft({
      orderNumber: '',
      customerName: '',
      items: [],
    });
    setResult(null);
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
    setErrors({});
  };

  const handleSaveOrder = () => {
    const trimmedOrderNumber = orderDraft.orderNumber.trim();

    if (trimmedOrderNumber === '') {
      setErrors({
        general: 'Ingresa un numero de orden antes de guardarla.',
      });
      return;
    }

    if (orderDraft.items.length === 0) {
      setErrors({
        general: 'Agrega al menos una cortina antes de guardar la orden.',
      });
      return;
    }

    const savedOrder: SavedOrder = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      orderNumber: trimmedOrderNumber,
      customerName: orderDraft.customerName.trim(),
      items: orderDraft.items,
    };

    const inventoryResult = applyOrderToInventory(
      productionInventory,
      savedOrder,
      ruleConfig,
    );

    setSavedOrders((current) => [savedOrder, ...current]);
    setProductionInventory(inventoryResult.inventory);
    setInventoryMovements((current) => [...inventoryResult.movements.reverse(), ...current]);
    setSelectedOrderId(savedOrder.id);
    setOrderDraft({
      orderNumber: '',
      customerName: '',
      items: [],
    });
    setResult(null);
    setSelectedWastePieceId(null);
    setSelectedRollWidth(null);
    setErrors({});
    setActiveView('orders');
  };

  const handleDeleteSavedOrder = (id: string) => {
    setSavedOrders((current) => current.filter((order) => order.id !== id));
    setSelectedOrderId((current) => (current === id ? null : current));
  };

  const handleExportOrders = () => {
    downloadSavedOrders(savedOrders);
  };

  const handleImportOrders = async (file: File) => {
    try {
      const importedOrders = await importSavedOrdersFile(file);

      if (importedOrders.length === 0) {
        setErrors({
          general: 'El archivo no contiene ordenes validas para importar.',
        });
        return;
      }

      setSavedOrders((current) => {
        const mergedOrders = [...current];

        importedOrders.forEach((order) => {
          const exists = mergedOrders.some((currentOrder) => currentOrder.id === order.id);

          if (!exists) {
            mergedOrders.push(order);
          }
        });

        return mergedOrders;
      });

      setSelectedOrderId(importedOrders[0]?.id ?? null);
      setErrors({});
      setActiveView('orders');
    } catch {
      setErrors({
        general: 'No se pudo importar el archivo de ordenes.',
      });
    }
  };

  const handleRuleChange = (
    field: keyof ScreenRuleConfigFormValues,
    value: string,
  ) => {
    setRuleFormValues((current) => ({ ...current, [field]: value }));
    setRuleErrors((current) => ({ ...current, [field]: undefined, general: undefined }));
  };

  const handleFixedComponentChange = (index: number, value: string) => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: current.fixedComponents.map((item, itemIndex) =>
        itemIndex === index ? { ...item, name: value } : item,
      ),
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleFixedComponentQuantityChange = (index: number, value: string) => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: current.fixedComponents.map((item, itemIndex) =>
        itemIndex === index ? { ...item, quantity: value } : item,
      ),
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleFixedComponentUnitChange = (index: number, value: string) => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: current.fixedComponents.map((item, itemIndex) =>
        itemIndex === index ? { ...item, unit: value } : item,
      ),
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleFixedComponentCostChange = (index: number, value: string) => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: current.fixedComponents.map((item, itemIndex) =>
        itemIndex === index ? { ...item, cost: value } : item,
      ),
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleAddFixedComponent = () => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: [
        ...current.fixedComponents,
        { quantity: '1', name: '', unit: 'u', cost: '0.00' },
      ],
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleRemoveFixedComponent = (index: number) => {
    setRuleFormValues((current) => ({
      ...current,
      fixedComponents: current.fixedComponents.filter((_, itemIndex) => itemIndex !== index),
    }));
    setRuleErrors((current) => ({ ...current, fixedComponents: undefined, general: undefined }));
  };

  const handleSaveRules = () => {
    const parsedConfig = parseConfigFormValues(ruleFormValues);
    const validationErrors = validateScreenRuleConfig(parsedConfig);

    if (Object.keys(validationErrors).length > 0) {
      setRuleErrors(validationErrors);
      return;
    }

    const nextConfig = parsedConfig as ScreenRuleConfig;
    setRuleConfig(nextConfig);
    setRuleFormValues(mapConfigToFormValues(nextConfig));
    setRuleErrors({});

    if (result) {
      const parsedValues = parseFormValues(formValues);

      if (
        parsedValues.widthMeters !== undefined &&
        parsedValues.heightMeters !== undefined &&
        parsedValues.curtainType
      ) {
        try {
          const nextResult = calculateScreenMaterials(parsedValues as CalculationInput, nextConfig);
          setResult(nextResult);
          const nextFabric = resolveFabricSelection(
            parsedValues.fabricFamily ?? '',
            parsedValues.fabricOpenness ?? '',
            parsedValues.fabricColor ?? '',
            nextResult.occupiedRollWidthMeters,
            nextResult.recommendedRollWidthMeters,
          );
          setSelectedRollWidth(nextFabric?.widthMeters ?? nextResult.recommendedRollWidthMeters);
          setErrors({});
        } catch (error) {
          setResult(null);
          setErrors({
            general:
              error instanceof Error
                ? error.message
                : 'Las nuevas reglas invalidaron el calculo actual.',
          });
        }
      }
    }
  };

  const handleResetRules = () => {
    setRuleConfig(DEFAULT_SCREEN_RULE_CONFIG);
    setRuleFormValues(DEFAULT_SCREEN_RULE_CONFIG_FORM_VALUES);
    setRuleErrors({});
  };

  return (
    <main className="page-shell">
      <section className="page-frame">
        <div className="view-switcher">
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'production' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'production'}
            onClick={() => setActiveView('production')}
          >
            Produccion
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'inventory' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'inventory'}
            onClick={() => setActiveView('inventory')}
          >
            Bodega
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'orders' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'orders'}
            onClick={() => setActiveView('orders')}
          >
            Ordenes
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'settings' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
          >
            Configuracion
          </button>
        </div>

        <div className="page-content">
          {activeView === 'production' ? (
            <ProductionModule
              values={formValues}
              errors={errors}
              order={orderDraft}
              result={displayResult}
              fabricFamilies={fabricFamilies}
              fabricOpennessOptions={fabricOpennessOptions}
              fabricColorOptions={fabricColorOptions}
              selectedFabricPreview={selectedFabricPreview}
              relatedFabricVariants={relatedFabricVariants}
              rollOptions={rollOptions}
              selectedRollWidth={selectedRollWidth}
              wasteMatches={colorWasteMatches}
              selectedWastePieceId={selectedWastePieceId}
              draftWastePieces={colorWastePieces}
              savedWastePieces={[]}
              onChange={handleChange}
              onFabricFamilyChange={handleFabricFamilyChange}
              onFabricOpennessChange={handleFabricOpennessChange}
              onFabricColorChange={handleFabricColorChange}
              onOrderNumberChange={handleOrderNumberChange}
              onCustomerNameChange={handleCustomerNameChange}
              onSubmit={handleSubmit}
              onClear={handleClear}
              onAddToOrder={handleAddToOrder}
              onSaveOrder={handleSaveOrder}
              onClearOrder={handleClearOrder}
              onRemoveOrderItem={handleRemoveOrderItem}
              onSelectWastePiece={setSelectedWastePieceId}
              onSelectRollWidth={setSelectedRollWidth}
              canAddToOrder={Boolean(result)}
              canSaveOrder={orderDraft.orderNumber.trim() !== '' && orderDraft.items.length > 0}
            />
          ) : activeView === 'inventory' ? (
            <DeferredPanel>
              <InventoryPanel
                inventory={productionInventory}
                movements={inventoryMovements}
                onSaveRollCosts={handleSaveRollCosts}
              />
            </DeferredPanel>
          ) : activeView === 'orders' ? (
            <DeferredPanel>
              <SavedOrdersPanel
                orders={savedOrders}
                selectedOrderId={selectedOrderId}
                onSelectOrder={setSelectedOrderId}
                onDeleteOrder={handleDeleteSavedOrder}
                onExportOrders={handleExportOrders}
                onImportOrders={handleImportOrders}
              />
            </DeferredPanel>
          ) : (
            <DeferredPanel>
              <section className="content-grid content-grid--rules">
                <RulesPanel
                  values={ruleFormValues}
                  errors={ruleErrors}
                  onChange={handleRuleChange}
                  onFixedComponentChange={handleFixedComponentChange}
                  onFixedComponentQuantityChange={handleFixedComponentQuantityChange}
                  onFixedComponentUnitChange={handleFixedComponentUnitChange}
                  onFixedComponentCostChange={handleFixedComponentCostChange}
                  onAddFixedComponent={handleAddFixedComponent}
                  onRemoveFixedComponent={handleRemoveFixedComponent}
                  onSave={handleSaveRules}
                  onReset={handleResetRules}
                />
              </section>
            </DeferredPanel>
          )}
        </div>
      </section>
    </main>
  );
}
