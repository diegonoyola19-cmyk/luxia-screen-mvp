import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedOrdersPanel, OrderMiniStepper, getOrderStatus } from '../SavedOrdersPanel';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import type { SavedOrder } from '../../../../domain/curtains/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../../../../store/useAuthStore', () => ({
  useAuthStore: () => ({ role: 'admin' }),
}));

vi.mock('../../../../lib/orderTransfer', () => ({
  downloadSavedOrders: vi.fn(),
  importSavedOrdersFile: vi.fn(),
}));

vi.mock('../../../../lib/csvExport', () => ({
  downloadCsvReport: vi.fn(),
}));

vi.mock('../../../../lib/sageExport', () => ({
  downloadSageOrderEntry: vi.fn().mockReturnValue({ updatedRemainders: [], orderSnapshots: {} }),
  getSageExportableLineCount: vi.fn().mockReturnValue(0),
}));

vi.mock('../../../../logic/generateRollerBOM', () => ({
  generateRollerBOM: vi.fn().mockReturnValue({ items: [] }),
  TONE_COLOR_MAP: {},
}));

vi.mock('../../../../domain/orders/validateOrderBeforeSage', () => ({
  validateOrderBeforeSage: vi.fn().mockReturnValue({ ok: true, errors: [] }),
}));

vi.mock('../../../../lib/supabaseOrderInventory', () => ({
  cancelOrderInventoryTransaction: vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function makeOrder(id: string, status = 'ready_for_production', dateOffsetMs = 0): SavedOrder {
  return {
    id,
    orderNumber: `ORD-${id.toUpperCase()}`,
    createdAt: new Date(Date.now() - dateOffsetMs).toISOString(),
    status: status as any,
    sageExportedAt: null,
    items: [],
  } as unknown as SavedOrder;
}

function renderPanel(orders: SavedOrder[] = []) {
  useCalculatorStore.setState({
    savedOrders: orders,
    syncMetadata: {},
    selectedOrderId: orders[0]?.id ?? null,
    remainders: [],
  });
  return render(<SavedOrdersPanel />);
}

describe('SavedOrdersPanel — Operational UX Overhaul', () => {
  beforeEach(() => {
    useCalculatorStore.setState({
      savedOrders: [],
      syncMetadata: {},
      selectedOrderId: null,
      remainders: [],
      activeView: 'orders',
    });
    vi.clearAllMocks();
  });

  describe('1. Mini-Stepper Rendering across all 7 states', () => {
    it('renders 4 pending stages for draft', () => {
      const { container } = render(<OrderMiniStepper status="draft" />);
      expect(screen.getByText('Prep.')).toBeInTheDocument();
      expect(screen.getByText('Taller')).toBeInTheDocument();
      expect(screen.getByText('Mat.')).toBeInTheDocument();
      expect(screen.getByText('SAGE')).toBeInTheDocument();
      expect(container.querySelectorAll('.stepper-step--done').length).toBe(0);
    });

    it('renders Step 1 (Prep.) done for ready_for_production', () => {
      const { container } = render(<OrderMiniStepper status="ready_for_production" />);
      expect(container.querySelectorAll('.stepper-step--done').length).toBe(1);
    });

    it('renders Step 1 & 2 done for in_production', () => {
      const { container } = render(<OrderMiniStepper status="in_production" />);
      expect(container.querySelectorAll('.stepper-step--done').length).toBe(2);
    });

    it('renders Steps 1, 2 & 3 done for materials_checked', () => {
      const { container } = render(<OrderMiniStepper status="materials_checked" />);
      expect(container.querySelectorAll('.stepper-step--done').length).toBe(3);
    });

    it('renders all 4 steps done for sent_to_sage', () => {
      const { container } = render(<OrderMiniStepper status="sent_to_sage" />);
      expect(container.querySelectorAll('.stepper-step--done').length).toBe(4);
    });

    it('renders terminal badge for completed', () => {
      render(<OrderMiniStepper status="completed" />);
      expect(screen.getByText('✓ Completada')).toBeInTheDocument();
    });

    it('renders terminal badge for cancelled', () => {
      render(<OrderMiniStepper status="cancelled" />);
      expect(screen.getByText('× Cancelada')).toBeInTheDocument();
    });
  });

  describe('2. Next Best Action (Primary CTA per row)', () => {
    it('shows "Ver borrador" for draft', () => {
      renderPanel([makeOrder('o1', 'draft')]);
      expect(screen.getByText('Ver borrador')).toBeInTheDocument();
    });

    it('shows "Imprimir y pasar a Taller" for ready_for_production', () => {
      renderPanel([makeOrder('o2', 'ready_for_production')]);
      expect(screen.getByText('Imprimir y pasar a Taller')).toBeInTheDocument();
    });

    it('shows "Revisar materiales" for in_production', () => {
      renderPanel([makeOrder('o3', 'in_production')]);
      expect(screen.getByText('Revisar materiales')).toBeInTheDocument();
    });

    it('shows "✓ Listo para SAGE" for materials_checked', () => {
      renderPanel([makeOrder('o4', 'materials_checked')]);
      expect(screen.getByText('✓ Listo para SAGE')).toBeInTheDocument();
    });

    it('shows "Ver estado SAGE" for sent_to_sage', () => {
      renderPanel([makeOrder('o5', 'sent_to_sage')]);
      expect(screen.getByText('Ver estado SAGE')).toBeInTheDocument();
    });

    it('shows "Ver resumen" for completed', () => {
      renderPanel([makeOrder('o6', 'completed')]);
      expect(screen.getByText('Ver resumen')).toBeInTheDocument();
    });

    it('shows "Ver auditoría" for cancelled', () => {
      renderPanel([makeOrder('o7', 'cancelled')]);
      expect(screen.getByText('Ver auditoría')).toBeInTheDocument();
    });
  });

  describe('3. Quick Filter Tabs & Counts', () => {
    it('computes exact counts and filters by active stage', () => {
      const orders = [
        makeOrder('o1', 'ready_for_production'),
        makeOrder('o2', 'in_production'),
        makeOrder('o3', 'materials_checked'),
        makeOrder('o4', 'sent_to_sage'),
      ];
      renderPanel(orders);

      expect(screen.getByText('Todas')).toBeInTheDocument();
      // "En Taller" has ready + in_production = 2
      const workshopTab = screen.getByRole('tab', { name: /En Taller/i });
      expect(workshopTab).toHaveTextContent('2');

      // Click "En Taller"
      fireEvent.click(workshopTab);
      expect(screen.getByText('ORD-O1')).toBeInTheDocument();
      expect(screen.getByText('ORD-O2')).toBeInTheDocument();
      expect(screen.queryByText('ORD-O3')).not.toBeInTheDocument();
      expect(screen.queryByText('ORD-O4')).not.toBeInTheDocument();
    });
  });

  describe('4. Operational Sorting (Seniority in Active Stages)', () => {
    it('prioritizes in_production before ready_for_production, and oldest first', () => {
      const o1ReadyRecent = makeOrder('ready_new', 'ready_for_production', 1000);
      const o2InProdOld = makeOrder('inprod_old', 'in_production', 50000);
      const o3InProdNew = makeOrder('inprod_new', 'in_production', 2000);

      renderPanel([o1ReadyRecent, o2InProdOld, o3InProdNew]);

      const rows = screen.getAllByRole('row');
      // Row 0 is the table header. Row 1 should be the oldest in_production (inprod_old)
      expect(rows[1]).toHaveTextContent('ORD-INPROD_OLD');
      expect(rows[2]).toHaveTextContent('ORD-INPROD_NEW');
      expect(rows[3]).toHaveTextContent('ORD-READY_NEW');
    });
  });

  describe('5. Cancel vs Delete Modals', () => {
    it('opens Cancel modal with rollback explanation and handles cancellation', async () => {
      const order = makeOrder('cancel1', 'in_production');
      renderPanel([order]);

      // Open menu
      const moreBtn = screen.getByLabelText('Más opciones');
      fireEvent.click(moreBtn);

      // Click "Cancelar orden"
      const cancelItem = screen.getByText('Cancelar orden');
      fireEvent.click(cancelItem);

      expect(screen.getByText('¿Cancelar orden ORD-CANCEL1?')).toBeInTheDocument();
      expect(screen.getByText(/Revertirá el inventario/i)).toBeInTheDocument();

      // Confirm cancel
      const confirmBtn = screen.getByRole('button', { name: 'Cancelar orden' });
      fireEvent.click(confirmBtn);
    });

    it('opens Delete modal with administrative soft-delete copy', () => {
      const order = makeOrder('del1', 'completed');
      renderPanel([order]);

      const moreBtn = screen.getByLabelText('Más opciones');
      fireEvent.click(moreBtn);

      const delItem = screen.getByText('Eliminar registro');
      fireEvent.click(delItem);

      expect(screen.getByText('¿Eliminar registro ORD-DEL1?')).toBeInTheDocument();
      expect(screen.getByText(/retira el registro/i)).toBeInTheDocument();
    });
  });

  describe('6. Legacy Order Hardening', () => {
    it('gracefully renders legacy order with missing items and invalid dates without crashing', () => {
      const legacyOrder: SavedOrder = {
        id: 'legacy-1',
        orderNumber: 'ORD-LEGACY',
        createdAt: 'invalid-date',
        status: 'pending' as any,
        sageExportedAt: null,
      } as any;

      renderPanel([legacyOrder]);
      expect(screen.getByText('ORD-LEGACY')).toBeInTheDocument();
      // Should normalize 'pending' to 'ready_for_production'
      expect(screen.getAllByText('Lista para prod.').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Removal of native alert()', () => {
    it('navigates directly to production-v2 when clicking "Nueva Orden"', () => {
      renderPanel([]);
      const newOrderBtn = screen.getByRole('button', { name: /Nueva Orden/i });
      fireEvent.click(newOrderBtn);

      expect(useCalculatorStore.getState().activeView).toBe('production-v2');
    });
  });
});
