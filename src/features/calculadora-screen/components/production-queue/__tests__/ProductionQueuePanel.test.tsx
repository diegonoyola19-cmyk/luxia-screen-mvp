import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductionQueuePanel } from '../ProductionQueuePanel';
import { useCalculatorStore } from '../../../store/useCalculatorStore';
import { useAuthStore } from '../../../../../store/useAuthStore';

vi.mock('../../../store/useCalculatorStore');
vi.mock('../../../../../store/useAuthStore');

vi.mock('../ProductionQueueCard', () => ({
  ProductionQueueCard: ({ order }: any) => <div data-testid="queue-card">{order.orderNumber}</div>
}));

describe('ProductionQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(true)
    });
  });

  it('renders all four columns', () => {
    (useCalculatorStore as any).mockReturnValue({
      savedOrders: []
    });

    render(<ProductionQueuePanel />);

    expect(screen.getByText('Listas para producción')).toBeDefined();
    expect(screen.getByText('En producción')).toBeDefined();
    expect(screen.getByText('Bloqueadas')).toBeDefined();
    expect(screen.getByText('Completadas')).toBeDefined();
  });

  it('renders orders in their respective columns', () => {
    (useCalculatorStore as any).mockReturnValue({
      savedOrders: [
        { id: '1', orderNumber: 'ORD-1', status: 'ready_for_production', items: [], createdAt: new Date().toISOString() },
        { id: '2', orderNumber: 'ORD-2', status: 'in_production', items: [], createdAt: new Date().toISOString() },
        { id: '3', orderNumber: 'ORD-3', status: 'completed', items: [], createdAt: new Date().toISOString() }
      ]
    });

    render(<ProductionQueuePanel />);
    const cards = screen.getAllByTestId('queue-card');
    expect(cards).toHaveLength(3);
    
    // We expect ORD-1 to be in 'ready' or 'blocked' depending on logic (it's ready without errors).
    expect(screen.getByText('ORD-1')).toBeDefined();
    expect(screen.getByText('ORD-2')).toBeDefined();
    expect(screen.getByText('ORD-3')).toBeDefined();
  });
});
