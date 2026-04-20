export type CurtainType = 'screen';

export interface CalculationInput {
  curtainType: CurtainType;
  fabricFamily: string;
  fabricOpenness: string;
  fabricColor: string;
  widthMeters: number;
  heightMeters: number;
}

export interface CalculationFormValues {
  curtainType: CurtainType;
  fabricFamily: string;
  fabricOpenness: string;
  fabricColor: string;
  widthMeters: string;
  heightMeters: string;
}

export interface SelectedFabric {
  family: string;
  openness: string;
  color: string;
  itemCode: string;
  description: string;
  imageUrl: string | null;
  widthMeters: number;
  costPerYd2: number;
}

export interface CalculationResult {
  curtainType: CurtainType;
  selectedFabric: SelectedFabric | null;
  orientationUsed: 'normal' | 'volteada';
  recommendedRollWidthMeters: number;
  cutLengthMeters: number;
  occupiedRollWidthMeters: number;
  wasteWidthMeters: number;
  wastePieceWidthMeters: number;
  wastePieceHeightMeters: number;
  tubeMeters: number;
  bottomRailMeters: number;
  chainMeters: number;
  tubeFeet: number;
  bottomRailFeet: number;
  chainFeet: number;
  fabricDownloadedM2: number;
  fabricUsefulM2: number;
  wasteM2: number;
  fabricDownloadedYd2: number;
  fabricUsefulYd2: number;
  wasteYd2: number;
  wastePercentage: number;
  fabricCostPerYd2: number;
  fabricDownloadedCost: number;
  fabricUsefulCost: number;
  fabricWasteCost: number;
  fabricSavingsCost: number;
  fixedComponents: ScreenFixedComponent[];
}

export interface WastePiece {
  id: string;
  createdAt: string;
  sourceItemId: string;
  sourceItemTitle: string;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  fabricFamily?: string;
  fabricOpenness?: string;
  fabricColor?: string;
  fabricItemCode?: string;
  widthMeters: number;
  heightMeters: number;
  areaM2: number;
}

export interface WasteReuseMatch {
  wastePiece: WastePiece;
  orientationUsed: 'normal' | 'volteada';
  requiredWidthMeters: number;
  requiredHeightMeters: number;
  marginMeters: number;
}

export interface ScreenFixedComponent {
  quantity: number;
  name: string;
  unit: string;
  cost: number;
}

export interface SavedCalculation {
  id: string;
  createdAt: string;
  input: CalculationInput;
  result: CalculationResult;
}

export interface ProjectCurtainItem {
  id: string;
  createdAt: string;
  title: string;
  input: CalculationInput;
  result: CalculationResult;
  reusedWastePiece?: WastePiece | null;
}

export interface ProjectDraft {
  name: string;
  items: ProjectCurtainItem[];
}

export interface OrderDraft {
  orderNumber: string;
  customerName: string;
  items: ProjectCurtainItem[];
}

export interface SavedOrder extends OrderDraft {
  id: string;
  createdAt: string;
}

export interface ScreenValidationErrors {
  curtainType?: string;
  fabricFamily?: string;
  fabricOpenness?: string;
  fabricColor?: string;
  widthMeters?: string;
  heightMeters?: string;
  general?: string;
}

export interface ScreenRuleConfig {
  cutHeightExtraMeters: number;
  maxWidthMeters: number;
  chainMultiplier: number;
  smallRollMeters: number;
  largeRollMeters: number;
  fixedComponents: ScreenFixedComponent[];
}

export interface ScreenFixedComponentFormValue {
  quantity: string;
  name: string;
  unit: string;
  cost: string;
}

export interface ScreenRuleConfigFormValues {
  cutHeightExtraMeters: string;
  maxWidthMeters: string;
  chainMultiplier: string;
  smallRollMeters: string;
  largeRollMeters: string;
  fixedComponents: ScreenFixedComponentFormValue[];
}

export interface ScreenRuleConfigErrors {
  cutHeightExtraMeters?: string;
  maxWidthMeters?: string;
  chainMultiplier?: string;
  smallRollMeters?: string;
  largeRollMeters?: string;
  fixedComponents?: string;
  general?: string;
}

export type InventoryStatus =
  | 'available'
  | 'reserved'
  | 'used'
  | 'discarded'
  | 'sold_scrap';

export interface FabricInventoryItem {
  id: string;
  code: string;
  family?: string;
  color: string;
  openness: string;
  imageUrl?: string | null;
  costPerYd2: number;
  widthMeters: number;
  lengthMeters: number;
  kind: 'roll' | 'scrap';
  createdAt: string;
  status: InventoryStatus;
}

export interface LinearInventoryItem {
  id: string;
  code: string;
  lengthMeters: number;
  kind: 'bar' | 'offcut';
  createdAt: string;
  status: InventoryStatus;
}

export interface ComponentInventoryItem {
  id: string;
  name: string;
  quantity: number;
  createdAt: string;
}

export interface ProductionInventory {
  fabrics: FabricInventoryItem[];
  tubes: LinearInventoryItem[];
  bottoms: LinearInventoryItem[];
  components: ComponentInventoryItem[];
}

export type InventoryMovementCategory =
  | 'fabric'
  | 'tube'
  | 'bottom'
  | 'component'
  | 'order';

export interface InventoryMovement {
  id: string;
  createdAt: string;
  orderId?: string;
  orderNumber?: string;
  category: InventoryMovementCategory;
  action:
    | 'consume'
    | 'create_scrap'
    | 'use_scrap'
    | 'discard'
    | 'reserve'
    | 'adjust'
    | 'create_order';
  itemCode: string;
  itemLabel: string;
  quantity: number;
  unit: string;
  notes?: string;
}
