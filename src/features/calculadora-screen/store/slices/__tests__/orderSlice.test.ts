import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { CalculatorStore } from '../../types';
import { createOrderSlice } from '../orderSlice';

describe('orderSlice - deleteSavedOrder', () => {
  let useStore: any;

  beforeEach(() => {
    useStore = create<CalculatorStore>()((...a) => ({
      ...createOrderSlice(...a),
      // Mock other slices that might be needed, though orderSlice uses very few for deleteSavedOrder
      theme: 'light',
      activeView: 'orders',
      productionInventory: { fabrics: [] },
      inventoryMovements: [],
      ruleConfig: {} as any,
    } as any));
  });

  it('elimina una orden por id', () => {
    const store = useStore.getState();
    const mockOrder1 = { id: 'test-1', orderNumber: 'TEST-1' } as any;
    const mockOrder2 = { id: 'test-2', orderNumber: 'TEST-2' } as any;

    useStore.setState({ savedOrders: [mockOrder1, mockOrder2] });

    useStore.getState().deleteSavedOrder('test-1');

    const updatedOrders = useStore.getState().savedOrders;
    expect(updatedOrders).toHaveLength(1);
    expect(updatedOrders[0].id).toBe('test-2');
  });

  it('no elimina otras órdenes', () => {
    const mockOrder1 = { id: 'test-1', orderNumber: 'TEST-1' } as any;
    const mockOrder2 = { id: 'test-2', orderNumber: 'TEST-2' } as any;

    useStore.setState({ savedOrders: [mockOrder1, mockOrder2] });

    useStore.getState().deleteSavedOrder('unknown-id');

    expect(useStore.getState().savedOrders).toHaveLength(2);
  });

  it('limpia la selección (selectedOrderId) si la orden eliminada estaba seleccionada', () => {
    const mockOrder1 = { id: 'test-1', orderNumber: 'TEST-1' } as any;
    const mockOrder2 = { id: 'test-2', orderNumber: 'TEST-2' } as any;

    useStore.setState({ savedOrders: [mockOrder1, mockOrder2], selectedOrderId: 'test-1' });

    useStore.getState().deleteSavedOrder('test-1');

    expect(useStore.getState().selectedOrderId).toBeNull();
  });

  it('no limpia la selección si la orden eliminada NO estaba seleccionada', () => {
    const mockOrder1 = { id: 'test-1', orderNumber: 'TEST-1' } as any;
    const mockOrder2 = { id: 'test-2', orderNumber: 'TEST-2' } as any;

    useStore.setState({ savedOrders: [mockOrder1, mockOrder2], selectedOrderId: 'test-2' });

    useStore.getState().deleteSavedOrder('test-1');

    expect(useStore.getState().selectedOrderId).toBe('test-2');
  });

  it('no modifica remainders ni productionInventory', () => {
    const mockOrder = { id: 'test-1', orderNumber: 'TEST-1' } as any;
    const initialRemainders = [{ id: 'rem-1' }] as any;
    const initialInventory = { fabrics: [{ id: 'fab-1' }] } as any;

    useStore.setState({ 
      savedOrders: [mockOrder], 
      remainders: initialRemainders,
      productionInventory: initialInventory
    });

    useStore.getState().deleteSavedOrder('test-1');

    expect(useStore.getState().remainders).toBe(initialRemainders);
    expect(useStore.getState().productionInventory).toBe(initialInventory);
  });
});

// ─── Tests de Subfase 5B.8.D1: helpers de syncMetadata extendidos ──────────────
describe('orderSlice - syncMetadata helpers extendidos (D1)', () => {
  let useStore: any;

  beforeEach(() => {
    useStore = create<CalculatorStore>()((...a) => ({
      ...createOrderSlice(...a),
      theme: 'light',
      activeView: 'orders',
      productionInventory: { fabrics: [] },
      inventoryMovements: [],
      ruleConfig: {} as any,
    } as any));
  });

  // markOrderPending
  it('markOrderPending acepta upsert_with_inventory como pendingAction', () => {
    useStore.getState().markOrderPending('order-1', 'upsert_with_inventory');
    const meta = useStore.getState().syncMetadata['order-1'];
    expect(meta.status).toBe('pending');
    expect(meta.pendingAction).toBe('upsert_with_inventory');
  });

  it('markOrderPending acepta upsert (comportamiento previo intacto)', () => {
    useStore.getState().markOrderPending('order-2', 'upsert');
    const meta = useStore.getState().syncMetadata['order-2'];
    expect(meta.status).toBe('pending');
    expect(meta.pendingAction).toBe('upsert');
  });

  it('markOrderPending acepta delete (comportamiento previo intacto)', () => {
    useStore.getState().markOrderPending('order-3', 'delete');
    const meta = useStore.getState().syncMetadata['order-3'];
    expect(meta.status).toBe('pending');
    expect(meta.pendingAction).toBe('delete');
  });

  // markOrderSynced con inventorySynced
  it('markOrderSynced acepta options.inventorySynced = true y lo persiste', () => {
    useStore.getState().markOrderSynced('order-1', { inventorySynced: true });
    const meta = useStore.getState().syncMetadata['order-1'];
    expect(meta.status).toBe('synced');
    expect(meta.inventorySynced).toBe(true);
  });

  it('markOrderSynced sin options NO incluye inventorySynced (comportamiento previo intacto)', () => {
    useStore.getState().markOrderSynced('order-2');
    const meta = useStore.getState().syncMetadata['order-2'];
    expect(meta.status).toBe('synced');
    expect(meta.inventorySynced).toBeUndefined();
  });

  it('markOrderSynced con inventorySynced = false lo persiste', () => {
    useStore.getState().markOrderSynced('order-3', { inventorySynced: false });
    const meta = useStore.getState().syncMetadata['order-3'];
    expect(meta.inventorySynced).toBe(false);
  });

  // markOrderSyncError con inventoryErrorCode
  it('markOrderSyncError acepta inventoryErrorCode y lo persiste', () => {
    useStore.getState().markOrderSyncError('order-1', 'No hay stock', 'INSUFFICIENT_STOCK');
    const meta = useStore.getState().syncMetadata['order-1'];
    expect(meta.status).toBe('error');
    expect(meta.errorMessage).toBe('No hay stock');
    expect(meta.inventoryErrorCode).toBe('INSUFFICIENT_STOCK');
  });

  it('markOrderSyncError sin inventoryErrorCode NO incluye el campo (comportamiento previo intacto)', () => {
    useStore.getState().markOrderSyncError('order-2', 'Error genérico');
    const meta = useStore.getState().syncMetadata['order-2'];
    expect(meta.status).toBe('error');
    expect(meta.errorMessage).toBe('Error genérico');
    expect(meta.inventoryErrorCode).toBeUndefined();
  });

  it('markOrderSyncError preserva otros campos del estado previo', () => {
    useStore.getState().markOrderPending('order-1', 'upsert_with_inventory');
    useStore.getState().markOrderSyncError('order-1', 'Fallo RPC', 'ITEM_NOT_AVAILABLE');
    const meta = useStore.getState().syncMetadata['order-1'];
    // El pendingAction anterior debe preservarse
    expect(meta.pendingAction).toBe('upsert_with_inventory');
    expect(meta.inventoryErrorCode).toBe('ITEM_NOT_AVAILABLE');
  });
});
