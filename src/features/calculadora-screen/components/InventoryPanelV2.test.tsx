import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InventoryPanelV2 } from './InventoryPanelV2';
import { useCalculatorStore } from '../store/useCalculatorStore';

vi.mock('../store/useCalculatorStore', () => {
  return {
    useCalculatorStore: vi.fn(),
  };
});

describe('InventoryPanelV2', () => {
  beforeEach(() => {
    // Basic mock setup
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        productionInventory: { fabrics: [], tubes: [], bottoms: [] },
        discardInventoryItem: vi.fn(),
        remainders: [
          {
            id: 'test-tube',
            sku: '0-154-TU-50001',
            description: 'Tubo Motor 50mm',
            originalLengthFt: 19,
            remainingLengthFt: 6.56168, // 2 metros
            consumedByOrderIds: [],
            createdFromOrderId: 'test-order-1',
            createdAt: '2023-10-01T10:00:00.000Z',
            status: 'available',
          },
          {
            id: 'test-bottom',
            sku: '0-151-AL-CLZ19',
            description: 'Bottomrail Bronze',
            originalLengthFt: 19,
            remainingLengthFt: 3.28084, // 1 metro
            consumedByOrderIds: [],
            createdFromOrderId: 'test-order-1',
            createdAt: '2023-10-01T10:00:00.000Z',
            status: 'available',
          },
          {
            id: 'test-consumed',
            sku: '0-154-TU-50001',
            description: 'Tubo Consumido',
            originalLengthFt: 19,
            remainingLengthFt: 1,
            consumedByOrderIds: [],
            createdFromOrderId: 'test-order-1',
            createdAt: '2023-10-01T10:00:00.000Z',
            status: 'consumed',
          },
        ],
        savedOrders: [
          {
            id: 'test-order-1',
            orderNumber: 'ORD-0225',
          }
        ],
        setRemainders: vi.fn()
      };
      return selector(state);
    });
  });

  it('muestra retazos de tubo disponibles', () => {
    render(<InventoryPanelV2 />);
    
    // Cambiar a la pestaña de sobrantes lineales
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.getByText('Tubo Motor 50mm')).toBeInTheDocument();
    expect(screen.getByText('Tubo')).toBeInTheDocument();
  });

  it('muestra retazos de bottomrail disponibles', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.getByText('Bottomrail Bronze')).toBeInTheDocument();
    expect(screen.getByText('Bottomrail')).toBeInTheDocument();
  });

  it('no muestra sobrantes consumidos o descartados', () => {
    render(<InventoryPanelV2 />);
    
    const btn = screen.getByText('Sobrantes Lineales');
    fireEvent.click(btn);

    expect(screen.queryByText('Tubo Consumido')).not.toBeInTheDocument();
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
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        productionInventory: { fabrics: [], tubes: [], bottoms: [] },
        discardInventoryItem: vi.fn(),
        remainders: [],
        savedOrders: [],
        setRemainders: vi.fn()
      };
      return selector(state);
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
      fireEvent.click(screen.getByText('Tubo Motor 50mm'));

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

    it('descarta un sobrante lineal al confirmar', () => {
      let setRemaindersMock = vi.fn();
      vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
        const state = {
          productionInventory: { fabrics: [], tubes: [], bottoms: [] },
          discardInventoryItem: vi.fn(),
          remainders: [{
            id: 'test-tube',
            sku: '0-154-TU-50001',
            description: 'Tubo Motor 50mm',
            originalLengthFt: 19,
            remainingLengthFt: 6.56168,
            consumedByOrderIds: [],
            createdFromOrderId: 'test-order-1',
            createdAt: '2023-10-01T10:00:00.000Z',
            status: 'available',
          }],
          savedOrders: [],
          setRemainders: setRemaindersMock
        };
        return selector(state);
      });

      render(<InventoryPanelV2 />);
      fireEvent.click(screen.getByText('Sobrantes Lineales'));
      fireEvent.click(screen.getByText('Tubo Motor 50mm'));
      
      // Clic dar de baja en el panel detalle
      fireEvent.click(screen.getByText('Dar de baja'));
      
      // Confirmar en el modal
      // Hay 2 botones 'Dar de baja' en este punto (uno en el panel detalle, otro en el modal)
      // Buscamos el del modal
      const confirmBtns = screen.getAllByRole('button', { name: 'Dar de baja' });
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);

      expect(setRemaindersMock).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'test-tube', status: 'discarded' })
      ]);
      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('descarta un retazo de tela al confirmar', () => {
      let discardItemMock = vi.fn();
      vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
        const state = {
          productionInventory: { fabrics: [
            { id: 'fab-1', kind: 'scrap', status: 'available', code: 'RET-001', family: 'Roller', color: 'White', widthMeters: 1, lengthMeters: 1, createdAt: '2023-10-01' }
          ], tubes: [], bottoms: [] },
          discardInventoryItem: discardItemMock,
          remainders: [],
          savedOrders: [],
          setRemainders: vi.fn()
        };
        return selector(state);
      });

      render(<InventoryPanelV2 />);
      
      // Seleccionar el retazo (por defecto en la pestaña telas)
      fireEvent.click(screen.getByText('RET-001'));
      
      // Abrir modal
      fireEvent.click(screen.getByText('Dar de baja'));
      
      expect(screen.getByText(/¿Dar de baja retazo RET-001\?/)).toBeInTheDocument();
      
      // Confirmar
      const confirmBtns = screen.getAllByRole('button', { name: 'Dar de baja' });
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);

      expect(discardItemMock).toHaveBeenCalledWith('fab-1', 'fabric');
    });
  });

  describe('Botones Superiores', () => {
    let addFabricScrapMock: any;
    
    beforeEach(() => {
      addFabricScrapMock = vi.fn();
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

    it('crea un retazo manual con los datos correctos', () => {
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

      expect(addFabricScrapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MANUAL-123',
          family: 'Test Family',
          color: 'Test Color',
          widthMeters: 1.5,
          lengthMeters: 2.0,
          kind: 'scrap',
          status: 'available',
          source: 'manual'
        })
      );
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
