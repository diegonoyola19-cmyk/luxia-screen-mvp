import type {
  CalculationFormValues,
  CalculationInput,
  CalculationResult,
  CatalogItem,
  CatalogItemOverride,
  ComponentCategory,
  CurtainRecipe,
  FabricToneRule,
  InventoryMovement,
  OrderDraft,
  ProductionInventory,
  SavedOrder,
  ScreenRuleConfig,
  ScreenRuleConfigErrors,
  ScreenRuleConfigFormValues,
  ScreenValidationErrors,
  SessionCalculationRecord,
  ToneGroup,
  WastePiece,
  WasteReuseMatch,
  ProductionBatchItem,
  CurtainType,
  RecipeComponentRule,
} from '../../../domain/curtains/types';
import { CuttingGroup } from '../../../domain/curtains/CuttingGroup';

/** Extensión local del WastePiece para marcar retazos generados en la sesión activa. */
export interface SessionWastePiece extends WastePiece {
  isSessionPiece?: boolean;
}

export interface UiSlice {
  theme: 'light' | 'dark';
  activeView: 'production' | 'inventory' | 'orders' | 'settings' | 'production-v2' | 'v3-lab';
  copyFeedbackVisible: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveView: (view: 'production' | 'inventory' | 'orders' | 'settings' | 'production-v2' | 'v3-lab') => void;
  setCopyFeedbackVisible: (visible: boolean) => void;
}

export interface CalculationSlice {
  formValues: CalculationFormValues;
  result: CalculationResult | null;
  errors: ScreenValidationErrors;
  sessionHistory: SessionCalculationRecord[];
  blurredFields: { widthMeters: boolean; heightMeters: boolean };

  setFormValues: (updater: (current: CalculationFormValues) => CalculationFormValues) => void;
  setFormValue: (field: keyof CalculationFormValues, value: string) => void;
  setFabricFamily: (value: string) => void;
  setFabricOpenness: (value: string) => void;
  setFabricColor: (value: string) => void;
  setErrors: (updater: (current: ScreenValidationErrors) => ScreenValidationErrors | ScreenValidationErrors) => void;
  setResult: (result: CalculationResult | null) => void;
  handleFieldBlur: (field: 'widthMeters' | 'heightMeters') => void;
  handleNewCurtain: () => void;
  addToHistory: (displayResult: CalculationResult, parsedFormValues: CalculationInput) => void;
  copySummary: () => Promise<void>;
  
  itemsAProducir: ProductionBatchItem[];
  cuttingGroups: CuttingGroup[];
  addProductionItem: (item: ProductionBatchItem) => void;
  removeProductionItem: (id: string) => void;
  recalculateOptimizedGroups: (getAvailableWidths: (f: string, o: string, c: string) => number[]) => void;
}

export interface InventorySlice {
  productionInventory: ProductionInventory;
  inventoryMovements: InventoryMovement[];

  setProductionInventory: (inventory: ProductionInventory) => void;
  setInventoryMovements: (movements: InventoryMovement[] | ((current: InventoryMovement[]) => InventoryMovement[])) => void;
  saveRollCosts: (costsByWidth: Record<string, number>) => void;
  discardInventoryItem: (id: string, category: 'fabric' | 'tube' | 'bottom') => void;
}

export interface OrderSlice {
  orderDraft: OrderDraft;
  savedOrders: SavedOrder[];
  selectedOrderId: string | null;

  setOrderDraft: (updater: (current: OrderDraft) => OrderDraft) => void;
  addToOrder: (displayResult: CalculationResult, parsedFormValues: CalculationInput, selectedWasteMatch: WasteReuseMatch | null) => void;
  removeOrderItem: (id: string) => void;
  setOrderNumber: (value: string) => void;
  setCustomerName: (value: string) => void;
  clearOrder: () => void;
  saveOrder: () => void;
  deleteSavedOrder: (id: string) => void;
  updateSavedOrderStatus: (id: string, status: SavedOrder['status']) => void;
  markOrdersSentToSage: (ids: string[]) => void;
  setSelectedOrderId: (id: string | null) => void;
  setSavedOrders: (updater: (current: SavedOrder[]) => SavedOrder[] | SavedOrder[]) => void;
  importOrders: (importedOrders: SavedOrder[]) => void;
}

export interface WasteSlice {
  selectedWastePieceId: string | null;
  selectedRollWidth: number | null;
  sessionWastePieces: SessionWastePiece[];

  setSelectedWastePieceId: (id: string | null) => void;
  setSelectedRollWidth: (width: number | null) => void;
  addSessionWastePiece: (piece: SessionWastePiece) => void;
  clearSessionWastePieces: () => void;
}

export interface RulesSlice {
  ruleConfig: ScreenRuleConfig;
  ruleFormValues: ScreenRuleConfigFormValues;
  ruleErrors: ScreenRuleConfigErrors;
  catalogItems: CatalogItem[];
  catalogOverrides: Record<string, CatalogItemOverride>;
  fabricToneRules: FabricToneRule[];
  recipes: Record<CurtainType, CurtainRecipe>;
  isSyncing: boolean;

  setRuleConfig: (config: ScreenRuleConfig) => void;
  setRuleFormValues: (updater: (current: ScreenRuleConfigFormValues) => ScreenRuleConfigFormValues) => void;
  setRuleErrors: (errors: ScreenRuleConfigErrors) => void;

  handleRuleChange: (field: keyof ScreenRuleConfigFormValues, value: string) => void;
  handleFixedComponentChange: (index: number, value: string) => void;
  handleFixedComponentQuantityChange: (index: number, value: string) => void;
  handleFixedComponentUnitChange: (index: number, value: string) => void;
  handleFixedComponentCostChange: (index: number, value: string) => void;
  handleAddFixedComponent: () => void;
  handleRemoveFixedComponent: (index: number) => void;
  updateCatalogItemCategory: (itemCode: string, category: ComponentCategory) => void;
  updateCatalogItemColor: (itemCode: string, color: string) => void;
  updateCatalogItemSageCode: (itemCode: string, sageItemCode: string) => void;
  updateFabricToneRule: (family: string, openness: string, color: string, toneGroup: ToneGroup) => void;
  updateRecipeItem: (curtainType: CurtainType, componentId: string, toneGroup: ToneGroup, itemCode: string) => void;
  addRecipeComponent: (curtainType: CurtainType, component: Omit<RecipeComponentRule, 'id'>) => void;
  updateRecipeComponentConfig: (curtainType: CurtainType, componentId: string, updates: Partial<RecipeComponentRule>) => void;
  removeRecipeComponent: (curtainType: CurtainType, componentId: string) => void;
  saveRules: () => void;
  saveRecipeSettings: () => void;
  resetRules: () => void;
  resetRecipe: () => void;
  syncRecipeToCloud: () => Promise<void>;
  loadRecipeFromCloud: () => Promise<void>;
}

export type CalculatorStore = UiSlice &
  CalculationSlice &
  InventorySlice &
  OrderSlice &
  WasteSlice &
  RulesSlice;
