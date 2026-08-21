import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductionQueueCard } from '../ProductionQueueCard';
import { useCalculatorStore } from '../../../store/useCalculatorStore';
import * as orderWorkflow from '../../../../../domain/orders/orderWorkflow';
import * as orderActivityMetadata from '../../orders/utils/orderActivityMetadata';

vi.mock('../../../store/useCalculatorStore');
vi.mock('../../../../../lib/supabaseOrderInventory', () => ({
  reserveOrderInventory: vi.fn().mockResolvedValue({ ok: true, status: 'reserved' }),
  releaseOrderInventory: vi.fn().mockResolvedValue({ ok: true, status: 'released' }),
  consumeOrderInventoryReservations: vi.fn().mockResolvedValue({ ok: true, status: 'consumed' }),
}));
vi.mock('../../../../../lib/supabaseOrders', () => ({
  upsertOrder: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../orders/utils/orderDisplay', () => ({
  getClientReference: () => 'Cliente de prueba',
  getOrderStatusLabel: () => 'Lista para Producción'
}));
vi.mock('../../../../lib/format', () => ({
  formatDate: () => '10/10/2026'
}));
vi.mock('../../orders/utils/orderActivityMetadata', () => ({
  logOrderSentToProduction: vi.fn()
}));
// Mock validateOrderInventoryAvailability to control inventory result in tests
vi.mock('../../../../../domain/orders/orderInventoryAvailability', () => ({
  validateOrderInventoryAvailability: vi.fn(() => ({
    canProceed: true,
    reasons: [],
    items: []
  }))
}));

const mockUpdateSavedOrderStatus = vi.fn();

describe('ProductionQueueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockStoreObj = {
      updateSavedOrderStatus: mockUpdateSavedOrderStatus,
      savedOrders: [baseOrder],
      syncMetadata: {}
    };
    (useCalculatorStore as any).mockReturnValue(mockStoreObj);
    (useCalculatorStore as any).getState = () => mockStoreObj;
  });

  const baseOrder: any = {
    id: '1',
    orderNumber: 'ORD-1',
    status: 'ready_for_production',
    createdAt: new Date().toISOString(),
    items: [{ id: 'item1', width: 100, drop: 100, fabric: { name: 'test' } }]
  };

  // ─── Renderizado básico ────────────────────────────────────────────────────

  it('renders order information', () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockReturnValue({ allowed: true });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.getByText('ORD-1')).toBeDefined();
    expect(screen.getByText('Cliente de prueba')).toBeDefined();
    expect(screen.getByText(/1 persiana/)).toBeDefined();
    expect(screen.getByText('Lista para Producción')).toBeDefined();
  });

  it('shows inventory error if present', () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockReturnValue({ allowed: false, reason: 'Inventario insuficiente' });
    const orderWithError = { ...baseOrder, inventoryErrorCode: 'INSUFFICIENT_STOCK' };
    render(<ProductionQueueCard order={orderWithError} context={{ isReadOnly: false, hasInventoryError: true }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.getByText('⚠️ Error de inventario')).toBeDefined();
  });

  it('shows block reason if blocked', () => {
    vi.spyOn(orderWorkflow, 'getBlockedOrderReasons').mockReturnValue(['Falta confirmar material']);
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockReturnValue({ allowed: false, reason: 'Falta confirmar material' });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.getByText('Falta confirmar material')).toBeDefined();
  });

  // ─── Obligatorios MED-1: gating estricto ──────────────────────────────────

  it('MED-1.1: NO permite enviar a producción sin materiales confirmados', () => {
    // canPerformOrderAction retorna false cuando hasMaterialReview=false
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockImplementation((_, action) => {
      if (action === 'send_to_production') {
        return { allowed: false, reason: 'La orden debe tener materiales confirmados antes de pasar a producción' };
      }
      return { allowed: true };
    });
    const orderSinMateriales = { ...baseOrder };
    render(<ProductionQueueCard order={orderSinMateriales} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.queryByText('Pasar a Producción')).toBeNull();
  });

  it('MED-1.2: NO permite enviar a producción sin inventoryAvailabilityResult', () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockImplementation((_, action) => {
      if (action === 'send_to_production') {
        return { allowed: false, reason: 'Se requiere verificar disponibilidad de inventario antes de pasar a producción' };
      }
      return { allowed: true };
    });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.queryByText('Pasar a Producción')).toBeNull();
  });

  it('MED-1.3: NO permite enviar a producción con inventoryAvailabilityResult.canProceed === false', () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockImplementation((_, action) => {
      if (action === 'send_to_production') {
        return { allowed: false, reason: 'Inventario insuficiente para proceder' };
      }
      return { allowed: true };
    });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.queryByText('Pasar a Producción')).toBeNull();
  });

  it('MED-1.4: SÍ permite enviar a producción con materiales confirmados + inventario OK', async () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockImplementation((_, action) => {
      if (action === 'send_to_production') return { allowed: true };
      return { allowed: true };
    });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    const btn = screen.getByText('Pasar a Producción');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockUpdateSavedOrderStatus).toHaveBeenCalledWith('1', 'in_production');
      expect(orderActivityMetadata.logOrderSentToProduction).toHaveBeenCalledWith(baseOrder, 'production_queue');
    });
  });

  it('MED-1.5: hides button when readonly or workflow denies (regresión)', () => {
    vi.spyOn(orderWorkflow, 'canPerformOrderAction').mockReturnValue({ allowed: false, reason: 'Solo lectura' });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: true }} inventoryContext={{}} onViewDetails={vi.fn()} />);

    expect(screen.queryByText('Pasar a Producción')).toBeNull();
  });
});
