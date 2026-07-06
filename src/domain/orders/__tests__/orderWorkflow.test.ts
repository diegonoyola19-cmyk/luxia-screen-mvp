import { describe, it, expect } from 'vitest';
import {
  canPerformOrderAction,
  canTransitionOrderStatus,
  getBlockedOrderReasons,
  type OrderWorkflowContext,
} from '../orderWorkflow';
import type { SavedOrder } from '../../curtains/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseOrder: SavedOrder = {
  id: '123',
  status: 'draft',
  orderNumber: 'ORD-123',
  items: [],
  createdAt: new Date().toISOString(),
};

const order = (status: string): SavedOrder => ({ ...baseOrder, status: status as any });

const inventoryOk: OrderWorkflowContext['inventoryAvailabilityResult'] = {
  canProceed: true,
  reasons: [],
};

const inventoryFail: OrderWorkflowContext['inventoryAvailabilityResult'] = {
  canProceed: false,
  reasons: ['Stock insuficiente para SKU 0-154-TU-38111'],
};

const defaultCtx: OrderWorkflowContext = {
  isReadOnly: false,
  hasInventoryError: false,
  hasMaterialReview: true,
  inventoryAvailabilityResult: inventoryOk,
};

// ─── canPerformOrderAction ─────────────────────────────────────────────────

describe('canPerformOrderAction', () => {
  describe('Permisos de solo lectura', () => {
    it('read-only no puede editar', () => {
      const r = canPerformOrderAction(order('draft'), 'edit', { ...defaultCtx, isReadOnly: true });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('solo lectura');
    });

    it('read-only no puede borrar', () => {
      const r = canPerformOrderAction(order('draft'), 'delete', { ...defaultCtx, isReadOnly: true });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('solo lectura');
    });

    it('read-only no puede exportar a Sage', () => {
      const r = canPerformOrderAction(order('materials_checked'), 'export_sage', { ...defaultCtx, isReadOnly: true });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('solo lectura');
    });

    it('read-only no puede pasar a producción', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', { ...defaultCtx, isReadOnly: true });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('solo lectura');
    });
  });

  describe('Edición', () => {
    it('draft puede editarse', () => {
      expect(canPerformOrderAction(order('draft'), 'edit', defaultCtx).allowed).toBe(true);
    });

    it('completed no puede editarse', () => {
      const r = canPerformOrderAction(order('completed'), 'edit', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('Solo se pueden editar');
    });

    it('in_production no puede editarse', () => {
      const r = canPerformOrderAction(order('in_production'), 'edit', defaultCtx);
      expect(r.allowed).toBe(false);
    });
  });

  describe('Delete — bloqueo en estados activos / terminales', () => {
    it('draft puede borrarse', () => {
      expect(canPerformOrderAction(order('draft'), 'delete', defaultCtx).allowed).toBe(true);
    });

    it('in_production NO puede borrarse', () => {
      const r = canPerformOrderAction(order('in_production'), 'delete', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('producción');
    });

    it('completed NO puede borrarse', () => {
      const r = canPerformOrderAction(order('completed'), 'delete', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('completada');
    });
  });

  describe('send_to_production — reglas estrictas', () => {
    it('pasa cuando materiales OK e inventario disponible', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', {
        ...defaultCtx,
        hasMaterialReview: true,
        inventoryAvailabilityResult: inventoryOk,
      });
      expect(r.allowed).toBe(true);
    });

    it('falla si la orden no está en ready_for_production', () => {
      const r = canPerformOrderAction(order('draft'), 'send_to_production', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('Lista para Producción');
    });

    it('falla si hasMaterialReview es false', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', {
        ...defaultCtx,
        hasMaterialReview: false,
        inventoryAvailabilityResult: inventoryOk,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('materiales confirmados');
    });

    it('falla si inventoryAvailabilityResult es undefined (no verificado)', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', {
        ...defaultCtx,
        hasMaterialReview: true,
        inventoryAvailabilityResult: undefined,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('verificar disponibilidad');
    });

    it('falla si inventario insuficiente', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', {
        ...defaultCtx,
        hasMaterialReview: true,
        inventoryAvailabilityResult: inventoryFail,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('Stock insuficiente');
    });

    it('falla si hasInventoryError sin inventoryAvailabilityResult', () => {
      const r = canPerformOrderAction(order('ready_for_production'), 'send_to_production', {
        isReadOnly: false,
        hasMaterialReview: true,
        hasInventoryError: true,
        inventoryAvailabilityResult: undefined,
      });
      expect(r.allowed).toBe(false);
    });
  });

  describe('confirm_materials', () => {
    it('permite en draft', () => {
      expect(canPerformOrderAction(order('draft'), 'confirm_materials', defaultCtx).allowed).toBe(true);
    });

    it('permite en ready_for_production', () => {
      expect(canPerformOrderAction(order('ready_for_production'), 'confirm_materials', defaultCtx).allowed).toBe(true);
    });

    it('permite en materials_checked', () => {
      expect(canPerformOrderAction(order('materials_checked'), 'confirm_materials', defaultCtx).allowed).toBe(true);
    });

    it('NO permite en in_production', () => {
      const r = canPerformOrderAction(order('in_production'), 'confirm_materials', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('in_production');
    });

    it('NO permite en completed', () => {
      const r = canPerformOrderAction(order('completed'), 'confirm_materials', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('completed');
    });

    it('NO permite en cancelled', () => {
      const r = canPerformOrderAction(order('cancelled'), 'confirm_materials', defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('cancelled');
    });
  });

  describe('Acción desconocida', () => {
    it('devuelve allowed false', () => {
      const r = canPerformOrderAction(order('draft'), 'unknown_action' as any, defaultCtx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('Acción desconocida');
    });
  });
});

// ─── canTransitionOrderStatus — allowlist estricta ─────────────────────────

describe('canTransitionOrderStatus — bloqueos requeridos', () => {
  describe('Estado terminal: completed', () => {
    it('completed -> draft está bloqueado', () => {
      expect(canTransitionOrderStatus(order('completed'), 'draft', defaultCtx).allowed).toBe(false);
    });

    it('completed -> ready_for_production está bloqueado', () => {
      expect(canTransitionOrderStatus(order('completed'), 'ready_for_production', defaultCtx).allowed).toBe(false);
    });

    it('completed -> in_production está bloqueado', () => {
      expect(canTransitionOrderStatus(order('completed'), 'in_production', defaultCtx).allowed).toBe(false);
    });

    it('completed -> cancelled está bloqueado', () => {
      expect(canTransitionOrderStatus(order('completed'), 'cancelled', defaultCtx).allowed).toBe(false);
    });
  });

  describe('Estado cancelled', () => {
    it('cancelled -> in_production está bloqueado', () => {
      expect(canTransitionOrderStatus(order('cancelled'), 'in_production', defaultCtx).allowed).toBe(false);
    });

    it('cancelled -> completed está bloqueado', () => {
      expect(canTransitionOrderStatus(order('cancelled'), 'completed', defaultCtx).allowed).toBe(false);
    });

    it('cancelled -> draft está permitido (reactivar)', () => {
      expect(canTransitionOrderStatus(order('cancelled'), 'draft', defaultCtx).allowed).toBe(true);
    });
  });

  describe('Saltos directos inválidos', () => {
    it('draft -> in_production directo está bloqueado', () => {
      expect(canTransitionOrderStatus(order('draft'), 'in_production', defaultCtx).allowed).toBe(false);
    });

    it('ready_for_production -> completed directo está bloqueado', () => {
      expect(canTransitionOrderStatus(order('ready_for_production'), 'completed', defaultCtx).allowed).toBe(false);
    });
  });

  describe('Regresiones inválidas desde in_production', () => {
    it('in_production -> draft está bloqueado', () => {
      expect(canTransitionOrderStatus(order('in_production'), 'draft', defaultCtx).allowed).toBe(false);
    });

    it('in_production -> ready_for_production está bloqueado', () => {
      expect(canTransitionOrderStatus(order('in_production'), 'ready_for_production', defaultCtx).allowed).toBe(false);
    });

    it('in_production -> materials_checked está bloqueado', () => {
      expect(canTransitionOrderStatus(order('in_production'), 'materials_checked', defaultCtx).allowed).toBe(false);
    });
  });

  describe('Transiciones válidas del flujo nominal', () => {
    it('draft -> ready_for_production (confirm materials)', () => {
      expect(canTransitionOrderStatus(order('draft'), 'ready_for_production', defaultCtx).allowed).toBe(true);
    });

    it('ready_for_production -> in_production (envío a producción)', () => {
      expect(canTransitionOrderStatus(order('ready_for_production'), 'in_production', defaultCtx).allowed).toBe(true);
    });

    it('in_production -> completed', () => {
      expect(canTransitionOrderStatus(order('in_production'), 'completed', defaultCtx).allowed).toBe(true);
    });

    it('sent_to_sage -> materials_checked (revertir)', () => {
      expect(canTransitionOrderStatus(order('sent_to_sage'), 'materials_checked', defaultCtx).allowed).toBe(true);
    });
  });

  describe('Restricciones de contexto en transiciones válidas', () => {
    it('read-only bloquea transición a in_production aunque esté en allowlist', () => {
      const r = canTransitionOrderStatus(order('ready_for_production'), 'in_production', {
        ...defaultCtx,
        isReadOnly: true,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('Permisos insuficientes');
    });

    it('inventario insuficiente bloquea transición a in_production', () => {
      const r = canTransitionOrderStatus(order('ready_for_production'), 'in_production', {
        ...defaultCtx,
        inventoryAvailabilityResult: inventoryFail,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('inventario');
    });
  });
});

// ─── getBlockedOrderReasons ─────────────────────────────────────────────────

describe('getBlockedOrderReasons', () => {
  it('acumula razones de inventario, readonly y estado terminal', () => {
    const reasons = getBlockedOrderReasons(order('cancelled'), {
      isReadOnly: true,
      hasInventoryError: true,
      hasMaterialReview: false,
    });
    expect(reasons).toContain('Error de inventario');
    expect(reasons).toContain('Usuario sin permisos (Solo lectura)');
    expect(reasons).toContain('Orden eliminada o cancelada');
  });

  it('sin problemas devuelve lista vacía', () => {
    expect(getBlockedOrderReasons(order('draft'), defaultCtx)).toHaveLength(0);
  });
});
