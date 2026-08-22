import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import { 
  processOrderInventoryTransaction,
  cancelOrderInventoryTransaction,
  OrderInventoryPermissionError, 
  InsufficientStockError, 
  InvalidConsumptionPlanError, 
  InvalidOrderError, 
  InventoryItemUnavailableError, 
  ScrapAlreadyUsedError,
  CannotCancelCompletedOrderError,
  OrderInventoryRpcError 
} from '../supabaseOrderInventory';
import type { SavedOrder } from '../../domain/curtains/types';
import type { ConsumptionPlan } from '../../logic/buildConsumptionPlan';

vi.mock('../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('processOrderInventoryTransaction', () => {
  const dummyOrder: SavedOrder = { id: 'o1', orderNumber: 'ORD-1', status: 'draft', items: [], createdAt: '2023' } as any;
  const dummyPlan: ConsumptionPlan = { orderId: 'o1', orderNumber: 'ORD-1', generatedAt: '2023', items: [], warnings: [], metadata: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Llama a supabase.rpc con nombre process_order_inventory_tx', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
    
    await processOrderInventoryTransaction(dummyOrder, dummyPlan);
    
    expect(supabase.rpc).toHaveBeenCalledWith('process_order_inventory_tx', {
      p_order_payload: dummyOrder,
      p_consumption_plan: dummyPlan
    });
  });

  it('Envía p_order_payload y p_consumption_plan correctamente', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
    
    const cloneOrder = JSON.parse(JSON.stringify(dummyOrder));
    const clonePlan = JSON.parse(JSON.stringify(dummyPlan));

    await processOrderInventoryTransaction(dummyOrder, dummyPlan);

    // No muta los objetos originales
    expect(dummyOrder).toEqual(cloneOrder);
    expect(dummyPlan).toEqual(clonePlan);
  });

  it('Retorna éxito cuando Supabase no devuelve error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
    
    const result = await processOrderInventoryTransaction(dummyOrder, dummyPlan);
    expect(result).toBe(true);
  });

  it('Mapea PERMISSION_DENIED a error de permisos', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'PERMISSION_DENIED: Se requiere permiso', code: '' } 
    } as any);
    
    await expect(processOrderInventoryTransaction(dummyOrder, dummyPlan))
      .rejects.toThrow(OrderInventoryPermissionError);
  });

  it('Mapea INSUFFICIENT_STOCK a error de stock', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'INSUFFICIENT_STOCK: No hay rollo', code: '' } 
    } as any);
    
    await expect(processOrderInventoryTransaction(dummyOrder, dummyPlan))
      .rejects.toThrow(InsufficientStockError);
  });

  it('Mapea ITEM_NOT_AVAILABLE a error de item no disponible', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'ITEM_NOT_AVAILABLE: Retazo usado', code: '' } 
    } as any);
    
    await expect(processOrderInventoryTransaction(dummyOrder, dummyPlan))
      .rejects.toThrow(InventoryItemUnavailableError);
  });

  it('Mapea INVALID_CONSUMPTION_PLAN a error claro', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'INVALID_CONSUMPTION_PLAN: Faltan datos', code: '' } 
    } as any);
    
    await expect(processOrderInventoryTransaction(dummyOrder, dummyPlan))
      .rejects.toThrow(InvalidConsumptionPlanError);
  });

  it('Mapea error RLS 42501 a error de permisos', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'new row violates row-level security policy', code: '42501' } 
    } as any);
    
    await expect(processOrderInventoryTransaction(dummyOrder, dummyPlan))
      .rejects.toThrow(OrderInventoryPermissionError);
  });

  it('Propaga error genérico con mensaje útil', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ 
      data: null, 
      error: { message: 'Error raro en el servidor', code: '500' } 
    } as any);
    
    const promise = processOrderInventoryTransaction(dummyOrder, dummyPlan);
    await expect(promise).rejects.toThrow(OrderInventoryRpcError);
    await expect(promise).rejects.toThrow('Error raro en el servidor');
  });

  it('No muta orderPayload ni consumptionPlan', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
    
    const orderRef = dummyOrder;
    const planRef = dummyPlan;

    await processOrderInventoryTransaction(dummyOrder, dummyPlan);

    expect(orderRef).toBe(dummyOrder);
    expect(planRef).toBe(dummyPlan);
  });
});

describe('cancelOrderInventoryTransaction', () => {
  it('Llama a supabase.rpc con cancel_order_inventory_tx y p_order_id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);
    
    const res = await cancelOrderInventoryTransaction('test-order-uuid');
    expect(res).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_order_inventory_tx', {
      p_order_id: 'test-order-uuid'
    });
  });

  it('Mapea PERMISSION_DENIED en cancelación', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'PERMISSION_DENIED: No tienes permisos', code: '42501' }
    } as any);

    await expect(cancelOrderInventoryTransaction('test-order-uuid'))
      .rejects.toThrow(OrderInventoryPermissionError);
  });

  it('Mapea SCRAP_ALREADY_USED cuando un retazo derivado ya fue consumido por otra orden', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'SCRAP_ALREADY_USED: No se puede cancelar porque el retazo ya fue consumido', code: 'P0001' }
    } as any);

    await expect(cancelOrderInventoryTransaction('test-order-with-used-scrap'))
      .rejects.toThrow(ScrapAlreadyUsedError);
  });

  it('Mapea CANNOT_CANCEL_COMPLETED_ORDER cuando la orden ya fue completada', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'CANNOT_CANCEL_COMPLETED_ORDER: La orden ya fue completada', code: 'P0001' }
    } as any);

    await expect(cancelOrderInventoryTransaction('test-completed-order'))
      .rejects.toThrow(CannotCancelCompletedOrderError);
  });
});
