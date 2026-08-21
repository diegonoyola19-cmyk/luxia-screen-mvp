import { supabase } from './supabase';
import { toast } from 'sonner';
import type { SavedOrder } from '../domain/curtains/types';
import type { ConsumptionPlan } from '../logic/buildConsumptionPlan';
import { useAuthStore } from '../store/useAuthStore';

export interface ReservationRpcResult {
  ok: boolean;
  status: string;
  order_id: string;
  reservations_count?: number;
  released_count?: number;
  consumed_count?: number;
  message?: string;
}

export class OrderInventoryRpcError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'OrderInventoryRpcError';
  }
}

export class OrderInventoryPermissionError extends OrderInventoryRpcError {
  constructor(message: string = 'Permiso denegado para afectar inventario') {
    super(message, 'PERMISSION_DENIED');
    this.name = 'OrderInventoryPermissionError';
  }
}

export class InsufficientStockError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_STOCK');
    this.name = 'InsufficientStockError';
  }
}

export class InvalidConsumptionPlanError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INVALID_CONSUMPTION_PLAN');
    this.name = 'InvalidConsumptionPlanError';
  }
}

export class InvalidOrderError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'INVALID_ORDER');
    this.name = 'InvalidOrderError';
  }
}

export class InventoryItemUnavailableError extends OrderInventoryRpcError {
  constructor(message: string) {
    super(message, 'ITEM_NOT_AVAILABLE');
    this.name = 'InventoryItemUnavailableError';
  }
}

function mapRpcError(error: any): never {
  const msg = error.message || '';
  const code = error.code || '';

  if (code === '42501' || msg.includes('PERMISSION_DENIED')) {
    throw new OrderInventoryPermissionError(msg);
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    throw new InsufficientStockError(msg);
  }
  if (msg.includes('INVALID_CONSUMPTION_PLAN')) {
    throw new InvalidConsumptionPlanError(msg);
  }
  if (msg.includes('INVALID_ORDER')) {
    throw new InvalidOrderError(msg);
  }
  if (msg.includes('ITEM_NOT_AVAILABLE')) {
    throw new InventoryItemUnavailableError(msg);
  }

  throw new OrderInventoryRpcError(msg || 'Error desconocido al procesar inventario de la orden', code);
}

export async function reserveOrderInventory(
  orderId: string,
  userId?: string
): Promise<ReservationRpcResult> {
  const effectiveUserId = userId ?? useAuthStore.getState().user?.id ?? null;
  const { data, error } = await supabase.rpc('reserve_order_inventory', {
    p_order_id: orderId,
    p_user_id: effectiveUserId
  });

  if (error) {
    mapRpcError(error);
  }

  const result = data as ReservationRpcResult | null;
  if (!result || result.ok === false) {
    throw new OrderInventoryRpcError(
      result?.message || 'Error al reservar inventario de la orden',
      result?.status || 'RESERVATION_FAILED'
    );
  }

  return result;
}

export async function releaseOrderInventory(
  orderId: string,
  userId?: string,
  reason?: string
): Promise<ReservationRpcResult> {
  const effectiveUserId = userId ?? useAuthStore.getState().user?.id ?? null;
  const { data, error } = await supabase.rpc('release_order_inventory', {
    p_order_id: orderId,
    p_user_id: effectiveUserId,
    p_reason: reason ?? 'manual_release'
  });

  if (error) {
    mapRpcError(error);
  }

  const result = data as ReservationRpcResult | null;
  if (!result || result.ok === false) {
    throw new OrderInventoryRpcError(
      result?.message || 'Error al liberar reservas de inventario de la orden',
      result?.status || 'RELEASE_FAILED'
    );
  }

  return result;
}

export async function consumeOrderInventoryReservations(
  orderId: string,
  userId?: string
): Promise<ReservationRpcResult> {
  const effectiveUserId = userId ?? useAuthStore.getState().user?.id ?? null;
  const { data, error } = await supabase.rpc('consume_order_inventory_reservations', {
    p_order_id: orderId,
    p_user_id: effectiveUserId
  });

  if (error) {
    mapRpcError(error);
  }

  const result = data as ReservationRpcResult | null;
  if (!result || result.ok === false) {
    throw new OrderInventoryRpcError(
      result?.message || 'Error al consumir reservas de inventario de la orden',
      result?.status || 'CONSUME_FAILED'
    );
  }

  return result;
}

export interface ReconcileResultDetail {
  reservation_id: string;
  order_id: string;
  sku: string;
  action: 'released' | 'consumed' | 'unchanged' | 'flagged';
  reason: string;
  previous_status: string;
  is_stale: boolean;
}

export interface ReconcileInventoryResult {
  ok: boolean;
  dry_run: boolean;
  scanned: number;
  released: number;
  consumed: number;
  unchanged: number;
  flagged: number;
  errors: number;
  grace_minutes: number;
  limit: number;
  details: ReconcileResultDetail[];
}

export async function reconcileInventoryReservations(options?: {
  dryRun?: boolean;
  limit?: number;
  graceMinutes?: number;
}): Promise<ReconcileInventoryResult> {
  const { data, error } = await supabase.rpc('reconcile_inventory_reservations', {
    p_dry_run: options?.dryRun ?? false,
    p_limit: options?.limit ?? 200,
    p_grace_minutes: options?.graceMinutes ?? 30,
  });

  if (error) {
    mapRpcError(error);
  }

  return data as ReconcileInventoryResult;
}

export async function processOrderInventoryTransaction(
  orderPayload: SavedOrder,
  consumptionPlan: ConsumptionPlan
): Promise<boolean> {
  const { error } = await supabase.rpc('process_order_inventory_tx', {
    p_order_payload: orderPayload,
    p_consumption_plan: consumptionPlan
  });

  if (error) {
    mapRpcError(error);
  }

  return true;
}

export async function commitIssueSnapshotToInventory(order: SavedOrder): Promise<void> {
  const snapshot = order.productionReview?.issueSnapshot;

  // 1. Idempotencia: Consultar si ya se materializaron retazos o mermas para esta orden
  const { data: existingItems } = await supabase
    .from('inventory_items')
    .select('id, payload')
    .eq('created_from_order_id', order.id);

  const existingStableIds = new Set(
    (existingItems || []).map(item => item.payload?.stable_id || item.payload?.curtain_item_id || item.id)
  );

  // 2. Materializar retazos lineales reutilizables (>= 1.00m / 3.28084 ft)
  if (snapshot?.createdRemainders && snapshot.createdRemainders.length > 0) {
    const reusableRemainders = snapshot.createdRemainders.filter(
      r => r.remainingLengthFt && r.remainingLengthFt >= 3.28084 && !existingStableIds.has(r.id)
    );

    if (reusableRemainders.length > 0) {
      const itemsToInsert = reusableRemainders.map(r => {
        const itemId = r.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) 
          ? r.id 
          : crypto.randomUUID();
        const category = r.sku.includes('TU-') ? 'tube' : r.sku.includes('AL-') || r.sku.includes('CLZ') ? 'bottom' : 'component';

        return {
          id: itemId,
          category,
          kind: 'unit',
          code: r.sku,
          status: 'available',
          created_from_order_id: order.id,
          source: 'production_cut',
          payload: {
            length_feet: r.remainingLengthFt,
            length_meters: r.remainingLengthFt / 3.28084,
            available_quantity: 1,
            unit: 'FT',
            code: r.sku,
            description: r.description,
            stable_id: r.id
          }
        };
      });

      const { error: insertErr } = await supabase.from('inventory_items').insert(itemsToInsert);

      if (insertErr) {
        console.error('[commitIssueSnapshotToInventory] Error inserting linear remainders:', insertErr);
        toast.error(`No se pudieron guardar los sobrantes en Bodega: ${insertErr.message}`);
      } else {
        const movements = itemsToInsert.map(item => ({
          inventory_item_id: item.id,
          order_id: order.id,
          category: item.category,
          action: 'create_scrap',
          item_code: item.code,
          quantity: item.payload.length_feet,
          unit: 'FT',
          notes: 'Retazo lineal reutilizable generado en producción',
          payload: { stable_id: item.payload.stable_id, source_order_id: order.id }
        }));
        await supabase.from('inventory_movements').insert(movements);
      }
    }
  }

  // 3. Registrar mermas/descartes lineales (< 1.00m / 3.28084 ft)
  if (snapshot?.discardedLinearRemainders && snapshot.discardedLinearRemainders.length > 0) {
    const { data: existingMovements } = await supabase
      .from('inventory_movements')
      .select('payload')
      .eq('order_id', order.id)
      .eq('action', 'discard');

    const existingBars = new Set((existingMovements || []).map(m => m.payload?.bar_index));

    const discardsToInsert = snapshot.discardedLinearRemainders
      .filter(d => d.lengthFt > 0 && !existingBars.has(d.barIndex))
      .map(d => ({
        inventory_item_id: null,
        order_id: order.id,
        category: d.materialKind || 'tube',
        action: 'discard',
        item_code: d.sku,
        quantity: d.lengthFt,
        unit: 'FT',
        notes: d.reason || 'Merma de producción (< 1.00m)',
        payload: { bar_index: d.barIndex, source_order_id: order.id }
      }));

    if (discardsToInsert.length > 0) {
      await supabase.from('inventory_movements').insert(discardsToInsert);
    }
  }

  // 4. Materializar retazos de tela (>= 0.50m por lado)
  if (order.items && order.items.length > 0) {
    const fabricScrapsToInsert: any[] = [];
    const fabricMovementsToInsert: any[] = [];

    for (const item of order.items) {
      const wM = item.result?.wastePieceWidthMeters ?? 0;
      const hM = item.result?.wastePieceHeightMeters ?? 0;
      const fabCode = item.result?.selectedFabric?.itemCode;

      if (wM >= 0.50 && hM >= 0.50 && fabCode && !existingStableIds.has(item.id)) {
        const scrapId = crypto.randomUUID();
        const areaYd2 = wM * hM * 1.19599;

        fabricScrapsToInsert.push({
          id: scrapId,
          category: 'fabric',
          kind: 'scrap',
          code: fabCode,
          status: 'available',
          created_from_order_id: order.id,
          source: 'production_cut',
          payload: {
            width_meters: wM,
            length_meters: hM,
            area_meters: wM * hM,
            available_yd2: areaYd2,
            family: item.result?.selectedFabric?.family || '',
            color: item.result?.selectedFabric?.color || '',
            curtain_item_id: item.id
          }
        });

        fabricMovementsToInsert.push({
          inventory_item_id: scrapId,
          order_id: order.id,
          category: 'fabric',
          action: 'create_scrap',
          item_code: fabCode,
          quantity: areaYd2,
          unit: 'YD2',
          notes: 'Retazo de tela generado en producción',
          payload: { curtain_item_id: item.id, source_order_id: order.id }
        });
      }
    }

    if (fabricScrapsToInsert.length > 0) {
      const { error: fabErr } = await supabase.from('inventory_items').insert(fabricScrapsToInsert);
      if (!fabErr) {
        await supabase.from('inventory_movements').insert(fabricMovementsToInsert);
      }
    }
  }
}


