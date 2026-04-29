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
    });
  });
});
