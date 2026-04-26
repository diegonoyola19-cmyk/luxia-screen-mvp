import type {
  CalculationFormValues,
  CalculationResult,
  InventoryMovement,
  OrderDraft,
  ProductionInventory,
  SavedOrder,
  ScreenRuleConfig,
  ScreenRuleConfigErrors,
  ScreenRuleConfigFormValues,
  ScreenValidationErrors,
  SessionCalculationRecord,
  WastePiece,
  ProductionBatchItem,
  MultiProductConfig,
  CurtainType,
  BaseRuleConfig,
} from '../../../domain/curtains/types';
import { CuttingGroup } from '../../../domain/curtains/CuttingGroup';

/** Extensión local del WastePiece para marcar retazos generados en la sesión activa. */
export interface SessionWastePiece extends WastePiece {
  isSessionPiece?: boolean;
}

export interface UiSlice {
  activeView: 'production' | 'inventory' | 'orders' | 'settings';
  copyFeedbackVisible: boolean;
  setActiveView: (view: 'production' | 'inventory' | 'orders' | 'settings') => void;
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
  addToHistory: (displayResult: CalculationResult, parsedFormValues: any) => void;
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
}

export interface OrderSlice {
  orderDraft: OrderDraft;
  savedOrders: SavedOrder[];
  selectedOrderId: string | null;

  setOrderDraft: (updater: (current: OrderDraft) => OrderDraft) => void;
  addToOrder: (displayResult: CalculationResult, parsedFormValues: any, selectedWasteMatch: any) => void;
  removeOrderItem: (id: string) => void;
  setOrderNumber: (value: string) => void;
  setCustomerName: (value: string) => void;
  clearOrder: () => void;
  saveOrder: () => void;
  deleteSavedOrder: (id: string) => void;
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
  saveRules: () => void;
  resetRules: () => void;
}

export interface MultiConfigSlice {
  multiConfig: MultiProductConfig;
  activeConfigTab: CurtainType;

  setActiveConfigTab: (tab: CurtainType) => void;
  updateBaseRule: (model: CurtainType, field: keyof Omit<BaseRuleConfig, 'ruleComponents' | 'fixedComponents'>, value: number) => void;
  updateRuleComponent: (model: CurtainType, role: 'tube' | 'bottom' | 'chain', itemCode: string, name: string, unit: string, cost: number) => void;
  addFixedComponent: (model: CurtainType) => void;
  removeFixedComponent: (model: CurtainType, index: number) => void;
  updateFixedComponent: (model: CurtainType, index: number, field: string, value: any) => void;
  saveMultiConfig: () => void;
}

export type CalculatorStore = UiSlice &
  CalculationSlice &
  InventorySlice &
  OrderSlice &
  WasteSlice &
  RulesSlice &
  MultiConfigSlice;
