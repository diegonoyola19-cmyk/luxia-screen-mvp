import { describe, it, expect } from 'vitest';
import { calculateScreenMaterials } from './screen';
import { DEFAULT_SCREEN_RULE_CONFIG } from './constants';
import { optimizeCuts } from './cuttingOptimizer';
import { ProductionBatchItem } from './types';

describe('Flujo completo de Edge Roll Fit', () => {
  it('Mantiene edgeRollFit al agregar a lote y no genera errores de corte', () => {
    // 1. Calcular cortina límite
    const input = {
      curtainType: 'screen' as const,
      fabricFamily: 'AURA',
      fabricOpenness: '5%',
      fabricColor: 'White',
      widthMeters: 2.959,
      heightMeters: 2.8,
      hardwareTone: 'white' as const,
      mountingSystem: 'standard' as const,
    };
    const rollWidths = [2.5, 3.0];
    
    const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, rollWidths);
    
    // 2. Confirmar edgeRollFit
    expect(result.edgeRollFit).toBe(true);
    expect(result.cutWidthMeters).toBe(3.0); // Exactly the roll limit
    
    // 3. Simular "Agregar a lote" (como lo hace ProductionModuleV2)
    const batchItem: ProductionBatchItem = {
      id: 'test-item-1',
      input: input,
      result: result, // Ahora se pasa el result
    };
    
    // 4. Pasar por el optimizador de corte (cuttingOptimizer) que es quien agrupaba y generaba errores
    const cuttingGroups = optimizeCuts([batchItem], rollWidths, DEFAULT_SCREEN_RULE_CONFIG);
    
    // 5. Verificar que el optimizador no lanza "error" de ancho excedido
    expect(cuttingGroups).toHaveLength(1);
    const group = cuttingGroups[0];
    expect(group.error).toBeUndefined(); // NO DEBE HABER ERROR DE 'Ancho excedido'
    expect(group.totalCutWidth).toBe(3.0); // Exactamente el ancho del rollo
    expect(group.waste).toBeCloseTo(0); // Cero desperdicio horizontal
  });

  it('Sigue bloqueando cuando la medida excede el rollo sin edgeRollFit', () => {
    const input = {
      curtainType: 'screen' as const,
      fabricFamily: 'AURA',
      fabricOpenness: '5%',
      fabricColor: 'White',
      widthMeters: 3.010, // Excede rollo
      heightMeters: 2.8,
    };
    const rollWidths = [2.5, 3.0];
    
    expect(() => calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, rollWidths))
      .toThrowError(/No se puede fabricar esta cortina/);
  });
});
