export type InventoryCategory = 'fabric' | 'tube' | 'bottom' | 'component';
export type InventoryKind = 'roll' | 'scrap' | 'bar' | 'offcut' | 'unit';
export type InventoryStatus = 'available' | 'reserved' | 'used' | 'discarded' | 'deleted';
export type InventoryAction = 'import' | 'adjust' | 'reserve' | 'consume' | 'create_scrap' | 'use_scrap' | 'discard' | 'transfer' | 'rollback';

export interface InventoryItemPayload {
  widthMeters?: number;
  heightMeters?: number;
  lengthMeters?: number;
  color?: string;
  family?: string;
  openness?: string;
  [key: string]: any;
}

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  kind: InventoryKind;
  code: string;
  status: InventoryStatus;
  payload: InventoryItemPayload;
  created_from_order_id: string | null;
  source: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface InventoryMovementPayload {
  [key: string]: any;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string | null;
  order_id: string | null;
  category: InventoryCategory;
  action: InventoryAction;
  item_code: string;
  quantity: number;
  unit: string;
  notes: string | null;
  payload: InventoryMovementPayload;
  created_at?: string;
  created_by?: string | null;
}

export type CreateInventoryItemInput = Omit<InventoryItem, 'created_at' | 'updated_at' | 'deleted_at' | 'created_by' | 'updated_by'>;
export type UpdateInventoryItemInput = Partial<CreateInventoryItemInput>;
export type CreateInventoryMovementInput = Omit<InventoryMovement, 'created_at' | 'created_by'>;
