import { describe, it, expect } from 'vitest';
import { canPerformOrderAction, canTransitionOrderStatus, getBlockedOrderReasons, type OrderWorkflowContext } from '../orderWorkflow';
import type { SavedOrder } from '../../curtains/types';

describe('orderWorkflow', () => {
  const mockOrder: SavedOrder = {
    id: '123',
    status: 'draft',
    orderNumber: 'ORD-123',
    items: [],
    createdAt: new Date().toISOString()
  };

  const defaultContext: OrderWorkflowContext = {
    isReadOnly: false,
    hasInventoryError: false,
    hasMaterialReview: true
  };

  describe('canPerformOrderAction', () => {
    it('1. Usuario read-only no puede editar', () => {
      const result = canPerformOrderAction(mockOrder, 'edit', { ...defaultContext, isReadOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('solo lectura');
    });

    it('2. Usuario read-only no puede borrar', () => {
      const result = canPerformOrderAction(mockOrder, 'delete', { ...defaultContext, isReadOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('solo lectura');
    });

    it('3. Usuario read-only no puede exportar a Sage', () => {
      const order: SavedOrder = { ...mockOrder, status: 'materials_checked' };
      const result = canPerformOrderAction(order, 'export_sage', { ...defaultContext, isReadOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('solo lectura');
    });

    it('4. Usuario read-only no puede pasar a producción', () => {
      const order: SavedOrder = { ...mockOrder, status: 'ready_for_production' };
      const result = canPerformOrderAction(order, 'send_to_production', { ...defaultContext, isReadOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('solo lectura');
    });

    it('5. Orden draft puede editarse si el usuario no es read-only', () => {
      const order: SavedOrder = { ...mockOrder, status: 'draft' };
      const result = canPerformOrderAction(order, 'edit', defaultContext);
      expect(result.allowed).toBe(true);
    });

    it('6. Orden completada no puede editarse', () => {
      const order: SavedOrder = { ...mockOrder, status: 'completed' };
      const result = canPerformOrderAction(order, 'edit', defaultContext);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Solo se pueden editar');
    });

    it('7. Orden con error de inventario no puede pasar a producción', () => {
      const order: SavedOrder = { ...mockOrder, status: 'ready_for_production' };
      const result = canPerformOrderAction(order, 'send_to_production', { ...defaultContext, hasInventoryError: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('errores de inventario');
    });

    it('8. Acción desconocida devuelve allowed false', () => {
      const result = canPerformOrderAction(mockOrder, 'unknown_action' as any, defaultContext);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Acción desconocida');
    });
  });

  describe('getBlockedOrderReasons', () => {
    it('9. getBlockedOrderReasons devuelve razones legibles', () => {
      const order: SavedOrder = { ...mockOrder, status: 'cancelled' };
      const context: OrderWorkflowContext = {
        isReadOnly: true,
        hasInventoryError: true,
        hasMaterialReview: false
      };
      const reasons = getBlockedOrderReasons(order, context);
      
      expect(reasons).toContain('Error de inventario');
      expect(reasons).toContain('Usuario sin permisos (Solo lectura)');
      expect(reasons).toContain('Orden eliminada o cancelada');
    });
  });

  describe('canTransitionOrderStatus', () => {
    it('10. canTransitionOrderStatus respeta transiciones básicas existentes', () => {
      // PDF transition: ready_for_production -> in_production
      const order: SavedOrder = { ...mockOrder, status: 'ready_for_production' };
      let result = canTransitionOrderStatus(order, 'in_production', defaultContext);
      expect(result.allowed).toBe(true);

      // read-only breaks transition to in_production
      result = canTransitionOrderStatus(order, 'in_production', { ...defaultContext, isReadOnly: true });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Permisos insuficientes');

      // sent_to_sage -> materials_checked (revertir)
      const sentOrder: SavedOrder = { ...mockOrder, status: 'sent_to_sage' };
      result = canTransitionOrderStatus(sentOrder, 'materials_checked', defaultContext);
      expect(result.allowed).toBe(true);
    });
  });
});
