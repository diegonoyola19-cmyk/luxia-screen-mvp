import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalculatorDerivedState } from '../useCalculatorDerivedState';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import { useGlobalInventoryStore } from '../../../../store/useGlobalInventoryStore';
import { resolveFabricSelection } from '../../../../lib/priceCatalog';
import { calculateScreenMaterials } from '../../../../domain/curtains/screen';

vi.mock('../../../../domain/curtains/screen', () => ({
  calculateScreenMaterials: vi.fn(),
  findReusableWasteMatches: vi.fn(() => []),
}));

describe('useCalculatorDerivedState - Fabric Substitution', () => {
  beforeEach(() => {
    const calcStore = useCalculatorStore.getState();
    calcStore.clearOrder();
    
    const mockedResult = {
      curtainType: 'screen',
      recommendedRollWidthMeters: 2.5,
      cutWidthMeters: 1.5,
      cutLengthMeters: 2.0,
      occupiedRollWidthMeters: 2.5,
      wastePieceWidthMeters: 1.0,
      wastePieceHeightMeters: 2.0,
      fabricDownloadedM2: 5.0,
      fabricDownloadedYd2: 5.98,
      fabricUsefulM2: 3.0,
      fabricUsefulYd2: 3.58,
      wasteM2: 2.0,
      wasteYd2: 2.4,
      wastePercentage: 40,
      fabricCostPerYd2: 10,
      fabricDownloadedCost: 59.8,
      fabricUsefulCost: 35.8,
      fabricWasteCost: 24,
      fabricSavingsCost: 0,
      fixedComponents: [],
      requiresReinforcedTube: false,
      tubeMeters: 1.5,
      bottomRailMeters: 1.5,
      chainMeters: 2.0,
      tubeFeet: 5.0,
      bottomRailFeet: 5.0,
      chainFeet: 6.6,
      orientationUsed: 'normal',
      selectedFabric: null
    };

    (calculateScreenMaterials as any).mockReturnValue(mockedResult);

      useCalculatorStore.setState({
        formValues: {
          curtainType: 'screen',
          driveType: 'manual',
          fabricFamily: 'Screen',
          fabricOpenness: 'Screen',
          fabricColor: '3101-1% White',
          widthMeters: '1.5',
          heightMeters: '1.5',
        },
        blurredFields: {
          widthMeters: true,
          heightMeters: true
        },
        ruleConfig: {
          largeRollMeters: 3.0,
          smallRollMeters: 2.5,
          minWasteMeters: 0,
          maxWasteMeters: 10,
          priceBySquareMeter: false
        } as any,
        result: mockedResult as any
      });

    useGlobalInventoryStore.setState({ items: [], movements: [] });
  });

  it('no sustituye si el ancho de 2.50m tiene stock suficiente', async () => {
    // 2.5m x (height 1.5 + merma?) -> digamos 2.0 cut length
    // cutLength approx 1.83. Area approx 2.5 * 1.83 = 4.5 m2 -> 5.3 yd2
    useGlobalInventoryStore.setState({
      items: [
        {
          id: 'roll-250',
          category: 'fabric',
          kind: 'roll',
          status: 'available',
          code: 'TEST-250',
          payload: {
            family: 'Screen',
            openness: 'Screen',
            color: '3101-1% White',
            width_meters: 2.5,
            available_yd2: 100 // Suficiente
          },
          created_from_order_id: null,
          source: 'test'
        }
      ]
    });

    const { result } = renderHook(() => useCalculatorDerivedState());

    const displayResult = result.current.displayResult;
    console.log('HOOK VALUES', result.current.parsedFormValues, result.current.displayResult?.selectedFabric);
    
    // Al haber 2.50 disponible, escoge 2.50. (La tela ideal para 1.5 de ancho es 2.50)
    expect(displayResult?.selectedFabric?.widthMeters).toBe(2.5);
    expect(displayResult?.fabricSubstitution?.wasSubstituted).toBe(false);
    expect(displayResult?.fabricSubstitution?.reason).toBe('preferred_width_available');
  });

  it('sustituye a 3.00m si 2.50m no tiene stock, aumentando fabricDownloadedYd2 y wasteYd2', async () => {
    // 2.50 no tiene stock, 3.00 sí
    useGlobalInventoryStore.setState({
      items: [
        {
          id: 'roll-250',
          category: 'fabric',
          kind: 'roll',
          status: 'available',
          code: 'TEST-250',
          payload: {
            family: 'Screen',
            openness: 'Screen',
            color: '3101-1% White',
            width_meters: 2.5,
            available_yd2: 1 // Insuficiente
          },
          created_from_order_id: null,
          source: 'test'
        },
        {
          id: 'roll-300',
          category: 'fabric',
          kind: 'roll',
          status: 'available',
          code: 'TEST-300',
          payload: {
            family: 'Screen',
            openness: 'Screen',
            color: '3101-1% White',
            width_meters: 3.0,
            available_yd2: 100 // Suficiente
          },
          created_from_order_id: null,
          source: 'test'
        }
      ]
    });

    const { result, rerender } = renderHook(() => useCalculatorDerivedState());
    
    const displayResult = result.current.displayResult;
    expect(displayResult?.selectedFabric?.widthMeters).toBe(3.0); // Fue sustituido
    expect(displayResult?.fabricSubstitution?.wasSubstituted).toBe(true);
    expect(displayResult?.fabricSubstitution?.originalWidthMeters).toBe(2.5);
    expect(displayResult?.fabricSubstitution?.selectedWidthMeters).toBe(3.0);
    expect(displayResult?.fabricSubstitution?.reason).toBe('substituted_to_larger_width');
    expect(displayResult?.fabricSubstitution?.selectedInventoryItemId).toBe('roll-300');

    // Mermas y M2 deberían reflejar rollo de 3.0
    expect(displayResult?.recommendedRollWidthMeters).toBe(3.0);
    expect(displayResult?.wastePieceWidthMeters).toBeCloseTo(3.0 - 2.5, 1);
  });

  it('si no hay stock en absoluto, emite warning y no crashea', async () => {
    useGlobalInventoryStore.setState({
      items: []
    });

    const { result } = renderHook(() => useCalculatorDerivedState());
    
    const displayResult = result.current.displayResult;
    // Mantiene el base
    expect(displayResult?.selectedFabric?.widthMeters).toBe(2.5);
    expect(displayResult?.fabricSubstitution?.wasSubstituted).toBe(false);
    expect(displayResult?.fabricSubstitution?.reason).toBe('no_stock_available');
    
    const warning = displayResult?.fabricSubstitution?.warnings?.find(w => w.code === 'INSUFFICIENT_STOCK');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('error');
  });
});
