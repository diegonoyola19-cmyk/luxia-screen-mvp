import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOrderToProduction, cancelOrder, completeOrder } from '../orderWorkflowActions';
import type { SavedOrder } from '../../curtains/types';
import type { OrderWorkflowContext } from '../orderWorkflow';
import * as supabaseOrderInventory from '../../../lib/supabaseOrderInventory';
import * as supabaseOrders from '../../../lib/supabaseOrders';
import { useCalculatorStore } from '../../../features/calculadora-screen/store/useCalculatorStore';

vi.mock('../../../lib/supabaseOrderInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof supabaseOrderInventory>();
  return {
    ...actual,
    reserveOrderInventory: vi.fn(),
    releaseOrderInventory: vi.fn(),
    consumeOrderInventoryReservations: vi.fn(),
  };
});

vi.mock('../../../lib/supabaseOrders', () => ({
  upsertOrder: vi.fn().mockResolvedValue(true),
  fetchActiveOrders: vi.fn().mockResolvedValue([]),
}));

describe('orderWorkflowActions', () => {
  const mockOrder: SavedOrder = {
    id: 'ord-test-100',
    orderNumber: 'ORD-100',
    status: 'ready_for_production',
    createdAt: new Date().toISOString(),
    items: [],
    productionReview: {
      reviewedAt: new Date().toISOString(),
      status: 'completed',
      adjustments: [],
      finalMaterialLines: [
        { sku: 'FABRIC-1', description: 'Screen', quantity: 10, unit: 'M2' }
      ]
    }
  };

  const validContext: OrderWorkflowContext = {
    isReadOnly: false,
    hasMaterialReview: true,
    inventoryAvailabilityResult: {
      status: 'available',
      canProceed: true,
      reasons: [],
      missingItems: [],
      insufficientItems: [],
      warnings: []
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCalculatorStore.setState({
      savedOrders: [mockOrder],
      syncMetadata: {}
    });
  });

  describe('sendOrderToProduction', () => {
    it('ejecuta reserva PRIMERO y luego actualiza el estado a in_production', async () => {
      vi.mocked(supabaseOrderInventory.reserveOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'reserved',
        order_id: mockOrder.id,
        reservations_count: 2
      });

      const res = await sendOrderToProduction(mockOrder, validContext);

      expect(supabaseOrderInventory.reserveOrderInventory).toHaveBeenCalledWith(mockOrder.id, undefined);
      expect(supabaseOrders.upsertOrder).toHaveBeenCalled();
      expect(res.status).toBe('in_production');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('in_production');
    });

    it('NO cambia el estado de la orden si la reserva falla', async () => {
      vi.mocked(supabaseOrderInventory.reserveOrderInventory).mockRejectedValueOnce(
        new supabaseOrderInventory.InsufficientStockError('Falta tela Screen 3%')
      );

      await expect(sendOrderToProduction(mockOrder, validContext)).rejects.toThrow('Falta tela Screen 3%');

      expect(supabaseOrders.upsertOrder).not.toHaveBeenCalled();
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('ready_for_production');
    });

    it('ejecuta compensación (release_order_inventory) si la actualización de estado falla post-reserva', async () => {
      vi.mocked(supabaseOrderInventory.reserveOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'reserved',
        order_id: mockOrder.id,
        reservations_count: 2
      });
      vi.mocked(supabaseOrders.upsertOrder).mockRejectedValueOnce(new Error('Network error on upsert'));
      vi.mocked(supabaseOrderInventory.releaseOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'released',
        order_id: mockOrder.id,
        released_count: 2
      });

      await expect(sendOrderToProduction(mockOrder, validContext)).rejects.toThrow('Network error on upsert');

      expect(supabaseOrderInventory.reserveOrderInventory).toHaveBeenCalledWith(mockOrder.id, undefined);
      expect(supabaseOrderInventory.releaseOrderInventory).toHaveBeenCalledWith(
        mockOrder.id,
        undefined,
        'compensation_status_update_failed'
      );
    });

    it('revierte estado local de Zustand a ready_for_production si upsertOrder falla post-reserva', async () => {
      vi.mocked(supabaseOrderInventory.reserveOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'reserved',
        order_id: mockOrder.id,
        reservations_count: 2
      });
      vi.mocked(supabaseOrders.upsertOrder).mockRejectedValueOnce(new Error('Network error on upsert'));
      vi.mocked(supabaseOrderInventory.releaseOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'released',
        order_id: mockOrder.id,
        released_count: 2
      });

      await expect(sendOrderToProduction(mockOrder, validContext)).rejects.toThrow('Network error on upsert');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('ready_for_production');
    });

    it('no oculta el error de compensación si release_order_inventory también falla', async () => {
      vi.mocked(supabaseOrderInventory.reserveOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'reserved',
        order_id: mockOrder.id,
        reservations_count: 2
      });
      vi.mocked(supabaseOrders.upsertOrder).mockRejectedValueOnce(new Error('Persist failed'));
      vi.mocked(supabaseOrderInventory.releaseOrderInventory).mockRejectedValueOnce(new Error('Compensation failed'));

      await expect(sendOrderToProduction(mockOrder, validContext)).rejects.toThrow(
        /Fallo al guardar estado de producción.*Persist failed.*falló la compensación.*Compensation failed/
      );
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('ready_for_production');
    });
  });

  describe('cancelOrder', () => {
    it('libera reservas y cambia estado a cancelled', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.releaseOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'released',
        order_id: orderInProd.id,
        released_count: 2
      });

      const res = await cancelOrder(orderInProd, validContext, { reason: 'cliente_cancelo' });

      expect(supabaseOrderInventory.releaseOrderInventory).toHaveBeenCalledWith(orderInProd.id, undefined, 'cliente_cancelo');
      expect(res.status).toBe('cancelled');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('cancelled');
    });

    it('revierte estado local de Zustand si upsertOrder falla tras release', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.releaseOrderInventory).mockResolvedValueOnce({
        ok: true,
        status: 'released',
        order_id: orderInProd.id,
        released_count: 2
      });
      vi.mocked(supabaseOrders.upsertOrder).mockRejectedValueOnce(new Error('Upsert cancelled failed'));

      await expect(cancelOrder(orderInProd, validContext)).rejects.toThrow('Upsert cancelled failed');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('in_production');
    });

    it('bloquea cancelación de orden completada', async () => {
      const completedOrder: SavedOrder = { ...mockOrder, status: 'completed' };

      await expect(cancelOrder(completedOrder, validContext)).rejects.toThrow();
      expect(supabaseOrderInventory.releaseOrderInventory).not.toHaveBeenCalled();
    });
  });

  describe('completeOrder', () => {
    it('consume reservas y marca estado como completed', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.consumeOrderInventoryReservations).mockResolvedValueOnce({
        ok: true,
        status: 'consumed',
        order_id: orderInProd.id,
        consumed_count: 2
      });

      const res = await completeOrder(orderInProd, validContext);

      expect(supabaseOrderInventory.consumeOrderInventoryReservations).toHaveBeenCalledWith(orderInProd.id, undefined);
      expect(res.status).toBe('completed');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('completed');
    });

    it('soporta reintento cuando el estado del consumo es already_consumed', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.consumeOrderInventoryReservations).mockResolvedValueOnce({
        ok: true,
        status: 'already_consumed',
        order_id: orderInProd.id,
        consumed_count: 0
      });

      const res = await completeOrder(orderInProd, validContext);

      expect(res.status).toBe('completed');
      expect(res.reservationStatus).toBe('already_consumed');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('completed');
    });

    it('NO marca completed si el consumo de reservas falla', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.consumeOrderInventoryReservations).mockRejectedValueOnce(
        new supabaseOrderInventory.OrderInventoryRpcError('No active reservations to consume')
      );

      await expect(completeOrder(orderInProd, validContext)).rejects.toThrow('No active reservations to consume');

      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('in_production');
    });

    it('revierte estado local de Zustand si upsertOrder falla post-consumo', async () => {
      const orderInProd: SavedOrder = { ...mockOrder, status: 'in_production' };
      useCalculatorStore.setState({ savedOrders: [orderInProd] });

      vi.mocked(supabaseOrderInventory.consumeOrderInventoryReservations).mockResolvedValueOnce({
        ok: true,
        status: 'consumed',
        order_id: orderInProd.id,
        consumed_count: 2
      });
      vi.mocked(supabaseOrders.upsertOrder).mockRejectedValueOnce(new Error('Upsert completed failed'));

      await expect(completeOrder(orderInProd, validContext)).rejects.toThrow('Upsert completed failed');
      expect(useCalculatorStore.getState().savedOrders[0].status).toBe('in_production');
    });
  });
});
