import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaterialReviewModal } from '../MaterialReviewModal';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import type { SavedOrder } from '../../../../domain/curtains/types';

vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../../../../domain/orders/issueStrategies', () => ({
  calculateIssueLines: vi.fn().mockReturnValue({
    issueLines: [],
    cutPlans: [],
    cutsFromRemainders: [],
    createdRemainders: []
  }),
}));

function makeOrder(overrides: Partial<SavedOrder> = {}): SavedOrder {
  return {
    id: 'test-order-1',
    orderNumber: 'TEST-ORD-01',
    createdAt: new Date().toISOString(),
    status: 'in_production',
    sageExportedAt: null,
    items: [],
    ...overrides,
  } as unknown as SavedOrder;
}

function makeCurtainItem(id = 'c1', fabricSku = '0-004-87-00298', hasMatLines = true) {
  return {
    id,
    title: `Cortina ${id}`,
    input: {
      widthMeters: 1.5,
      heightMeters: 2.0,
      fabricColor: 'White',
      hardwareTone: 'white',
      mountingSystem: 'standard'
    },
    result: {
      selectedFabric: fabricSku ? { itemCode: fabricSku, description: 'White Fabric', color: 'White' } : null,
      recommendedRollWidthMeters: 2.5,
      cutLengthMeters: 2.1,
      fabricDownloadedYd2: 4.5,
      wastePercentage: 10
    },
    materialLines: hasMatLines ? [
      {
        id: `mat-1-${id}`,
        itemCode: '0-154-TU-38111',
        sageItemCode: '0-154-TU-38111',
        description: 'Tubo de 38mm NEO',
        quantity: 1.45,
        unit: 'm',
        category: 'hardware'
      },
      {
        id: `mat-2-${id}`,
        itemCode: '0-151-AL-CLW19',
        sageItemCode: '0-151-AL-CLW19',
        description: 'Bottomrail',
        quantity: 1.45,
        unit: 'm',
        category: 'hardware'
      }
    ] : []
  };
}

describe('MaterialReviewModal — Safe Empty State & Integrity Protection', () => {
  beforeEach(() => {
    useCalculatorStore.setState({
      savedOrders: [],
      remainders: [],
    });
    vi.clearAllMocks();
  });

  describe('1. Global Empty State (order.items = [])', () => {
    it('renders prominent global warning and does not show ambiguous category messages', () => {
      const emptyOrder = makeOrder({ items: [] });
      render(<MaterialReviewModal order={emptyOrder} onClose={vi.fn()} />);

      // Warning header & subtitle
      expect(screen.getByText(/Esta orden no contiene persianas ni materiales registrados/i)).toBeInTheDocument();
      expect(screen.getByText(/Puede tratarse de una orden de prueba o de una orden creada con una versión anterior/i)).toBeInTheDocument();

      // Ambiguous messages must NOT be shown
      expect(screen.queryByText('No hay componentes para revisar.')).not.toBeInTheDocument();
      expect(screen.queryByText('No hay telas para revisar.')).not.toBeInTheDocument();

      // Status badge in header
      expect(screen.getByText('Datos Incompletos')).toBeInTheDocument();
    });

    it('disables "Completar Revisión", "Confirmar todo" and "Guardar Borrador" on empty orders', () => {
      const emptyOrder = makeOrder({ items: [] });
      render(<MaterialReviewModal order={emptyOrder} onClose={vi.fn()} />);

      const completeBtn = screen.getByRole('button', { name: /Completar Revisión/i });
      expect(completeBtn).toBeDisabled();
      expect(completeBtn).toHaveAttribute('title', 'No es posible completar la revisión porque la orden no contiene materiales registrados.');

      const confirmAllBtn = screen.getByRole('button', { name: /Confirmar todo sin cambios/i });
      expect(confirmAllBtn).toBeDisabled();

      const saveDraftBtn = screen.getByRole('button', { name: /Guardar Borrador/i });
      expect(saveDraftBtn).toBeDisabled();
    });
  });

  describe('2. Normal Orders with Items & Materials', () => {
    it('renders components and fabrics accurately with enabled controls', () => {
      const normalOrder = makeOrder({
        items: [makeCurtainItem('1', '0-004-87-00298', true)] as any
      });
      render(<MaterialReviewModal order={normalOrder} onClose={vi.fn()} />);

      // Components should be visible
      expect(screen.getByText('Tubo de 38mm NEO')).toBeInTheDocument();
      expect(screen.getByText('Bottomrail')).toBeInTheDocument();

      // Action buttons must be enabled
      const completeBtn = screen.getByRole('button', { name: /Completar Revisión/i });
      expect(completeBtn).not.toBeDisabled();

      const confirmAllBtn = screen.getByRole('button', { name: /Confirmar todo sin cambios/i });
      expect(confirmAllBtn).not.toBeDisabled();

      // Switch to fabrics tab
      const fabricsTab = screen.getByRole('button', { name: /Telas \/ Paños/i });
      fireEvent.click(fabricsTab);

      expect(screen.getByText('Cortina 1')).toBeInTheDocument();
      expect(screen.getByText('0-004-87-00298')).toBeInTheDocument();
    });
  });

  describe('3. Category Empty States (order.items > 0 but category empty)', () => {
    it('displays distinct info message when category has 0 items but order is valid', () => {
      // Order with item but no materialLines (simulated)
      const orderWithoutMatLines = makeOrder({
        items: [{
          id: 'item-no-mat',
          title: 'Cortina Solo Tela',
          input: null, // to prevent V2 fallback
          result: { selectedFabric: { itemCode: 'FAB-01', description: 'Fabric 1', color: 'White' }, fabricDownloadedYd2: 5 },
          materialLines: []
        }] as any
      });

      render(<MaterialReviewModal order={orderWithoutMatLines} onClose={vi.fn()} />);

      // Components tab shows category info
      expect(screen.getByText(/No hay componentes\/herrajes que requieran revisión para esta orden/i)).toBeInTheDocument();

      // Switch to fabrics tab
      const fabricsTab = screen.getByRole('button', { name: /Telas \/ Paños/i });
      fireEvent.click(fabricsTab);

      // Fabrics are present
      expect(screen.getByText('Cortina Solo Tela')).toBeInTheDocument();
    });
  });
});
