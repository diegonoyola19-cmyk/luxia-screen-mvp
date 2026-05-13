import { describe, it, expect } from 'vitest';
import { validateScreenInput, calculateScreenMaterials, selectRollo } from './screen';
import { DEFAULT_SCREEN_RULE_CONFIG } from './constants';

describe('Screen Calculator Domain', () => {
  describe('validateScreenInput', () => {
    it('returns errors for empty input', () => {
      const errors = validateScreenInput({});
      expect(errors).toHaveProperty('curtainType');
      expect(errors).toHaveProperty('fabricFamily');
      expect(errors).toHaveProperty('widthMeters');
      expect(errors).toHaveProperty('heightMeters');
    });

    it('returns no errors for valid input', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 2.0,
        heightMeters: 2.5,
      };
      const errors = validateScreenInput(input);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('rejects widths over MAX_TUBE_WIDTH', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 6.0,
        heightMeters: 2.5,
      };
      const errors = validateScreenInput(input);
      expect(errors.widthMeters).toContain('Excede el ancho maximo de tubo');
    });
  });

  describe('selectRollo', () => {
    it('selects the smallest available roll that fits the cut', () => {
      expect(selectRollo(2.2, [2.5, 3.0])).toBe(2.5);
      expect(selectRollo(2.8, [2.5, 3.0])).toBe(3.0);
    });

    it('throws error if no roll fits', () => {
      expect(() => selectRollo(3.2, [2.5, 3.0])).toThrowError(/No hay rollo disponible/);
    });
  });

  describe('calculateScreenMaterials', () => {
    it('calculates materials correctly for normal orientation', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 2.0,
        heightMeters: 2.5,
      };
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [2.5, 3.0]);
      
      expect(result.orientationUsed).toBe('normal');
      expect(result.recommendedRollWidthMeters).toBe(2.5); // 2.1 < 2.5
      expect(result.cutWidthMeters).toBe(2.1); // width + 0.1
      expect(result.cutLengthMeters).toBe(2.9); // height + 0.3 + 0.1
      expect(result.tubeMeters).toBe(1.97); // 2.0 - 0.03
      expect(result.edgeRollFit).toBeUndefined();
    });

    it('permite edgeRollFit cuando el ancho final cabe en el rollo pero el corte estandar lo excede (2.959 en rollo 3.0)', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 2.959,
        heightMeters: 2.0,
      };
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [3.0]);
      
      expect(result.edgeRollFit).toBe(true);
      expect(result.edgeRollFitReason).toBe('Corte justo al rollo por medida límite');
      expect(result.recommendedRollWidthMeters).toBe(3.0);
      expect(result.occupiedRollWidthMeters).toBe(3.0);
      expect(result.cutWidthMeters).toBe(3.0);
      expect(result.standardCutWidthMeters).toBeCloseTo(3.059);
    });

    it('bloquea cuando el ancho final excede el rollo, sin permitir edgeRollFit (3.01 en rollo 3.0)', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 3.01,
        heightMeters: 3.01,
      };
      expect(() => {
        calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [3.0]);
      }).toThrowError(/No hay una orientacion valida/);
    });
  });

  describe('Oversized Rotated Logic (> 3.00 m)', () => {
    it('1. widthM = 3.00, heightM = 2.00: normal permitido, no requiere confirmacion', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 3.00,
        heightMeters: 2.00,
      };
      // Normal no cabe en 3.00 (3.00 + 0.10 = 3.10), intentara volteada o edgeRollFit.
      // Wait, 3.00 + 0.10 excede 3.00, edgeRollFit podria aplicar.
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [3.0]);
      expect(result.oversizedRotated).toBeFalsy();
    });

    it('2. widthM = 3.25, heightM = 2.00: rotada permitida, guarda oversizedRotated', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 3.25,
        heightMeters: 2.00,
      };
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [2.5, 3.0]);
      expect(result.orientationUsed).toBe('volteada');
      expect(result.oversizedRotated).toBe(true);
      expect(result.rotatedReason).toBe('Ancho mayor a 3.00 m');
      expect(result.cutLengthMeters).toBeCloseTo(3.35); // 3.25 + 0.10
      expect(result.cutWidthMeters).toBeCloseTo(2.40); // 2.00 + 0.30 + 0.10
      expect(result.recommendedRollWidthMeters).toBe(2.50);
      expect(result.fabricDownloadedYd2).toBeCloseTo(2.50 * 3.35 * 1.2);
    });

    it('3. widthM = 3.25, heightM = 2.80: rotada no cabe, bloquear con error', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 3.25,
        heightMeters: 2.80,
      };
      expect(() => {
        calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [3.0]);
      }).toThrowError(/No hay una orientacion valida/);
    });

    it('4. widthM = 3.01, heightM = 2.00: debe ir rotada, no edgeRollFit', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 3.01,
        heightMeters: 2.00,
      };
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [3.0]);
      expect(result.orientationUsed).toBe('volteada');
      expect(result.oversizedRotated).toBe(true);
      expect(result.edgeRollFit).toBeFalsy();
    });
    it('5. widthM = 2.96, heightM = 2.00: debe ir normal edgeRollFit, no rotada por eficiencia', () => {
      const input = {
        curtainType: 'screen' as const,
        fabricFamily: 'AURA',
        fabricOpenness: '5%',
        fabricColor: 'White',
        widthMeters: 2.96,
        heightMeters: 2.00,
      };
      // Aquí el rollo de 2.5 podría ser más eficiente para rotada (2.30m), 
      // pero el sistema NO debe elegir rotada automáticamente para anchos menores a 3.0.
      const result = calculateScreenMaterials(input, DEFAULT_SCREEN_RULE_CONFIG, [2.5, 3.0]);
      expect(result.orientationUsed).toBe('normal');
      expect(result.edgeRollFit).toBe(true);
      expect(result.oversizedRotated).toBeFalsy();
      expect(result.recommendedRollWidthMeters).toBe(3.0);
    });
  });
});
