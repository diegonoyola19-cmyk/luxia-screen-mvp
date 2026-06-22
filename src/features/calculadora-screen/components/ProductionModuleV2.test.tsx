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

// Mock window.matchMedia if needed by framer-motion or other libs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('ProductionModuleV2 - Cantidad múltiple', () => {
  let addProductionItemMock: any;
  let setFormValueMock: any;

  beforeEach(() => {
    addProductionItemMock = vi.fn();
    setFormValueMock = vi.fn();

    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: {
          fabricFamily: 'Roller',
          fabricOpenness: '5%',
          fabricColor: 'White',
          widthMeters: '1.5',
          heightMeters: '2.0',
        },
        orderDraft: { orderNumber: 'ORD-001' },
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

    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      fabricFamilies: ['Roller'],
      fabricOpennessOptions: ['5%'],
      fabricColorOptions: [{ color: 'White' }],
      parsedFormValues: {
        curtainType: 'roller',
        widthMeters: 1.5,
        heightMeters: 2.0,
        fabricFamily: 'Roller',
        fabricOpenness: '5%',
        fabricColor: 'White',
      },
      displayResult: {
        cutWidthMeters: 1.5,
        cutLengthMeters: 2.2,
        fabricDownloadedYd2: 4,
        wasteYd2: 0,
        tubeRecommendation: '',
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
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cantidad default es 1 y el botón muestra "Agregar a Lote"', () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad') as HTMLInputElement;
    expect(qtyInput.value).toBe('1');
    expect(screen.getByRole('button', { name: /Agregar/i })).toBeInTheDocument();
  });

  it('cantidad inválida se normaliza a 1 al hacer submit', () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad');
    fireEvent.change(qtyInput, { target: { value: '0' } });
    
    // The button might still say "Agregar a Lote" if qty < 1
    const addBtn = screen.getByRole('button', { name: /Agregar/i });
    fireEvent.click(addBtn);

    expect(addProductionItemMock).toHaveBeenCalledTimes(1);
  });

  it('cantidad 3 agrega 3 items al lote con ids únicos', async () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad');
    fireEvent.change(qtyInput, { target: { value: '3' } });

    const addBtn = screen.getByRole('button', { name: /Agregar/i });
    fireEvent.click(addBtn);

    expect(addProductionItemMock).toHaveBeenCalledTimes(3);
    
    const call1 = addProductionItemMock.mock.calls[0][0];
    const call2 = addProductionItemMock.mock.calls[1][0];
    const call3 = addProductionItemMock.mock.calls[2][0];

    // IDs should be unique
    expect(call1.id).not.toBe(call2.id);
    expect(call2.id).not.toBe(call3.id);
    expect(call1.id).not.toBe(call3.id);

    // Other props should be identical
    expect(call1.input.widthMeters).toBe(1.5);
    expect(call2.input.widthMeters).toBe(1.5);
    expect(call3.input.widthMeters).toBe(1.5);
  });

  it('después de agregar, la cantidad vuelve a 1', async () => {
    render(<ProductionModuleV2 />);
    const qtyInput = screen.getByLabelText('Cantidad') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '3' } });
    
    const addBtn = screen.getByRole('button', { name: /Agregar/i });
    fireEvent.click(addBtn);

    // Cantidad should be reset to 1
    await waitFor(() => expect(qtyInput.value).toBe('1'));
    expect(screen.getByRole('button', { name: /Agregar/i })).toBeInTheDocument();
  });
});

describe('ProductionModuleV2 - Fabric Substitution Alerts', () => {
  beforeEach(() => {
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => {
      const state = {
        formValues: { widthMeters: '1.5', heightMeters: '2.0', fabricColor: 'White' },
        orderDraft: { orderNumber: 'ORD-001' },
        cuttingGroups: [],
        itemsAProducir: [],
      };
      return selector ? selector(state) : state;
    });
    vi.mocked(useDoubleBracketWidthGuard).mockReturnValue({ approvalState: 'idle' } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('No muestra alerta si fabricSubstitution no existe', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      parsedFormValues: {},
      displayResult: { fabricSubstitution: undefined },
      displayErrors: {},
      colorWasteMatches: [],
      fabricFamilies: [],
      fabricOpennessOptions: [],
      fabricColorOptions: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.queryByText(/Stock insuficiente/i)).not.toBeInTheDocument();
  });

  it('No muestra alerta si fabricSubstitution.wasSubstituted=false', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      parsedFormValues: {},
      displayResult: { fabricSubstitution: { wasSubstituted: false } },
      displayErrors: {},
      colorWasteMatches: [],
      fabricFamilies: [],
      fabricOpennessOptions: [],
      fabricColorOptions: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.queryByText(/Stock insuficiente/i)).not.toBeInTheDocument();
  });

  it('Muestra alerta de warning (no stock suficiente) si wasSubstituted=false pero hay warning de error', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      parsedFormValues: {},
      displayResult: { 
        fabricSubstitution: { 
          wasSubstituted: false,
          warnings: [{ code: 'INSUFFICIENT_STOCK', severity: 'error', message: '...' }]
        } 
      },
      displayErrors: {},
      colorWasteMatches: [],
      fabricFamilies: [],
      fabricOpennessOptions: [],
      fabricColorOptions: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/No hay stock suficiente para la tela seleccionada/i)).toBeInTheDocument();
  });

  it('Muestra alerta si fabricSubstitution.wasSubstituted=true con detalles', () => {
    vi.mocked(useCalculatorDerivedState).mockReturnValue({
      parsedFormValues: {},
      displayResult: { 
        fabricSubstitution: { 
          wasSubstituted: true,
          originalWidthMeters: 2.5,
          selectedWidthMeters: 3.0,
          requiredYd2: 5.5,
          availableYd2: 1.2
        } 
      },
      displayErrors: {},
      colorWasteMatches: [],
      fabricFamilies: [],
      fabricOpennessOptions: [],
      fabricColorOptions: [],
    } as any);

    render(<ProductionModuleV2 />);
    expect(screen.getByText(/No hay stock en ancho 2.50m. Se usará ancho 3.00m porque cubre el requerimiento./i)).toBeInTheDocument();
    expect(screen.getByText(/Requiere 5.50 yd². Disponible: 1.20 yd²./i)).toBeInTheDocument();
  });
});
