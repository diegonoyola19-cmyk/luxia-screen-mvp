import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductionQueueCard } from '../ProductionQueueCard';
import { useCalculatorStore } from '../../../store/useCalculatorStore';
import * as orderWorkflow from '../../../../../domain/orders/orderWorkflow';
import * as orderActivityMetadata from '../../orders/utils/orderActivityMetadata';

vi.mock('../../../store/useCalculatorStore');
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

const mockUpdateSavedOrderStatus = vi.fn();

describe('ProductionQueueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCalculatorStore as any).mockReturnValue({
      updateSavedOrderStatus: mockUpdateSavedOrderStatus
    });
  });

  const baseOrder: any = {
    id: '1',
    orderNumber: 'ORD-1',
    status: 'ready_for_production',
    createdAt: new Date().toISOString(),
    items: [{ id: 'item1', width: 100, drop: 100, fabric: { name: 'test' } }]
  };

  it('renders order information', () => {
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);
    
    expect(screen.getByText('ORD-1')).toBeDefined();
    expect(screen.getByText('Cliente de prueba')).toBeDefined();
    expect(screen.getByText(/1 persiana/)).toBeDefined();
    expect(screen.getByText('Lista para Producción')).toBeDefined();
  });

  it('shows inventory error if present', () => {
    const orderWithError = { ...baseOrder, inventoryErrorCode: 'INSUFFICIENT_STOCK' };
    render(<ProductionQueueCard order={orderWithError} context={{ isReadOnly: false, hasInventoryError: true }} inventoryContext={{}} onViewDetails={vi.fn()} />);
    
    expect(screen.getByText('⚠️ Error de inventario')).toBeDefined();
  });

  it('shows block reason if blocked', () => {
    vi.spyOn(orderWorkflow, 'getBlockedOrderReasons').mockReturnValue(['Falta confirmar material']);
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);
    
    expect(screen.getByText('Falta confirmar material')).toBeDefined();
  });

  it('allows send to production if workflow permits', () => {
    vi.spyOn(orderWorkflow, 'canTransitionOrderStatus').mockReturnValue({ allowed: true });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: false }} inventoryContext={{}} onViewDetails={vi.fn()} />);
    
    const btn = screen.getByText('Pasar a Producción');
    fireEvent.click(btn);
    expect(mockUpdateSavedOrderStatus).toHaveBeenCalledWith('1', 'in_production');
    expect(orderActivityMetadata.logOrderSentToProduction).toHaveBeenCalledWith(baseOrder, 'production_queue');
  });

  it('hides send to production if readonly or workflow denies', () => {
    vi.spyOn(orderWorkflow, 'canTransitionOrderStatus').mockReturnValue({ allowed: false, reason: 'Solo lectura' });
    render(<ProductionQueueCard order={baseOrder} context={{ isReadOnly: true }} inventoryContext={{}} onViewDetails={vi.fn()} />);
    
    expect(screen.queryByText('Pasar a Producción')).toBeNull();
  });
});
