/**
 * Subfase 5B.8.D3 — Tests de UI para inventoryErrorCode en SavedOrdersPanel.
 *
 * Verifica que el componente OrderListItem muestra etiquetas amigables
 * en español cuando syncStatus.inventoryErrorCode está presente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavedOrdersPanel } from '../SavedOrdersPanel';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import type { SavedOrder } from '../../../../domain/curtains/types';

// ─── Mocks mínimos ────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));


vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal SavedOrder with required fields */
function makeOrder(id = 'ord-1'): SavedOrder {
  return {
    id,
    orderNumber: `ORD-${id}`,
    createdAt: new Date().toISOString(),
    status: 'ready_for_production',
    sageExportedAt: null,
    items: [],
  } as unknown as SavedOrder;
}

function renderPanel(syncMeta: Record<string, any> = {}, orders: SavedOrder[] = []) {
  useCalculatorStore.setState({
    savedOrders: orders,
    syncMetadata: syncMeta,
    selectedOrderId: orders[0]?.id ?? null,
    remainders: [],
  });
  return render(<SavedOrdersPanel />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SavedOrdersPanel — inventoryErrorCode UI (D3)', () => {
  beforeEach(() => {
    useCalculatorStore.setState({
      savedOrders: [],
      syncMetadata: {},
      selectedOrderId: null,
      remainders: [],
    });
    vi.clearAllMocks();
  });

  it('muestra ⏳ con tooltip "Pendiente" para status=pending', () => {
    const order = makeOrder('p1');
    renderPanel({ p1: { status: 'pending', pendingAction: 'upsert' } }, [order]);
    const icon = screen.getByTitle('Pendiente de subir');
    expect(icon).toBeInTheDocument();
    expect(icon.textContent).toBe('⏳');
  });

  it('muestra 🔴 con tooltip genérico cuando no hay inventoryErrorCode', () => {
    const order = makeOrder('e1');
    renderPanel({ e1: { status: 'error', errorMessage: 'Error de red' } }, [order]);
    const icon = screen.getByTitle('Error: Error de red');
    expect(icon).toBeInTheDocument();
    expect(icon.textContent).toBe('🔴');
  });

  it('muestra 🔴 con "Stock insuficiente en bodega" para INSUFFICIENT_STOCK', () => {
    const order = makeOrder('s1');
    renderPanel({
      s1: { status: 'error', inventoryErrorCode: 'INSUFFICIENT_STOCK', errorMessage: 'raw msg' },
    }, [order]);
    const icon = screen.getByTitle('Error: Stock insuficiente en bodega');
    expect(icon).toBeInTheDocument();
  });

  it('muestra 🔴 con "Material o retazo no disponible" para ITEM_NOT_AVAILABLE', () => {
    const order = makeOrder('i1');
    renderPanel({
      i1: { status: 'error', inventoryErrorCode: 'ITEM_NOT_AVAILABLE' },
    }, [order]);
    const icon = screen.getByTitle('Error: Material o retazo no disponible');
    expect(icon).toBeInTheDocument();
  });

  it('muestra 🔴 con "Sin permiso para consumir inventario" para PERMISSION_DENIED', () => {
    const order = makeOrder('pm1');
    renderPanel({
      pm1: { status: 'error', inventoryErrorCode: 'PERMISSION_DENIED' },
    }, [order]);
    const icon = screen.getByTitle('Error: Sin permiso para consumir inventario');
    expect(icon).toBeInTheDocument();
  });

  it('muestra 🔴 con "Plan de consumo inválido" para INVALID_CONSUMPTION_PLAN', () => {
    const order = makeOrder('ic1');
    renderPanel({
      ic1: { status: 'error', inventoryErrorCode: 'INVALID_CONSUMPTION_PLAN' },
    }, [order]);
    const icon = screen.getByTitle('Error: Plan de consumo inválido');
    expect(icon).toBeInTheDocument();
  });

  it('muestra "Error de inventario: UNKNOWN_CODE" para códigos desconocidos', () => {
    const order = makeOrder('uk1');
    renderPanel({
      uk1: { status: 'error', inventoryErrorCode: 'UNKNOWN_CODE' },
    }, [order]);
    const icon = screen.getByTitle('Error: Error de inventario: UNKNOWN_CODE');
    expect(icon).toBeInTheDocument();
  });

  it('inventoryErrorCode tiene prioridad sobre errorMessage genérico', () => {
    const order = makeOrder('pri1');
    renderPanel({
      pri1: {
        status: 'error',
        inventoryErrorCode: 'INSUFFICIENT_STOCK',
        errorMessage: 'mensaje técnico crudo',
      },
    }, [order]);
    // Debe mostrar la etiqueta amigable, NO el mensaje técnico
    expect(screen.getByTitle('Error: Stock insuficiente en bodega')).toBeInTheDocument();
    expect(screen.queryByTitle('Error: mensaje técnico crudo')).not.toBeInTheDocument();
  });

  it('no muestra icono de sync si no hay syncStatus para esa orden', () => {
    const order = makeOrder('no-meta');
    renderPanel({}, [order]);
    expect(screen.queryByTitle('Pendiente de subir')).not.toBeInTheDocument();
    expect(screen.queryByText('🔴')).not.toBeInTheDocument();
  });
});
