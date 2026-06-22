import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryPanelV2 } from './InventoryPanelV2';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useGlobalInventoryStore } from '../../../store/useGlobalInventoryStore';
import * as migrationLib from '../../../lib/inventoryMigration';

vi.mock('../store/useCalculatorStore', () => {
  return {
    useCalculatorStore: vi.fn(),
  };
});

vi.mock('../../../store/useAuthStore');
vi.mock('../../../store/useGlobalInventoryStore');
vi.mock('../../../lib/inventoryMigration', () => ({
  getInventoryMigrationStatus: vi.fn(),
}));

const mockAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe('InventoryPanelV2 (Bodega 3.0)', () => {
  let discardInventoryItemMock: any;
  let setRemaindersMock: any;
  let enqueueOperationMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (migrationLib.getInventoryMigrationStatus as any).mockReturnValue({ status: 'completed' });

    mockAuthStore.mockReturnValue({
      role: 'admin',
      hasPermission: () => true,
      user: { id: 'test-user-id' }
    });

    discardInventoryItemMock = vi.fn();
    setRemaindersMock = vi.fn();
    enqueueOperationMock = vi.fn();

    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        productionInventory: { fabrics: [], tubes: [], bottoms: [] },
        discardInventoryItem: discardInventoryItemMock,
        remainders: [],
        savedOrders: [],
        setRemainders: setRemaindersMock,
        addFabricScrap: vi.fn()
      };
      return selector(state);
    });

    vi.mocked(useGlobalInventoryStore).mockImplementation((selector: any) => {
      const state = {
        items: [
          {
            id: 'test-tube',
            code: '0-154-TU-50001',
            category: 'tube',
            kind: 'scrap',
            status: 'available',
            created_from_order_id: null,
            source: 'migration',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { length_meters: 2.0, source_order_number: 'ORD-0225' },
            remainingLengthM: 2.0
          },
          {
            id: 'test-bottom',
            code: '0-151-AL-CLZ19',
            category: 'bottom',
            kind: 'scrap',
            status: 'available',
            created_from_order_id: null,
            source: 'migration',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { length_meters: 1.0, source_order_number: 'ORD-0225' },
            remainingLengthM: 1.0
          },
          {
            id: 'fab-1',
            code: 'RET-001',
            category: 'fabric',
            kind: 'scrap',
            status: 'available',
            created_from_order_id: null,
            source: 'migration',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { family: 'Roller', color: 'White', width_meters: 1, length_meters: 1 },
            widthMeters: 1,
            lengthMeters: 1
          },
          {
            // Rollo completo API, NO debe aparecer como retazo
            id: 'roll-1',
            code: 'ROLL-API-1',
            category: 'fabric',
            kind: 'roll',
            status: 'available',
            created_from_order_id: null,
            source: 'api',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { family: 'Roller', color: 'Black', width_meters: 3, length_meters: 30 }
          }
        ],
        movements: [],
        syncStatus: 'idle',
        lastError: null,
        lastSyncedAt: null,
        pendingQueue: [],
        enqueueOperation: enqueueOperationMock,
        upsertItemLocally: vi.fn()
      };
      return selector ? selector(state) : state;
    });
  });

  it('renderiza métricas correctamente', () => {
    render(<InventoryPanelV2 />);
    expect(screen.getByText('Bodega')).toBeInTheDocument();
    expect(screen.getByText('Retazos de tela disponibles')).toBeInTheDocument();
    expect(screen.getByText('Sobrantes de tubo disponibles')).toBeInTheDocument();
  });

  it('tabs muestran conteos correctamente', () => {
    render(<InventoryPanelV2 />);
    const tabTelas = screen.getByRole('button', { name: /Retazos de Tela/ });
    expect(tabTelas).toHaveTextContent('1'); // fab-1
    
    const tabLineales = screen.getByRole('button', { name: /Sobrantes Lineales/ });
    expect(tabLineales).toHaveTextContent('2'); // test-tube, test-bottom
  });

  it('no muestra rollos API como retazos', () => {
    render(<InventoryPanelV2 />);
    expect(screen.getByText('RET-001')).toBeInTheDocument();
    expect(screen.queryByText('ROLL-API-1')).not.toBeInTheDocument();
  });

  it('selectedIds vacío al cargar y bulk bar oculta', () => {
    render(<InventoryPanelV2 />);
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).not.toHaveClass('visible');
    
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(cb => {
      expect(cb).not.toBeChecked();
    });
  });

  it('seleccionar fila muestra bulk bar', () => {
    render(<InventoryPanelV2 />);
    const rowCheckbox = screen.getByRole('checkbox', { name: 'Seleccionar RET-001' });
    fireEvent.click(rowCheckbox);
    
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).toHaveClass('visible');
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).toHaveTextContent('1 seleccionados');
  });

  it('seleccionar todo visible funciona', () => {
    render(<InventoryPanelV2 />);
    fireEvent.click(screen.getByRole('button', { name: /Sobrantes Lineales/ }));
    
    const selectAllCb = screen.getByRole('checkbox', { name: /Seleccionar todos los visibles/ });
    fireEvent.click(selectAllCb);
    
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).toHaveTextContent('2 seleccionados');
  });

  it('cambiar tab limpia selección', () => {
    render(<InventoryPanelV2 />);
    const rowCheckbox = screen.getByRole('checkbox', { name: 'Seleccionar RET-001' });
    fireEvent.click(rowCheckbox);
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).toHaveClass('visible');

    fireEvent.click(screen.getByRole('button', { name: /Sobrantes Lineales/ }));
    expect(screen.getByRole('button', { name: /Dar de baja seleccionados/ }).closest('.bulk-bar')).not.toHaveClass('visible');
  });

  it('ver detalle abre modal y muestra secciones correctas', () => {
    render(<InventoryPanelV2 />);
    expect(screen.queryByText('Detalle del registro')).not.toBeInTheDocument();
    
    const verDetalleBtn = screen.getAllByRole('button', { name: /Ver detalle/ })[0];
    fireEvent.click(verDetalleBtn);

    expect(screen.getByText('Detalle del registro')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Material' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Medidas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Origen' })).toBeInTheDocument();

    // Verify some values
    expect(screen.getAllByText('RET-001').length).toBeGreaterThan(0); // Code
    expect(screen.getAllByText('Retazo de tela').length).toBeGreaterThan(0); // Type
    expect(screen.getAllByText('Roller - White').length).toBeGreaterThan(0); // Description
    expect(screen.getAllByText('1.00 m').length).toBeGreaterThan(0); // Width
    expect(screen.getAllByText('Corte de Prod.').length).toBeGreaterThan(0); // Origin
  });

  it('dar de baja individual desde modal confirma', () => {
    render(<InventoryPanelV2 />);
    
    // Abrir detalle
    const verDetalleBtn = screen.getAllByRole('button', { name: /Ver detalle/ })[0];
    fireEvent.click(verDetalleBtn);

    // Click dar de baja en modal detalle
    const btnBaja = screen.getAllByRole('button', { name: 'Dar de baja' })[1]; // [0] is in row, [1] is in modal
    fireEvent.click(btnBaja);

    // Debe cerrar detalle y abrir modal confirmación
    expect(screen.getByRole('heading', { name: 'Confirmar baja' })).toBeInTheDocument();
    expect(screen.getByText(/el registro seleccionado/)).toBeInTheDocument();
  });

  it('confirmar baja usa lógica existente', async () => {
    render(<InventoryPanelV2 />);
    
    // Seleccionar fila
    const rowCheckbox = screen.getByRole('checkbox', { name: 'Seleccionar RET-001' });
    fireEvent.click(rowCheckbox);

    // Click en la bulk bar
    const bulkBajaBtn = screen.getByRole('button', { name: /Dar de baja seleccionados/ });
    fireEvent.click(bulkBajaBtn);

    // Modal confirmación
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar baja' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'update_status',
        itemId: 'fab-1'
      }));
    });
  });
});
