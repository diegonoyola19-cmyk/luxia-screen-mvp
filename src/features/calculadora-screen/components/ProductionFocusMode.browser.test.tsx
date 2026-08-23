import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductionModuleV2 } from './ProductionModuleV2';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useCalculatorDerivedState } from '../hooks/useCalculatorDerivedState';
import { useDoubleBracketWidthGuard } from '../hooks/useDoubleBracketWidthGuard';

vi.mock('../store/useCalculatorStore', () => ({
  useCalculatorStore: vi.fn(),
}));

vi.mock('../hooks/useCalculatorDerivedState', () => ({
  useCalculatorDerivedState: vi.fn(),
}));

vi.mock('../hooks/useDoubleBracketWidthGuard', () => ({
  useDoubleBracketWidthGuard: vi.fn(),
}));

global.requestAnimationFrame = (cb) => { cb(Date.now()); return 0; };
window.requestAnimationFrame = global.requestAnimationFrame;

describe('Production Focus Mode — Rebalanced Layout & Manufacturing Preview Tests', () => {
  let addProductionItemMock: any;
  let setFormValueMock: any;
  let setMountingSystemMock: any;
  let saveOrderMock: any;
  let setSelectedWastePieceIdMock: any;
  let handleNewCurtainMock: any;

  beforeEach(() => {
    addProductionItemMock = vi.fn();
    setFormValueMock = vi.fn();
    setMountingSystemMock = vi.fn();
    saveOrderMock = vi.fn();
    setSelectedWastePieceIdMock = vi.fn();
    handleNewCurtainMock = vi.fn();

    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: {
          fabricFamily: 'Screen 5%',
          fabricOpenness: '5%',
          fabricColor: 'White',
          widthMeters: '1.5',
          heightMeters: '2.0',
          driveType: 'manual',
        },
        orderDraft: { orderNumber: 'ORD-2026-001' },
        cuttingGroups: [
          {
            id: 'g-1',
            totalCutWidth: 1.5,
            rollWidth: 2.5,
            waste: 1.0,
            yd2Consumed: 4.5,
            items: [
              {
                id: 'item-1',
                input: { widthMeters: 1.5, heightMeters: 2.0, fabricFamily: 'Screen 5%', fabricColor: 'White', mountingSystem: 'standard' },
                result: { orientationUsed: 'normal', edgeRollFit: false, tubeRecommendation: 'Tubo NEO 38mm' }
              }
            ]
          }
        ],
        itemsAProducir: [{ id: 'item-1' }],
        mountingSystem: 'standard',
        hardwareTone: 'white',
        selectedWastePieceId: null,
        setFormValue: setFormValueMock,
        setFabricFamily: vi.fn(),
        setFabricOpenness: vi.fn(),
        setFabricColor: vi.fn(),
        setMountingSystem: setMountingSystemMock,
        setHardwareTone: vi.fn(),
        setOrderNumber: vi.fn(),
        addProductionItem: addProductionItemMock,
        removeProductionItem: vi.fn(),
        saveOrder: saveOrderMock,
        setSelectedWastePieceId: setSelectedWastePieceIdMock,
        handleFieldBlur: vi.fn(),
        handleNewCurtain: handleNewCurtainMock,
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%', 'Screen 1%'],
      fabricOpennessOptions: ['5%', '1%'],
      fabricColorOptions: [{ color: 'White' }, { color: 'Grey' }],
      parsedFormValues: {
        curtainType: 'roller',
        widthMeters: 1.5,
        heightMeters: 2.0,
        fabricFamily: 'Screen 5%',
        fabricOpenness: '5%',
        fabricColor: 'White',
      },
      displayResult: {
        rollWidthMeters: 2.5,
        cutWidthMeters: 1.5,
        cutLengthMeters: 2.2,
        wasteMeters: 1.0,
        wastePercentage: 40,
        fabricDownloadedYd2: 4.5,
        wasteYd2: 0.5,
        tubeRecommendation: 'Tubo de 38mm NEO',
        orientationUsed: 'normal',
        edgeRollFit: false,
      },
      selectedFabricPreview: null,
      colorWasteMatches: [],
      colorWastePieces: [],
      selectedWasteMatch: null,
      hasValidDimensions: true,
      displayErrors: {},
    } as any);

    vi.mocked(useDoubleBracketWidthGuard).mockReturnValue({
      needsConfirmation: false,
      approvalState: 'within_limit',
      specialFabricationMeta: undefined,
      handleConfirm: vi.fn(),
      handleCancel: vi.fn(),
    });
  });

  // 1. Preview vacío
  it('1. Renderiza el estado vacío de preview cuando no hay dimensiones ni persianas en lote', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '', heightMeters: '', driveType: 'manual' },
        orderDraft: { orderNumber: '' },
        cuttingGroups: [],
        itemsAProducir: [],
        mountingSystem: 'standard',
        hardwareTone: 'white',
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: null,
      displayResult: null,
      hasValidDimensions: false,
      displayErrors: {},
      colorWasteMatches: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/Configura una persiana/i)).toBeInTheDocument();
    expect(screen.getByText(/Ingresa dimensiones para ver la disposición/i)).toBeInTheDocument();
  });

  // 2. Preview con configuración válida estimada (sin lote)
  it('2. Muestra vista previa estimada cuando hay dimensiones válidas pero el lote está vacío', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '1.50', heightMeters: '2.00', driveType: 'manual', fabricFamily: 'Screen 5%', fabricColor: 'White' },
        orderDraft: { orderNumber: '' },
        cuttingGroups: [],
        itemsAProducir: [],
        mountingSystem: 'standard',
        hardwareTone: 'white',
      };
      return selector ? selector(state) : state;
    });

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/Vista Previa Estimada/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimación actual/i)).toBeInTheDocument();
    expect(screen.getByText(/Cortina 1 · 1.50m/i)).toBeInTheDocument();
  });

  // 3. Preview con una pieza en lote
  it('3. Muestra preview de fabricación para 1 pieza agregada al lote', () => {
    render(<ProductionModuleV2 />);
    expect(screen.getByText(/Preview de Fabricación/i)).toBeInTheDocument();
    expect(screen.getByText(/1 corte activo/i)).toBeInTheDocument();
    expect(screen.getByText(/P1 · 1.50m/i)).toBeInTheDocument();
  });

  // 4. Preview con varias piezas en lote
  it('4. Muestra preview de fabricación para corte con múltiples piezas en un rollo', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '1.0', heightMeters: '2.0', driveType: 'manual' },
        orderDraft: { orderNumber: 'ORD-002' },
        cuttingGroups: [
          {
            id: 'g-multi',
            totalCutWidth: 2.2,
            rollWidth: 2.5,
            waste: 0.3,
            items: [
              { id: 'i-1', input: { widthMeters: 1.30, heightMeters: 1.5, fabricFamily: 'Screen', fabricColor: 'White', mountingSystem: 'standard' } },
              { id: 'i-2', input: { widthMeters: 0.90, heightMeters: 1.5, fabricFamily: 'Screen', fabricColor: 'White', mountingSystem: 'standard' } }
            ]
          }
        ],
        itemsAProducir: [{ id: 'i-1' }, { id: 'i-2' }],
        mountingSystem: 'standard',
        hardwareTone: 'white',
      };
      return selector ? selector(state) : state;
    });

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/P1 · 1.30m/i)).toBeInTheDocument();
    expect(screen.getByText(/P2 · 0.90m/i)).toBeInTheDocument();
  });

  // 5. Preview rotado
  it('5. Muestra badge y detalle de rotación 90° cuando aplica', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '3.20', heightMeters: '1.50', driveType: 'manual', fabricFamily: 'Screen 5%', fabricColor: 'White' },
        orderDraft: { orderNumber: 'ORD-003' },
        cuttingGroups: [],
        itemsAProducir: [],
        mountingSystem: 'standard',
        hardwareTone: 'white',
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: { widthMeters: 3.2, heightMeters: 1.5, fabricFamily: 'Screen 5%', fabricColor: 'White' },
      displayResult: {
        rollWidthMeters: 2.5,
        cutWidthMeters: 1.5,
        orientationUsed: 'volteada',
        oversizedRotated: true,
        wasteMeters: 1.0,
      },
      hasValidDimensions: true,
      displayErrors: {},
      colorWasteMatches: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getAllByText(/↻ Rotada 90°/i).length).toBeGreaterThan(0);
  });

  // 6. Preview edge roll fit
  it('6. Muestra badge de Fit al Rollo en el preview', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '2.48', heightMeters: '1.50', driveType: 'manual', fabricFamily: 'Screen 5%', fabricColor: 'White' },
        orderDraft: { orderNumber: 'ORD-004' },
        cuttingGroups: [],
        itemsAProducir: [],
        mountingSystem: 'standard',
        hardwareTone: 'white',
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: { widthMeters: 2.48, heightMeters: 1.5, fabricFamily: 'Screen 5%', fabricColor: 'White' },
      displayResult: {
        rollWidthMeters: 2.5,
        cutWidthMeters: 2.48,
        orientationUsed: 'normal',
        edgeRollFit: true,
        wasteMeters: 0.02,
      },
      hasValidDimensions: true,
      displayErrors: {},
      colorWasteMatches: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getAllByText(/Fit al Rollo/i).length).toBeGreaterThan(0);
  });

  // 7. Opciones avanzadas en panel derecho
  it('7. Opciones avanzadas están en el panel derecho y se despliegan correctamente', () => {
    render(<ProductionModuleV2 />);
    const toggle = screen.getByRole('button', { name: /Opciones avanzadas/i });
    expect(toggle).toBeInTheDocument();
    
    // Al inicio está cerrado
    expect(screen.queryByText(/Tono de Herrajes/i)).not.toBeInTheDocument();

    // Al hacer click, se abre
    fireEvent.click(toggle);
    expect(screen.getByText(/Tono de Herrajes/i)).toBeInTheDocument();
  });

  // 8. Retazos funcionan dentro de opciones avanzadas
  it('8. Permite seleccionar retazo dentro de opciones avanzadas', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: { widthMeters: 1.5, heightMeters: 2.0, fabricFamily: 'Screen 5%', fabricColor: 'White' },
      displayResult: { fabricDownloadedYd2: 4.5, wasteYd2: 0.5 },
      hasValidDimensions: true,
      displayErrors: {},
      colorWasteMatches: [
        { wastePiece: { id: 'scrap-1', widthMeters: 1.6, heightMeters: 2.1 } }
      ],
    } as any);

    render(<ProductionModuleV2 />);
    // Abrir opciones avanzadas
    fireEvent.click(screen.getByRole('button', { name: /Opciones avanzadas/i }));
    expect(screen.getByText(/Gestión de Retazos/i)).toBeInTheDocument();

    // Expandir retazos
    fireEvent.click(screen.getByRole('button', { name: /Expandir/i }));
    expect(screen.getByText(/1.60m × 2.10m/i)).toBeInTheDocument();

    // Seleccionar retazo
    fireEvent.click(screen.getByText(/1.60m × 2.10m/i));
    expect(setSelectedWastePieceIdMock).toHaveBeenCalledWith('scrap-1');
  });

  // 9. Add to Batch sigue funcionando con el botón [+]
  it('9. Botón [+] inline añade la cortina al store', () => {
    render(<ProductionModuleV2 />);
    const addBtn = screen.getByRole('button', { name: /Agregar persiana al lote/i });
    expect(addBtn).not.toBeDisabled();
    fireEvent.click(addBtn);
    expect(addProductionItemMock).toHaveBeenCalled();
  });

  // 10. Save Order sigue funcionando
  it('10. Botón Guardar Orden guarda la orden en el store', async () => {
    render(<ProductionModuleV2 />);
    const saveBtn = screen.getByRole('button', { name: /Guardar Orden · 1 persiana/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(saveOrderMock).toHaveBeenCalled();
  });

  // 11. Motorized sigue disabled
  it('11. Motorizado permanece disabled visual y semánticamente', () => {
    render(<ProductionModuleV2 />);
    const motorizedBtn = screen.getByRole('button', { name: /Motorizado \(No disp\.\)/i });
    expect(motorizedBtn).toBeDisabled();
    expect(motorizedBtn).toHaveClass('pv2-segmented-btn--disabled');
  });

  // 12. BOM drawer sigue funcionando
  it('12. Drawer de BOM se abre al hacer click en Ver BOM', () => {
    render(<ProductionModuleV2 />);
    const openBomBtn = screen.getByLabelText(/Ver desglose completo de BOM/i);
    fireEvent.click(openBomBtn);
    expect(screen.getByRole('dialog', { name: /Desglose Completo de Herrajes BOM/i })).toBeInTheDocument();
  });

  // 13. Mesa activa en header derecho
  it('13. Muestra el estado compacto de Mesa activa en el header del panel derecho', () => {
    render(<ProductionModuleV2 />);
    expect(screen.getByText(/Mesa activa/i)).toBeInTheDocument();
  });

  // 14. Detalle de Fabricación Modal/Drawer
  it('14. Abre y cierra el Drawer de Detalle de Fabricación al pulsar Ver detalle', () => {
    render(<ProductionModuleV2 />);
    const detailBtn = screen.getByRole('button', { name: /Ver detalle completo de fabricación/i });
    fireEvent.click(detailBtn);
    expect(screen.getByRole('dialog', { name: /Detalle Completo de Fabricación y Corte/i })).toBeInTheDocument();
    expect(screen.getByText(/Especificaciones Técnicas/i)).toBeInTheDocument();
    
    // Cerrar detalle
    const closeBtn = screen.getByRole('button', { name: /Cerrar detalle de fabricación/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: /Detalle Completo de Fabricación y Corte/i })).not.toBeInTheDocument();
  });

  // 15. Colapso y expansión del preview
  it('15. Permite plegar y desplegar el Preview de Fabricación', () => {
    render(<ProductionModuleV2 />);
    const toggleBtn = screen.getByRole('button', { name: /Ocultar/i });
    fireEvent.click(toggleBtn);
    expect(screen.queryByText(/P1 · 1.50m/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mostrar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mostrar/i }));
    expect(screen.getByText(/P1 · 1.50m/i)).toBeInTheDocument();
  });

  // 16. Keyboard Flow (Enter en Cantidad)
  it('16. Presionar Enter en el input de Cantidad añade la persiana al lote', () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText(/Cantidad/i);
    fireEvent.keyDown(qtyInput, { key: 'Enter' });
    expect(addProductionItemMock).toHaveBeenCalled();
  });

  // 17. Botón [+] disabled cuando no hay dimensiones válidas
  it('17. Botón [+] está disabled cuando no hay dimensiones válidas', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: { curtainType: 'roller', widthMeters: undefined, heightMeters: undefined },
      displayResult: null,
      hasValidDimensions: false,
      displayErrors: { widthMeters: 'Requerido' },
      colorWasteMatches: [],
    } as any);

    render(<ProductionModuleV2 />);
    const addBtn = screen.getByRole('button', { name: /Agregar persiana al lote/i });
    expect(addBtn).toBeDisabled();
  });

  // 18. Botón Reset discreto
  it('18. Botón Reset discreto ejecuta handleNewCurtain', () => {
    render(<ProductionModuleV2 />);
    const resetBtn = screen.getByRole('button', { name: /Limpiar persiana actual/i });
    fireEvent.click(resetBtn);
    expect(handleNewCurtainMock).toHaveBeenCalled();
  });

  // 19. Rotación requerida bloquea canAdd hasta ser confirmada
  it('19. Botón + Agregar bloqueado si la rotación requerida no está confirmada, y activo al confirmar', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: { curtainType: 'roller', widthMeters: 5.67, heightMeters: 2.48, fabricFamily: 'Screen 5%', fabricOpenness: '5%', fabricColor: 'White' },
      displayResult: {
        oversizedRotated: true,
        orientationUsed: 'volteada',
        tubeRecommendation: 'Tubo 50mm',
        fabricDownloadedYd2: 15.6,
        wasteYd2: 1.2,
      },
      hasValidDimensions: true,
      displayErrors: {},
      colorWasteMatches: [],
    } as any);

    render(<ProductionModuleV2 />);
    const addBtn = screen.getByRole('button', { name: /Agregar persiana al lote/i });
    expect(addBtn).toBeDisabled();

    // Check confirmation checkbox
    const checkbox = screen.getByRole('checkbox', { name: /Confirmo fabricar esta cortina rotada/i });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(addBtn).not.toBeDisabled();

    fireEvent.click(addBtn);
    expect(addProductionItemMock).toHaveBeenCalled();
  });

  // 20. Motorizado bloquea canAdd
  it('20. Botón + Agregar bloqueado si driveType es motorized', () => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: {
          fabricFamily: 'Screen 5%',
          fabricOpenness: '5%',
          fabricColor: 'White',
          widthMeters: '1.5',
          heightMeters: '2.0',
          driveType: 'motorized',
        },
        orderDraft: { orderNumber: 'ORD-2026-001' },
        cuttingGroups: [],
        itemsAProducir: [],
        mountingSystem: 'standard',
        hardwareTone: 'white',
        selectedWastePieceId: null,
        setFormValue: vi.fn(),
        setFabricFamily: vi.fn(),
        setFabricOpenness: vi.fn(),
        setFabricColor: vi.fn(),
        setMountingSystem: vi.fn(),
        setHardwareTone: vi.fn(),
        setOrderNumber: vi.fn(),
        addProductionItem: addProductionItemMock,
        removeProductionItem: vi.fn(),
        saveOrder: vi.fn(),
        setSelectedWastePieceId: vi.fn(),
        handleFieldBlur: vi.fn(),
        handleNewCurtain: handleNewCurtainMock,
      };
      return selector ? selector(state) : state;
    });

    render(<ProductionModuleV2 />);
    const addBtn = screen.getByRole('button', { name: /Agregar persiana al lote/i });
    expect(addBtn).toBeDisabled();
  });
});
