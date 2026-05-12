/**
 * rollerBom.parametrized.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Suite parametrizada de validación BOM real.
 * Cubre Roller normal, Pin EndPlug, Bracket Doble y resolución de colores.
 *
 * Al final se imprime una tabla Caso | Entrada | Esperado | Obtenido | Estado
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveGroupBom, validateOrderLine, resolveSku } from './doubleBracketBom';
import type {
  CurtainOrderLine,
  RollerBomRulesConfig,
  BomRule,
} from '../domain/curtains/roller-bom-rules.types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let config: RollerBomRulesConfig;
let rules: BomRule[];

beforeAll(() => {
  config = JSON.parse(
    readFileSync(resolve(__dirname, '../../docs/roller-bom-rules-v2.json'), 'utf-8')
  );
  rules = config.rules;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mkSingle = (cat: string, w: number, h: number): CurtainOrderLine => ({
  orderLineId: `L-${cat}-${w}`,
  category: cat,
  mountingType: 'singleBracket',
  curtains: [{ curtainId: 'A', widthM: w, heightM: h }],
});

const mkDouble = (w: number, hA: number, hB: number, wB?: number): CurtainOrderLine => ({
  orderLineId: `DL-${w}`,
  category: 'Roller Bracket Doble',
  mountingType: 'doubleBracket',
  curtains: [
    { curtainId: 'A', widthM: w,      heightM: hA },
    { curtainId: 'B', widthM: wB ?? w, heightM: hB },
  ],
});

const mkDouble1 = (w: number): CurtainOrderLine => ({
  orderLineId: `DL1-${w}`,
  category: 'Roller Bracket Doble',
  mountingType: 'doubleBracket',
  curtains: [{ curtainId: 'A', widthM: w, heightM: 2.0 }],
});

const getTube = (r: ReturnType<typeof resolveGroupBom>) =>
  r.lines.find(l => l.componentType.startsWith('Tubo'));

const getLine = (r: ReturnType<typeof resolveGroupBom>, type: string) =>
  r.lines.find(l => l.componentType === type);

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROLLER NORMAL — parametrizado
// ─────────────────────────────────────────────────────────────────────────────
describe('Roller normal — rangos de ancho', () => {
  //  [widthM, heightM, expectedTube, expectedTubeM]
  const CASES: [number, number, string | null, number | null][] = [
    [2.00,  2.50, 'Tubo de 38mm NEO',    (2000 - 30) / 1000],
    [2.20,  2.50, 'Tubo de 38mm NEO',    (2200 - 30) / 1000],
    [2.201, 2.50, 'Tubo de 38mm Normal', (2201 - 30) / 1000],
    [2.40,  2.50, 'Tubo de 38mm Normal', (2400 - 30) / 1000],
    [2.401, 2.50, 'Tubo de 45 mm',       (2401 - 30) / 1000],
    [2.80,  2.50, 'Tubo de 45 mm',       (2800 - 30) / 1000],
    [2.801, 2.50, 'Tubo de 50 mm',       (2801 - 30) / 1000],
    [3.00,  2.50, 'Tubo de 50 mm',       (3000 - 30) / 1000],
    [3.01,  2.50, 'Tubo de 63 mm',       (3010 - 30) / 1000],
    [3.60,  2.50, 'Tubo de 63 mm',       (3600 - 30) / 1000],
    [3.70,  2.50, null,                  null],               // sin regla
  ];

  it.each(CASES)(
    'ancho %sm → tubo %s (%sm)',
    (widthM, heightM, expectedTube, expectedTubeM) => {
      const line = mkSingle('Roller', widthM, heightM);

      if (expectedTube === null) {
        // Sin regla → NO_MATCHING_RULE
        const errs = validateOrderLine(line, rules);
        expect(errs.some(e => e.code === 'NO_MATCHING_RULE')).toBe(true);
        return;
      }

      const r = resolveGroupBom(line, config);
      const tube = getTube(r)!;
      expect(tube.componentType).toBe(expectedTube);
      expect(tube.quantity).toBeCloseTo(expectedTubeM!, 3);

      // Extra: cadena = alto × 2
      const cadena = getLine(r, 'Cadena')!;
      expect(cadena.quantity).toBeCloseTo(heightM * 2, 3);

      // Extra: bottomrail = mismo ancho que tubo
      const br = getLine(r, 'Bottomrail')!;
      expect(br.quantity).toBeCloseTo(expectedTubeM!, 3);

      // No debe tener especialFabrication
      expect(r.specialFabrication).toBeUndefined();
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROLLER PIN ENDPLUG — parametrizado
// ─────────────────────────────────────────────────────────────────────────────
describe('Roller Pin EndPlug — rangos y End Plug', () => {
  // [widthM, expectedEndPlugSku | null]
  // null = el rango no incluye End Plug según el Excel fuente (2.201-2.40)
  const CASES: [number, string | null][] = [
    [1.40,  '0-155-EW-SLE53'],
    [1.50,  '0-155-EW-SLE53'],
    [1.501, '0-155-EW-SLH53'],
    [1.80,  '0-155-EW-SLH53'],
    [2.30,  null],              // Rango 2.201-2.40: sin End Plug según Excel
    [2.60,  '0-155-EW-SLH53'], // Rango 2.401-2.80: tiene End Plug
  ];

  it.each(CASES)(
    'Pin EndPlug %sm → End Plug %s',
    (widthM, expectedEpSku) => {
      const r = resolveGroupBom(mkSingle('Roller Pin EndPlug', widthM, 2.0), config);

      // Sin error de límite
      expect(r.warnings).toHaveLength(0);

      if (expectedEpSku === null) {
        // Rango sin End Plug — correcto según JSON
        expect(r.lines.find(l => l.componentType === 'End Plug')).toBeUndefined();
        return;
      }

      // End Plug correcto
      const ep = getLine(r, 'End Plug')!;
      expect(ep).toBeDefined();
      expect(ep.quantity).toBe(1);

      // Verifica el baseSku en la regla del JSON
      const rule = rules.find(
        ru => ru.category === 'Roller Pin EndPlug' &&
              widthM >= ru.minWidthM && widthM <= ru.maxWidthM
      )!;
      const epComp = rule.components.find(c => c.componentType === 'End Plug')!;
      expect(epComp.baseSku).toBe(expectedEpSku);

      // No lógica de grupo
      expect(r.lines.filter(l => l.scope === 'group')).toHaveLength(0);

      // No restricción de bracket doble
      const errs = validateOrderLine(mkSingle('Roller Pin EndPlug', widthM, 2.0), rules);
      expect(errs.some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(false);

      // No hay End Plug duplicado
      expect(r.lines.filter(l => l.componentType === 'End Plug').length).toBeLessThanOrEqual(1);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROLLER BRACKET DOBLE — casos parametrizados
// ─────────────────────────────────────────────────────────────────────────────
describe('Roller Bracket Doble — casos de negocio', () => {

  it('2.00m × (2.50 + 1.80) — estándar, scope group = 1 EA, cadena sumada', () => {
    const r = resolveGroupBom(mkDouble(2.0, 2.50, 1.80), config);
    expect(r.warnings).toHaveLength(0);
    expect(r.specialFabrication).toBeUndefined();
    // Tubo = 2 cortinas × 1.970m
    expect(getTube(r)!.quantity).toBeCloseTo(3.94, 2);
    // Bottomrail
    expect(getLine(r, 'Bottomrail')!.quantity).toBeCloseTo(3.94, 2);
    // Cadena = (2.50 + 1.80) × 2 = 8.60m
    expect(getLine(r, 'Cadena')!.quantity).toBeCloseTo(8.60, 2);
    // scope:group aparece exactamente 1 vez con cantidad 1
    const grp = r.lines.filter(l => l.scope === 'group');
    expect(grp.length).toBe(1);
    expect(grp[0].quantity).toBe(1);
  });

  it('2.80m × (2.50 + 1.80) — límite exacto, sin warning', () => {
    const r = resolveGroupBom(mkDouble(2.80, 2.50, 1.80), config);
    expect(r.warnings).toHaveLength(0);
    expect(r.specialFabrication).toBeUndefined();
    expect(getTube(r)!.quantity).toBeCloseTo((2800 - 30) / 1000 * 2, 2);
  });

  it('1 sola cortina → REQUIRES_TWO_CURTAINS', () => {
    const line = mkDouble1(2.0);
    const errs = validateOrderLine(line, rules);
    expect(errs.some(e => e.code === 'REQUIRES_TWO_CURTAINS')).toBe(true);
    const err = errs.find(e => e.code === 'REQUIRES_TWO_CURTAINS')!;
    expect(err.message.length).toBeGreaterThan(10);
  });

  it('anchos 2.00 vs 2.01 → WIDTH_MISMATCH', () => {
    const line = mkDouble(2.0, 2.0, 2.0, 2.01);
    const errs = validateOrderLine(line, rules);
    expect(errs.some(e => e.code === 'WIDTH_MISMATCH')).toBe(true);
    const err = errs.find(e => e.code === 'WIDTH_MISMATCH')!;
    expect(err.message).toMatch(/2\.0/);
    expect(err.message).toMatch(/2\.01/);
  });

  it('2.801m sin autorización → DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED', () => {
    const errs = validateOrderLine(mkDouble(2.801, 2.0, 2.0), rules);
    expect(errs.some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(true);
  });

  it('3.00m con riskAcceptedByCustomer → specialFabrication true + warning', () => {
    const r = resolveGroupBom(
      mkDouble(3.0, 2.0, 2.0),
      config,
      { throwOnError: false, riskAcceptedByCustomer: true }
    );
    expect(r.specialFabrication).toBe(true);
    expect(r.warnings.some(w => /fabricaci.n especial/i.test(w))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. COLORES — parametrizado con resolveSku
// ─────────────────────────────────────────────────────────────────────────────
describe('Resolución de color — parametrizado', () => {

  // Casos válidos: [colorKey, tone, baseSku, expectedFinalSku]
  const VALID_CASES: [string, string, string, string][] = [
    ['bottomrail', 'gray',   '0-151-AL-CLX19', '0-151-AL-CLA19'],
    ['bottomrail', 'grey',   '0-151-AL-CLX19', '0-151-AL-CLA19'],  // alias
    ['bottomrail', 'ivory',  '0-151-AL-CLX19', '0-151-AL-CLI19'],
    ['bottomrail', 'white',  '0-151-AL-CLX19', '0-151-AL-CLW19'],
    ['bottomrail', 'bronze', '0-151-AL-CLX19', '0-151-AL-CLZ19'],
    ['cadena',     'gray',   '0-151-CH-XXXH0', '0-151-CH-006H0'],
    ['cadena',     'grey',   '0-151-CH-XXXH0', '0-151-CH-006H0'],  // alias
    ['cadena',     'ivory',  '0-151-CH-XXXH0', '0-151-CH-003H0'],
    ['cadena',     'white',  '0-151-CH-XXXH0', '0-151-CH-007H0'],
    ['cadena',     'bronze', '0-151-CH-XXXH0', '0-151-CH-012H0'],
    ['control',    'gray',   '0-154-CL-V20XX', '0-154-CL-V20GR'],
    ['control',    'grey',   '0-154-CL-V20XX', '0-154-CL-V20GR'],  // alias
    ['control',    'ivory',  '0-154-CL-V20XX', '0-154-CL-V20IV'],
    ['control',    'white',  '0-154-CL-V20XX', '0-154-CL-V20WH'],
    ['control',    'bronze', '0-154-CL-V20XX', '0-154-CL-V20BR'],
    ['pesa',       'gray',   '0-151-CA-001XX', '0-151-CA-001GY'],
    ['pesa',       'ivory',  '0-151-CA-001XX', '0-151-CA-001IV'],
    ['pesa',       'white',  '0-151-CA-001XX', '0-151-CA-001WH'],
    ['pesa',       'bronze', '0-151-CA-001XX', '0-151-CA-001BZ'],
    ['tapaderas',  'gray',   '0-151-RE-XXX00', '0-151-RE-02600'],
    ['tapaderas',  'ivory',  '0-151-RE-XXX00', '0-151-RE-11200'],
    ['tapaderas',  'white',  '0-151-RE-XXX00', '0-151-RE-00500'],
    ['tapaderas',  'bronze', '0-151-RE-XXX00', '0-151-RE-10500'],
    ['topes',      'gray',   '0-151-CA-100XX', '0-151-CA-100GR'],
    ['topes',      'ivory',  '0-151-CA-100XX', '0-151-CA-100IV'],
    ['topes',      'white',  '0-151-CA-100XX', '0-151-CA-100WH'],
    ['topes',      'bronze', '0-151-CA-100XX', '0-151-CA-100BZ'],
    // Sin colorKey → SKU fijo
    ['(sin clave)', 'white', '0-155-EW-SLE53', '0-155-EW-SLE53'],
  ];

  it.each(VALID_CASES)(
    '[%s][%s] %s → %s',
    (colorKey, tone, baseSku, expectedSku) => {
      const maps = colorKey === '(sin clave)' ? config.colorMaps : config.colorMaps;
      const r = resolveSku(baseSku, colorKey === '(sin clave)' ? null : colorKey, tone, maps);
      expect(r.colorError).toBeUndefined();
      expect(r.resolvedSku).toBe(expectedSku);
    }
  );

  // Casos inválidos: [colorKey, tone, expectedErrorCode]
  const INVALID_CASES: [string, string | null, string][] = [
    ['bottomrail', 'black',  'COLOR_SKU_NOT_FOUND'],    // color no existe en ningún mapa
    ['bottomrail', null,     'COLOR_NOT_SUPPORTED'],    // sin tono
    ['cadena',     'black',  'COLOR_SKU_NOT_FOUND'],
    ['control',    'black',  'COLOR_SKU_NOT_FOUND'],
  ];

  it.each(INVALID_CASES)(
    '[%s][%s] → error %s',
    (colorKey, tone, expectedError) => {
      const r = resolveSku('SKU-X-placeholder', colorKey, tone, config.colorMaps);
      expect(r.colorError).toBe(expectedError);
      expect(r.colorErrorMessage).toBeTruthy();
      expect(r.colorErrorMessage!).toMatch(/no existe SKU|no se especific/i);
    }
  );

  it('SKU sin colorKey con X → UNRESOLVED_SKU_PLACEHOLDER', () => {
    const r = resolveSku('0-000-XX-0000', null, 'white', config.colorMaps);
    expect(r.colorError).toBe('UNRESOLVED_SKU_PLACEHOLDER');
  });
});
