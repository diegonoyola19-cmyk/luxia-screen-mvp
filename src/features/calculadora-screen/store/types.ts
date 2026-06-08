import type { ReusableRemainder } from '../../../domain/orders/issueStrategies';
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
  MountingSystem,
  HardwareTone,
  FabricInventoryItem,
} from '../../../domain/curtains/types';
import type { SavedOrderStatus } from '../../../domain/orders/orderStatus';
import type { ProductionMaterialReview } from '../../../domain/orders/materialReview';
import { CuttingGroup } from '../../../domain/curtains/CuttingGroup';

export interface SyncStatus {
  status: 'synced' | 'pending' | 'error';
  /** 'upsert_with_inventory' indica que además del upsert a work_orders se debe llamar el RPC de consumo de inventario */
  pendingAction?: 'upsert' | 'upsert_with_inventory' | 'delete';
  /** true cuando el RPC process_order_inventory_tx ya fue ejecutado exitosamente para esta orden */
  inventorySynced?: boolean;
  /** Código de error específico del RPC de inventario (ej. 'INSUFFICIENT_STOCK', 'ITEM_NOT_AVAILABLE') */
  inventoryErrorCode?: string;
  lastAttempt?: string;
  errorMessage?: string;
}

export type SyncMetadata = Record<string, SyncStatus>;

/** Extensión local del WastePiece para marcar retazos generados en la sesión activa. */
export interface SessionWastePiece extends WastePiece {
  isSessionPiece?: boolean;
}

export interface UiSlice {
  theme: 'light' | 'dark';
  activeView: 'production' | 'inventory' | 'orders' | 'settings' | 'production-v2' | 'v3-lab' | 'users';
  copyFeedbackVisible: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveView: (view: 'production' | 'inventory' | 'orders' | 'settings' | 'production-v2' | 'v3-lab' | 'users') => void;
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
  hardwareTone: HardwareTone | null;
  mountingSystem: MountingSystem;
  setHardwareTone: (tone: HardwareTone | null) => void;
  setMountingSystem: (system: MountingSystem) => void;
  recalculateOptimizedGroups: (getAvailableWidths: (f: string, o: string, c: string) => number[]) => void;
}

export interface InventorySlice {
  productionInventory: ProductionInventory;
  inventoryMovements: InventoryMovement[];

  setProductionInventory: (inventory: ProductionInventory) => void;
  setInventoryMovements: (movements: InventoryMovement[] | ((current: InventoryMovement[]) => InventoryMovement[])) => void;
  saveRollCosts: (costsByWidth: Record<string, number>) => void;
  discardInventoryItem: (id: string, category: 'fabric' | 'tube' | 'bottom') => void;
  addFabricScrap: (item: FabricInventoryItem) => void;
}

export interface OrderSlice {
  orderDraft: OrderDraft;
  savedOrders: SavedOrder[];
  selectedOrderId: string | null;
  remainders: ReusableRemainder[];
  syncMetadata: SyncMetadata;

  setOrderDraft: (updater: (current: OrderDraft) => OrderDraft) => void;
  addToOrder: (displayResult: CalculationResult, parsedFormValues: CalculationInput, selectedWasteMatch: WasteReuseMatch | null) => void;
  removeOrderItem: (id: string) => void;
  setOrderNumber: (value: string) => void;
  setCustomerName: (value: string) => void;
  clearOrder: () => void;
  saveOrder: () => void;
  deleteSavedOrder: (id: string) => void;
  removeOrderLocally: (id: string) => void;
  updateSavedOrderStatus: (id: string, status: SavedOrderStatus, metadata?: Partial<SavedOrder>) => void;
  saveProductionReview: (orderId: string, review: ProductionMaterialReview) => void;
  markOrdersSentToSage: (ids: string[], orderSnapshots?: Record<string, import('../../../domain/orders/materialReview').ProductionIssueSnapshot>) => void;
  setSelectedOrderId: (id: string | null) => void;
  setSavedOrders: (updater: (current: SavedOrder[]) => SavedOrder[] | SavedOrder[]) => void;
  importOrders: (importedOrders: SavedOrder[]) => void;
  setRemainders: (remainders: ReusableRemainder[]) => void;
  markOrderPending: (orderId: string, pendingAction: 'upsert' | 'upsert_with_inventory' | 'delete', errorMessage?: string) => void;
  markOrderSynced: (orderId: string, options?: { inventorySynced?: boolean }) => void;
  markOrderSyncError: (orderId: string, errorMessage: string, inventoryErrorCode?: string) => void;
  clearOrderSyncMetadata: (orderId: string) => void;
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
  isSyncing: boolean;

  setRuleConfig: (config: ScreenRuleConfig) => void;
  setRuleFormValues: (updater: (current: ScreenRuleConfigFormValues) => ScreenRuleConfigFormValues) => void;
  setRuleErrors: (errors: ScreenRuleConfigErrors) => void;

  handleRuleChange: (field: keyof ScreenRuleConfigFormValues, value: string) => void;
  handleFixedComponentChange: (index: number, value: string) => void;
  handleFixedComponentQuantityChange: (index: number, value: string) => void;
  handleFixedComponentUnitChange: (index: number, value: string) => void;
  handleFixedComponentCostChange: (index: number, value: string) => void;
  addFixedComponent: () => void;
  removeFixedComponent: (index: number) => void;
  saveRules: () => void;
  resetRules: () => void;
}

export type CalculatorStore = UiSlice &
  CalculationSlice &
  InventorySlice &
  OrderSlice &
  WasteSlice &
  RulesSlice;


