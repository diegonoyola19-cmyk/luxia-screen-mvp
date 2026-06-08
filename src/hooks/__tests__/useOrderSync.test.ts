import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrderSync } from '../useOrderSync';
import { useCalculatorStore } from '../../features/calculadora-screen/store/useCalculatorStore';
import * as supabaseOrders from '../../lib/supabaseOrders';
import * as supabaseOrderInventory from '../../lib/supabaseOrderInventory';
import * as buildConsumptionPlanModule from '../../logic/buildConsumptionPlan';
import { supabase } from '../../lib/supabase';
import {
  InsufficientStockError,
  InventoryItemUnavailableError,
  OrderInventoryPermissionError,
  InvalidConsumptionPlanError,
} from '../../lib/supabaseOrderInventory';

// ─── Mocks base ───────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseOrders', () => ({
  fetchActiveOrders: vi.fn().mockResolvedValue([]),
  upsertOrders: vi.fn().mockResolvedValue(undefined),
  upsertOrder: vi.fn().mockResolvedValue(undefined),
  softDeleteOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/supabaseOrderInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof supabaseOrderInventory>();
  return {
    ...actual,
    processOrderInventoryTransaction: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../logic/buildConsumptionPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof buildConsumptionPlanModule>();
  return {
    ...actual,
    buildConsumptionPlan: vi.fn().mockReturnValue({
      orderId: 'order-1',
      orderNumber: 'ORD-1',
      generatedAt: new Date().toISOString(),
      items: [{ action: 'consume', category: 'fabric', itemCode: 'FAB-01', requiredQuantity: 5, unit: 'm', source: 'fabric_selection' }],
      warnings: [],
      metadata: {},
    }),
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  },
}));

// Helper: drain enough microtask ticks so initSync + flushQueue complete
const flush = async (ticks = 20) => {
  for (let i = 0; i < ticks; i++) {
    await new Promise(process.nextTick);
  }
};

// Helper: render hook + dispatch sync-orders event + drain
const renderAndSync = async (orders: any[], metadata: Record<string, any>) => {
  useCalculatorStore.setState({ savedOrders: orders, syncMetadata: metadata });
  const hook = renderHook(() => useOrderSync());
  await flush();
  // Trigger flushQueue a second time via event, in case initSync already ran
  await act(async () => {
    window.dispatchEvent(new Event('sync-orders'));
    await flush();
  });
  return hook;
};

// Helper: dummy order
const mockOrder = (id = 'order-1') => ({
  id,
  orderNumber: `ORD-${id}`,
  createdAt: new Date().toISOString(),
  status: 'ready_for_production',
  items: [],
} as any);

describe('useOrderSync hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCalculatorStore.setState({
      savedOrders: [],
      syncMetadata: {},
    });
    vi.mocked(supabaseOrders.fetchActiveOrders).mockResolvedValue([]);
  });

  // ─── Tests previos (comportamiento inalterado) ─────────────────────────────
  it('migrates only orders <= 90 days with valid createdAt', async () => {
    const now = Date.now();
    const validDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();

    const orders: any[] = [
      { id: '1', createdAt: validDate },
      { id: '2', createdAt: oldDate },
      { id: '3', createdAt: 'invalid' },
      { id: '4' },
    ];

    useCalculatorStore.setState({ savedOrders: orders });
    renderHook(() => useOrderSync());
    await flush();

    expect(supabaseOrders.upsertOrders).toHaveBeenCalledTimes(1);
    const upserted = vi.mocked(supabaseOrders.upsertOrders).mock.calls[0][0];
    expect(upserted).toHaveLength(1);
    expect(upserted[0].id).toBe('1');
  });

  it('merges remote orders without duplicating', async () => {
    const local = { id: '1', createdAt: new Date().toISOString() };
    const remote = { id: '1', createdAt: new Date().toISOString(), status: 'in_production' };

    useCalculatorStore.setState({ savedOrders: [local as any] });
    vi.mocked(supabaseOrders.fetchActiveOrders).mockResolvedValue([remote as any]);

    renderHook(() => useOrderSync());
    await flush();

    const store = useCalculatorStore.getState();
    expect(store.savedOrders).toHaveLength(1);
    expect(store.savedOrders[0].status).toBe('in_production');
  });

  // ─── pendingAction='upsert' (comportamiento previo intacto) ───────────────
  it('pendingAction=upsert llama upsertOrder (NO al RPC)', async () => {
    const order = mockOrder('order-upsert');
    await renderAndSync(
      [order],
      { 'order-upsert': { status: 'pending', pendingAction: 'upsert' } }
    );

    expect(supabaseOrders.upsertOrder).toHaveBeenCalledWith(order);
    expect(supabaseOrderInventory.processOrderInventoryTransaction).not.toHaveBeenCalled();
  });

  // ─── pendingAction='delete' (comportamiento previo intacto) ───────────────
  it('pendingAction=delete llama softDeleteOrder', async () => {
    await renderAndSync(
      [],
      { 'order-del': { status: 'pending', pendingAction: 'delete' } }
    );

    expect(supabaseOrders.softDeleteOrder).toHaveBeenCalledWith('order-del');
    expect(supabaseOrderInventory.processOrderInventoryTransaction).not.toHaveBeenCalled();
  });

  // ─── Nuevo flujo: upsert_with_inventory ───────────────────────────────────
  it('pendingAction=upsert_with_inventory llama buildConsumptionPlan y RPC', async () => {
    const order = mockOrder('order-inv');
    await renderAndSync(
      [order],
      { 'order-inv': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    expect(buildConsumptionPlanModule.buildConsumptionPlan).toHaveBeenCalledWith(order);
    expect(supabaseOrderInventory.processOrderInventoryTransaction).toHaveBeenCalledWith(
      order,
      expect.objectContaining({ orderId: 'order-1' })
    );
    // No debe llamar a upsertOrder (el RPC ya hace el upsert de work_orders)
    expect(supabaseOrders.upsertOrder).not.toHaveBeenCalled();
  });

  it('en éxito de RPC marca order synced con inventorySynced=true', async () => {
    const order = mockOrder('order-ok');
    await renderAndSync(
      [order],
      { 'order-ok': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    const meta = useCalculatorStore.getState().syncMetadata['order-ok'];
    expect(meta.status).toBe('synced');
    expect(meta.inventorySynced).toBe(true);
  });

  it('si inventorySynced=true, NO llama RPC y degrada a upsert simple', async () => {
    const order = mockOrder('order-idem');
    await renderAndSync(
      [order],
      { 'order-idem': { status: 'pending', pendingAction: 'upsert_with_inventory', inventorySynced: true } }
    );

    expect(supabaseOrderInventory.processOrderInventoryTransaction).not.toHaveBeenCalled();
    expect(supabaseOrders.upsertOrder).toHaveBeenCalledWith(order);
    const meta = useCalculatorStore.getState().syncMetadata['order-idem'];
    expect(meta.status).toBe('synced');
    expect(meta.inventorySynced).toBe(true);
  });

  it('si buildConsumptionPlan devuelve warnings severity=error, marca INVALID_CONSUMPTION_PLAN', async () => {
    vi.mocked(buildConsumptionPlanModule.buildConsumptionPlan).mockReturnValueOnce({
      orderId: 'order-bad',
      orderNumber: 'ORD-bad',
      generatedAt: new Date().toISOString(),
      items: [],
      warnings: [{ code: 'MISSING_FABRIC', message: 'Sin tela', severity: 'error' }],
      metadata: {},
    });

    const order = mockOrder('order-bad');
    await renderAndSync(
      [order],
      { 'order-bad': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    expect(supabaseOrderInventory.processOrderInventoryTransaction).not.toHaveBeenCalled();
    const meta = useCalculatorStore.getState().syncMetadata['order-bad'];
    expect(meta.status).toBe('error');
    expect(meta.inventoryErrorCode).toBe('INVALID_CONSUMPTION_PLAN');
  });

  it('INSUFFICIENT_STOCK se mapea a markOrderSyncError con inventoryErrorCode correcto', async () => {
    vi.mocked(supabaseOrderInventory.processOrderInventoryTransaction)
      .mockRejectedValueOnce(new InsufficientStockError('INSUFFICIENT_STOCK: No hay rollo'));

    const order = mockOrder('order-nostock');
    await renderAndSync(
      [order],
      { 'order-nostock': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    const meta = useCalculatorStore.getState().syncMetadata['order-nostock'];
    expect(meta.status).toBe('error');
    expect(meta.inventoryErrorCode).toBe('INSUFFICIENT_STOCK');
  });

  it('ITEM_NOT_AVAILABLE se mapea con inventoryErrorCode correcto', async () => {
    vi.mocked(supabaseOrderInventory.processOrderInventoryTransaction)
      .mockRejectedValueOnce(new InventoryItemUnavailableError('ITEM_NOT_AVAILABLE: Retazo usado'));

    const order = mockOrder('order-noitem');
    await renderAndSync(
      [order],
      { 'order-noitem': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    const meta = useCalculatorStore.getState().syncMetadata['order-noitem'];
    expect(meta.status).toBe('error');
    expect(meta.inventoryErrorCode).toBe('ITEM_NOT_AVAILABLE');
  });

  it('PERMISSION_DENIED se mapea con inventoryErrorCode correcto', async () => {
    vi.mocked(supabaseOrderInventory.processOrderInventoryTransaction)
      .mockRejectedValueOnce(new OrderInventoryPermissionError('PERMISSION_DENIED: Sin permiso'));

    const order = mockOrder('order-noperm');
    await renderAndSync(
      [order],
      { 'order-noperm': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    const meta = useCalculatorStore.getState().syncMetadata['order-noperm'];
    expect(meta.status).toBe('error');
    expect(meta.inventoryErrorCode).toBe('PERMISSION_DENIED');
  });

  it('error de red (sin status 4xx) mantiene la orden en pending (break de cola)', async () => {
    const networkErr = new Error('Network Error');
    // Sin status ni name especial → debe tratarse como error de red/5xx
    // Usamos mockRejectedValue (persistente) para que todos los reintentos fallen
    vi.mocked(supabaseOrderInventory.processOrderInventoryTransaction)
      .mockRejectedValue(networkErr);

    const order = mockOrder('order-net');
    await renderAndSync(
      [order],
      { 'order-net': { status: 'pending', pendingAction: 'upsert_with_inventory' } }
    );

    // Debe mantenerse pending (no cambiar a error permanente)
    const meta = useCalculatorStore.getState().syncMetadata['order-net'];
    expect(meta.status).toBe('pending');

    // Restaurar mock para no afectar otros tests
    vi.mocked(supabaseOrderInventory.processOrderInventoryTransaction)
      .mockResolvedValue(true);
  });
});
