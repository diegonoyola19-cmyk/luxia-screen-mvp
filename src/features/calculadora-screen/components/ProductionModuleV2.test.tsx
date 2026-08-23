import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Mock requestAnimationFrame for tests since handleAddToBatch uses it
global.requestAnimationFrame = (callback) => {
  callback(Date.now());
  return 0;
};
window.requestAnimationFrame = global.requestAnimationFrame;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('ProductionModuleV2 — Focus Mode & Ergonomics', () => {
  let addProductionItemMock: any;
  let removeProductionItemMock: any;
  let setFormValueMock: any;
  let setMountingSystemMock: any;
  let saveOrderMock: any;

  beforeEach(() => {
    addProductionItemMock = vi.fn();
    removeProductionItemMock = vi.fn();
    setFormValueMock = vi.fn();
    setMountingSystemMock = vi.fn();
    saveOrderMock = vi.fn();

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
            id: 'group-1',
            totalCutWidth: 1.5,
            rollWidth: 2.5,
            waste: 1.0,
            yd2Consumed: 4.5,
            items: [
              {
                id: 'item-1',
                input: { widthMeters: 1.5, heightMeters: 2.0 },
              }
            ]
          }
        ],
        itemsAProducir: [{ id: 'item-1' }],
        mountingSystem: 'standard',
        hardwareTone: 'white',
        savedOrders: [],
        setFormValue: setFormValueMock,
        setFabricFamily: vi.fn(),
        setFabricOpenness: vi.fn(),
        setFabricColor: vi.fn(),
        setMountingSystem: setMountingSystemMock,
        setHardwareTone: vi.fn(),
        setOrderNumber: vi.fn(),
        addProductionItem: addProductionItemMock,
        removeProductionItem: removeProductionItemMock,
        saveOrder: saveOrderMock,
        setSelectedWastePieceId: vi.fn(),
        handleFieldBlur: vi.fn(),
        handleNewCurtain: vi.fn(),
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
        cutWidthMeters: 1.5,
        cutLengthMeters: 2.2,
        fabricDownloadedYd2: 4.5,
        wasteYd2: 0.5,
        tubeRecommendation: '',
        fabricSubstitution: undefined,
      },
      selectedFabricPreview: null,
      colorWasteMatches: [],
      colorWastePieces: [],
      selectedWasteMatch: null,
      hasValidDimensions: true,
      displayErrors: {},
    } as any);

    vi.mocked(useDoubleBracketWidthGuard).mockReturnValue({
      approvalState: 'idle',
      specialFabricationMeta: null,
      modalOpen: false,
      widthM: 1.5,
      handleApprove: vi.fn(),
      handleCancel: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renderiza panel de captura y lote de producción en 2 columnas', () => {
    render(<ProductionModuleV2 />);
    expect(screen.getByText('Configuración de Persiana')).toBeInTheDocument();
    expect(screen.getByText('Lote de Producción')).toBeInTheDocument();
    expect(screen.getByText('1. Tela y Color')).toBeInTheDocument();
    expect(screen.getByText('2. Medidas y Montaje')).toBeInTheDocument();
    expect(screen.getByText('3. Manufactura & BOM')).toBeInTheDocument();
  });

  it('2. Muestra la tarjeta compacta de BOM V2 con botón para ver completo', () => {
    render(<ProductionModuleV2 />);
    expect(screen.getByText('BOM V2 Válido')).toBeInTheDocument();
    expect(screen.getByText(/0-154-TU-38111/i)).toBeInTheDocument();
    expect(screen.getByText(/Ver BOM/i)).toBeInTheDocument();
  });

  it('3. Abre el drawer lateral al pulsar "Ver BOM completo" y lo cierra con el botón X', () => {
    render(<ProductionModuleV2 />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const openBtn = screen.getByText(/Ver BOM/i);
    fireEvent.click(openBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Desglose de Herrajes · BOM V2')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Cerrar desglose BOM');
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('4. Cierra el drawer lateral de BOM al presionar la tecla Escape', () => {
    render(<ProductionModuleV2 />);
    fireEvent.click(screen.getByText(/Ver BOM/i));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('5. Acordeón de opciones avanzadas se expande y colapsa correctamente', () => {
    render(<ProductionModuleV2 />);
    expect(screen.queryByText('Tono de Herrajes')).not.toBeInTheDocument();

    const advancedToggle = screen.getByText('Opciones avanzadas');
    fireEvent.click(advancedToggle);

    expect(screen.getByText('Tono de Herrajes')).toBeInTheDocument();

    fireEvent.click(advancedToggle);
    expect(screen.queryByText('Tono de Herrajes')).not.toBeInTheDocument();
  });

  it('6. Selector de mounting system conmuta entre standard, pin_endplug y double_bracket', () => {
    render(<ProductionModuleV2 />);
    const pinBtn = screen.getByText('Pin EndPlug');
    fireEvent.click(pinBtn);
    expect(setMountingSystemMock).toHaveBeenCalledWith('pin_endplug');
  });

  it('7. Motorizado permanece visible con advertencia y bloqueado para agregar a lote', () => {
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
        setFormValue: setFormValueMock,
        addProductionItem: addProductionItemMock,
        setSelectedWastePieceId: vi.fn(),
        handleFieldBlur: vi.fn(),
        handleNewCurtain: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/Configuración motorizada no disponible en esta versión/i)).toBeInTheDocument();
    
    const addBtn = screen.getByRole('button', { name: /Agregar/i });
    expect(addBtn).toBeDisabled();
  });

  it('8. Permite agregar al lote presionando Enter en el campo Cantidad cuando es válido', () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad');
    fireEvent.keyDown(qtyInput, { key: 'Enter' });

    expect(addProductionItemMock).toHaveBeenCalledTimes(1);
  });

  it('9. NO permite agregar al lote con Enter si el formulario no es válido', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: [],
      fabricOpennessOptions: [],
      fabricColorOptions: [],
      parsedFormValues: {
        curtainType: 'roller',
        widthMeters: undefined,
        heightMeters: undefined,
      },
      displayResult: null,
      selectedFabricPreview: null,
      colorWasteMatches: [],
      colorWastePieces: [],
      selectedWasteMatch: null,
      hasValidDimensions: false,
      displayErrors: { widthMeters: 'Requerido' },
    } as any);

    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad');
    fireEvent.keyDown(qtyInput, { key: 'Enter' });

    expect(addProductionItemMock).not.toHaveBeenCalled();
  });

  it('10. Botón "Guardar Orden" en el panel del lote invoca store.saveOrder', async () => {
    render(<ProductionModuleV2 />);
    const saveBtn = screen.getByRole('button', { name: /Guardar Orden/i });
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() => expect(saveOrderMock).toHaveBeenCalledTimes(1));
  });

  it('11. Permite eliminar fila de cortes del lote activo', () => {
    render(<ProductionModuleV2 />);
    const deleteBtn = screen.getByTitle(/Eliminar fila del lote/i);
    fireEvent.click(deleteBtn);

    expect(removeProductionItemMock).toHaveBeenCalledWith('item-1');
  });

  it('12. Alertas críticas de rotación obligatoria permanecen visibles', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Screen 5%'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: {
        curtainType: 'roller',
        widthMeters: 3.2,
        heightMeters: 2.0,
        fabricFamily: 'Screen 5%',
        fabricOpenness: '5%',
        fabricColor: 'White',
      },
      displayResult: {
        cutWidthMeters: 3.2,
        cutLengthMeters: 2.2,
        fabricDownloadedYd2: 6.0,
        wasteYd2: 0.5,
        oversizedRotated: true,
      },
      selectedFabricPreview: null,
      colorWasteMatches: [],
      colorWastePieces: [],
      selectedWasteMatch: null,
      hasValidDimensions: true,
      displayErrors: {},
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getByText('Fabricación rotada requerida')).toBeInTheDocument();
    expect(screen.getByText('Confirmo fabricar esta cortina rotada')).toBeInTheDocument();
  });

  it('13. Deshabilita Guardar Orden y muestra aviso cuando el N° Orden está duplicado', () => {
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
        cuttingGroups: [{ 
          id: 'group-1', 
          totalCutWidth: 1.5,
          rollWidth: 2.5,
          waste: 1.0,
          yd2Consumed: 4.5,
          items: [{ id: 'item-1', input: { widthMeters: 1.5, heightMeters: 2.0 } }] 
        }],
        itemsAProducir: [{ id: 'item-1' }],
        mountingSystem: 'standard',
        hardwareTone: 'white',
        savedOrders: [{ id: 'saved-1', orderNumber: 'ORD-2026-001', items: [] }],
        setFormValue: vi.fn(),
        setOrderNumber: vi.fn(),
        saveOrder: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<ProductionModuleV2 />);
    const saveBtn = screen.getByRole('button', { name: /Guardar Orden/i });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(/Ya existe esta orden/i)).toBeInTheDocument();
  });
});
