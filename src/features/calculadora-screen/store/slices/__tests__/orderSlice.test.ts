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
