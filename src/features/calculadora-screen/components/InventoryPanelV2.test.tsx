import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('InventoryPanelV2', () => {
  let discardInventoryItemMock: any;
  let setRemaindersMock: any;
  let enqueueOperationMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (migrationLib.getInventoryMigrationStatus as any).mockReturnValue({ status: 'completed' });

    mockAuthStore.mockReturnValue({
      role: 'admin',
      hasPermission: () => true,
    });

    discardInventoryItemMock = vi.fn();
    setRemaindersMock = vi.fn();
    enqueueOperationMock = vi.fn();

    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        productionInventory: { fabrics: [], tubes: [], bottoms: [] },
        discardInventoryItem: discardInventoryItemMock,
        remainders: [],
        savedOrders: [
          {
            id: 'test-order-1',
            orderNumber: 'ORD-0225',
          }
        ],
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
            sku: '0-154-TU-50001',
            material_kind: 'tube',
            type: 'scrap',
            status: 'available',
            location: 'test',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { length_meters: 2.0, source_order_number: 'ORD-0225' }
          },
          {
            id: 'test-bottom',
            sku: '0-151-AL-CLZ19',
            material_kind: 'bottomrail',
            type: 'scrap',
            status: 'available',
            location: 'test',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { length_meters: 1.0, source_order_number: 'ORD-0225' }
          },
          {
            id: 'test-consumed',
            sku: '0-154-TU-50001',
            material_kind: 'tube',
            type: 'scrap',
            status: 'consumed',
            location: 'test',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { length_meters: 1.0, source_order_number: 'ORD-0225' }
          },
          {
            id: 'fab-1',
            sku: 'test-fab',
            code: 'RET-001',
            material_kind: 'fabric',
            type: 'scrap',
            status: 'available',
            location: 'test',
            created_at: '2023-10-01T10:00:00.000Z',
            updated_at: '2023-10-01T10:00:00.000Z',
            payload: { family: 'Roller', color: 'White', width_meters: 1, length_meters: 1 }
          }
        ],
        movements: [],
        syncStatus: 'idle',
        lastError: null,
        lastSyncedAt: null,
        pendingQueue: [],
        enqueueOperation: enqueueOperationMock
      };
      return selector ? selector(state) : state;
    });
  });

  it('muestra retazos de tubo disponibles', () => {
    render(<InventoryPanelV2 />);
    
    // Cambiar a la pestaña de sobrantes lineales
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.getByText(/2" \(50mm\) Smooth Alu. Motor Tube/)).toBeInTheDocument();
    expect(screen.getByText('Tubo')).toBeInTheDocument();
  });

  it('muestra retazos de bottomrail disponibles', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.getByText(/SO Rollux-Al. Bottomrail Classic Bronze/)).toBeInTheDocument();
    expect(screen.getByText('Bottomrail')).toBeInTheDocument();
  });

  it('no muestra sobrantes consumidos o descartados', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    // It only returns available, so 2 items.
    expect(screen.queryAllByText(/2" \(50mm\) Smooth Alu. Motor Tube/).length).toBe(1);
  });

  it('convierte FT a metros correctamente y los muestra', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    // 6.56 FT / 2.00 m
    expect(screen.getByText(/6.56 FT/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 2.00 m/)).toBeInTheDocument();

    // 3.28 FT / 1.00 m
    expect(screen.getByText(/3.28 FT/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 1.00 m/)).toBeInTheDocument();
  });

  it('muestra el número de orden de origen de los sobrantes', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    // The order number is ORD-0225
    const orders = screen.getAllByText('ORD-0225');
    expect(orders.length).toBeGreaterThan(0);
  });

  it('muestra la fecha de generacion', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    const dateStr = new Date('2023-10-01T10:00:00.000Z').toLocaleDateString();
    const dates = screen.getAllByText(dateStr);
    expect(dates.length).toBeGreaterThan(0);
  });

  it('muestra el empty state si no hay sobrantes lineales', () => {
    vi.mocked(useGlobalInventoryStore).mockImplementation((selector: any) => {
      const state = {
        items: [],
        movements: [],
        syncStatus: 'idle',
        lastError: null,
        lastSyncedAt: null,
        pendingQueue: []
      };
      return selector ? selector(state) : state;
    });

    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.getByText('No se encontraron sobrantes lineales.')).toBeInTheDocument();
  });

  it('el panel derecho aparece aunque no haya item seleccionado mostrando empty state', () => {
    render(<InventoryPanelV2 />);
    expect(screen.getByText('Selecciona un retazo o sobrante para ver sus detalles.')).toBeInTheDocument();
  });

  describe('Modal de dar de baja', () => {
    beforeEach(() => {
      // spy on window.confirm to make sure it's NOT called
      vi.spyOn(window, 'confirm');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('abre el modal al hacer clic en Dar de baja y cancelar no descarta', () => {
      render(<InventoryPanelV2 />);
      
      // Activar pestaña lineales
      fireEvent.click(screen.getByText('Sobrantes Lineales'));
      
      // Seleccionar un sobrante lineal
      fireEvent.click(screen.getByText(/2" \(50mm\) Smooth Alu. Motor Tube/));

      // Verificar que el detalle está abierto (botón de dar de baja)
      const btnBaja = screen.getByText('Dar de baja');
      fireEvent.click(btnBaja);

      // Verificar que el modal se abre
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/¿Dar de baja sobrante/)).toBeInTheDocument();
      expect(window.confirm).not.toHaveBeenCalled();

      // Cancelar
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      // El modal se cierra
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('no llama a localStore sino a enqueueOperation al descartar sobrante (Fase 5B.7)', async () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('Sobrantes Lineales'));
      fireEvent.click(screen.getByText(/2" \(50mm\) Smooth Alu. Motor Tube/));
      
      fireEvent.click(screen.getByText('Dar de baja'));
      
      const confirmBtns = screen.getAllByRole('button', { name: 'Dar de baja' });
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);

      await waitFor(() => {
        expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
          type: 'update_status',
          itemId: 'test-tube',
          payload: { status: 'discarded' }
        }));
        expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
          type: 'create_movement',
          itemId: 'test-tube',
          payload: expect.objectContaining({ action: 'discard' })
        }));
      });
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('no llama a localStore sino a enqueueOperation al descartar tela (Fase 5B.7)', async () => {
      render(<InventoryPanelV2 />);
      
      fireEvent.click(screen.getByText('RET-001'));
      fireEvent.click(screen.getByText('Dar de baja'));
      
      expect(screen.getByText(/¿Dar de baja retazo RET-001\?/)).toBeInTheDocument();
      
      const confirmBtns = screen.getAllByRole('button', { name: 'Dar de baja' });
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);

      await waitFor(() => {
        expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
          type: 'update_status',
          itemId: 'fab-1',
          payload: { status: 'discarded' }
        }));
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Botones Superiores', () => {
    let addFabricScrapMock: any;
    let enqueueOperationMock: any;
    
    beforeEach(() => {
      addFabricScrapMock = vi.fn();
      enqueueOperationMock = vi.fn();
      
      vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
        const state = {
          productionInventory: { fabrics: [], tubes: [], bottoms: [] },
          discardInventoryItem: vi.fn(),
          remainders: [],
          savedOrders: [],
          setRemainders: vi.fn(),
          addFabricScrap: addFabricScrapMock,
        };
        return selector(state);
      });

      vi.mocked(useGlobalInventoryStore).mockImplementation((selector: any) => {
        const state = {
          items: [], movements: [], syncStatus: 'idle', lastError: null, lastSyncedAt: null, pendingQueue: [],
          enqueueOperation: enqueueOperationMock
        };
        return selector ? selector(state) : state;
      });
    });

    it('abre el modal de registro manual', () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      expect(screen.getByText('Registrar retazo manual', { selector: 'h3' })).toBeInTheDocument();
    });

    it('cierra el modal de registro manual al cancelar', () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      expect(screen.getByText('Registrar retazo manual', { selector: 'h3' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByText('Registrar retazo manual', { selector: 'h3' })).not.toBeInTheDocument();
    });

    it('el botón Guardar inicia deshabilitado si faltan campos obligatorios', () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      
      const saveBtn = screen.getByRole('button', { name: 'Guardar retazo' });
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText('Completa color/descripción, ancho y alto para guardar.')).toBeInTheDocument();
    });

    it('habilita el botón Guardar al completar campos válidos', () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      
      fireEvent.change(screen.getByLabelText(/Color \/ Descripción/), { target: { value: 'Test Color' } });
      fireEvent.change(screen.getByLabelText(/Ancho/), { target: { value: '1.5' } });
      fireEvent.change(screen.getByLabelText(/Alto/), { target: { value: '2.0' } });

      const saveBtn = screen.getByRole('button', { name: 'Guardar retazo' });
      expect(saveBtn).not.toBeDisabled();
      expect(screen.queryByText('Completa color/descripción, ancho y alto para guardar.')).not.toBeInTheDocument();
    });

    it('muestra error y deshabilita si ancho o alto son inválidos', () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      
      fireEvent.change(screen.getByLabelText(/Color \/ Descripción/), { target: { value: 'Test Color' } });
      fireEvent.change(screen.getByLabelText(/Ancho/), { target: { value: '-1' } });
      fireEvent.change(screen.getByLabelText(/Alto/), { target: { value: '0' } });

      expect(screen.getByText('El ancho debe ser mayor a 0.')).toBeInTheDocument();
      expect(screen.getByText('El alto debe ser mayor a 0.')).toBeInTheDocument();

      const saveBtn = screen.getByRole('button', { name: 'Guardar retazo' });
      expect(saveBtn).toBeDisabled();
    });

    it('crea un retazo manual usando enqueueOperation en lugar de local (Fase 5B.7)', async () => {
      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('+ Registrar retazo manual'));
      
      fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'MANUAL-123' } });
      fireEvent.change(screen.getByLabelText(/Familia \/ Línea/), { target: { value: 'Test Family' } });
      fireEvent.change(screen.getByLabelText(/Color \/ Descripción/), { target: { value: 'Test Color' } });
      fireEvent.change(screen.getByLabelText(/Ancho/), { target: { value: '1.5' } });
      fireEvent.change(screen.getByLabelText(/Alto/), { target: { value: '2.0' } });

      const saveBtn = screen.getByRole('button', { name: 'Guardar retazo' });
      expect(saveBtn).not.toBeDisabled();
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
          type: 'upsert_item',
          payload: expect.objectContaining({
            code: 'MANUAL-123',
            material_kind: 'fabric',
            status: 'available'
          })
        }));
        expect(enqueueOperationMock).toHaveBeenCalledWith(expect.objectContaining({
          type: 'create_movement',
          payload: expect.objectContaining({
            action: 'create_scrap'
          })
        }));
      });

      expect(addFabricScrapMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('la acción de exportar no explota', async () => {
      render(<InventoryPanelV2 />);
      const exportBtn = screen.getByRole('button', { name: /Exportar lista/i });
      fireEvent.click(exportBtn);
      // Solo verificamos que se puede hacer clic y no lanza error de render.
      // El test completo de Excel requeriría mock de XLSX o lib.
    });

    it('la acción de refrescar no explota y funciona', () => {
      render(<InventoryPanelV2 />);
      const refreshBtn = screen.getByTitle('Actualizar datos visuales');
      fireEvent.click(refreshBtn);
      // Solo verificamos que no lanza errores (limpia selección y filtros en el estado local)
    });
  });
});
