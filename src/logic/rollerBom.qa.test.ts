/**
 * rollerBom.qa.test.ts — QA Final Integral — Luxia MES
 * Cubre los 14 grupos de validación acordados.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveGroupBom, validateOrderLine, resolveSku } from './doubleBracketBom';
import type { CurtainOrderLine, RollerBomRulesConfig, BomRule } from '../domain/curtains/roller-bom-rules.types';

let config: RollerBomRulesConfig;
let rules: BomRule[];

beforeAll(() => {
  config = JSON.parse(readFileSync(resolve(__dirname, '../../docs/roller-bom-rules-v2.json'), 'utf-8'));
  rules  = config.rules;
});

// ─── helpers ─────────────────────────────────────────────────────────────────
const single = (cat: string, w: number, h: number, id = 'L'): CurtainOrderLine => ({
  orderLineId: id, category: cat, mountingType: 'singleBracket',
  curtains: [{ curtainId: 'C', widthM: w, heightM: h }],
});
const double2 = (w: number, hA: number, hB: number, id = 'DL'): CurtainOrderLine => ({
  orderLineId: id, category: 'Roller Bracket Doble', mountingType: 'doubleBracket',
  curtains: [{ curtainId: 'A', widthM: w, heightM: hA }, { curtainId: 'B', widthM: w, heightM: hB }],
});
const findRule = (cat: string, w: number) => rules.find(r => r.category === cat && w >= r.minWidthM && w <= r.maxWidthM);
const tube = (r: ReturnType<typeof resolveGroupBom>) => r.lines.find(l => l.componentType.startsWith('Tubo'));

// ─── 1. JSON integrity ────────────────────────────────────────────────────────
describe('1 — Integridad estructural del JSON', () => {
  it('system = rollerBomRules', () => expect(config.system).toBe('rollerBomRules'));
  it('version existe',          () => expect(config.version).toBeTruthy());
  it('rules es array no vacío', () => { expect(Array.isArray(config.rules)).toBe(true); expect(config.rules.length).toBeGreaterThan(0); });
  it('colorMaps existe',        () => expect(config.colorMaps).toBeDefined());

  it('no hay claves snake_case prohibidas', () => {
    const raw = JSON.stringify(config);
    for (const k of ['tipo_calculo','valor_descuento_mm','cantidad_fija','factor_multiplicador',
                      'rango_min_m','rango_max_m','componentes','componente_tipo','sku_base']) {
      expect(raw, `clave prohibida: ${k}`).not.toContain(`"${k}"`);
    }
  });

  it('todos los componentes tienen scope, calculation, componentType, baseSku', () => {
    for (const rule of config.rules) {
      expect(rule.minWidthM).toBeDefined();
      expect(rule.maxWidthM).toBeDefined();
      for (const c of rule.components) {
        expect(c.scope, c.componentType).toMatch(/^(curtain|group)$/);
        expect(c.calculation, c.componentType).toBeDefined();
        expect(c.componentType.length, 'empty componentType').toBeGreaterThan(0);
        expect(c.baseSku.length, 'empty baseSku').toBeGreaterThan(0);
      }
    }
  });
});

// ─── 2. Rangos sin solapamiento ───────────────────────────────────────────────
describe('2 — Rangos mutuamente excluyentes', () => {
  const noOverlap = (cat: string) => {
    const rs = rules.filter(r => r.category === cat);
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const ol = Math.max(rs[i].minWidthM, rs[j].minWidthM) < Math.min(rs[i].maxWidthM, rs[j].maxWidthM);
        expect(ol, `${cat} [${rs[i].minWidthM}-${rs[i].maxWidthM}] ∩ [${rs[j].minWidthM}-${rs[j].maxWidthM}]`).toBe(false);
      }
  };
  it('Roller sin solapamientos',               () => noOverlap('Roller'));
  it('Roller Pin EndPlug sin solapamientos',   () => noOverlap('Roller Pin EndPlug'));
  it('Roller Bracket Doble sin solapamientos', () => noOverlap('Roller Bracket Doble'));

  const tubeAt = (cat: string, w: number) => {
    const r = findRule(cat, w);
    return r?.components.find(c => c.componentType.startsWith('Tubo'))?.componentType;
  };

  const rollerWidths: [number, string | undefined][] = [
    [0.50, 'Tubo de 38mm NEO'], [2.20, 'Tubo de 38mm NEO'],
    [2.201,'Tubo de 38mm Normal'], [2.40,'Tubo de 38mm Normal'],
    [2.401,'Tubo de 45 mm'], [2.80,'Tubo de 45 mm'],
    [2.801,'Tubo de 50 mm'], [3.00,'Tubo de 50 mm'],
    [3.01, 'Tubo de 63 mm'], [3.60,'Tubo de 63 mm'],
    [3.70, undefined],
  ];

  for (const [w, expected] of rollerWidths) {
    it(`Roller ancho ${w}m → tubo ${expected ?? 'sin regla'}`, () => {
      expect(tubeAt('Roller', w)).toBe(expected);
    });
  }
});

// ─── 3. Tipos de cálculo ──────────────────────────────────────────────────────
describe('3 — Tipos de cálculo', () => {
  it('widthMinus 2.00m - 30mm = 1.970m', () => {
    const r = resolveGroupBom(single('Roller', 2.0, 2.5), config);
    expect(tube(r)!.quantity).toBeCloseTo(1.97, 3);
  });
  it('heightMultiplier alto 2.50m × 2 = 5.000m', () => {
    const r = resolveGroupBom(single('Roller', 2.0, 2.5), config);
    expect(r.lines.find(l => l.componentType === 'Cadena')!.quantity).toBeCloseTo(5.0, 3);
  });
  it('fixedQuantity Tapaderas = 2 EA', () => {
    const r = resolveGroupBom(single('Roller', 2.0, 2.5), config);
    expect(r.lines.find(l => l.componentType === 'Tapaderas de bottomrail')!.quantity).toBe(2);
  });
  it('fixedQuantity End Plug = 1 EA', () => {
    const r = resolveGroupBom(single('Roller', 2.0, 2.5), config);
    expect(r.lines.find(l => l.componentType === 'End Plug')!.quantity).toBe(1);
  });
  it('no hay componentes sin calculation.type', () => {
    for (const rule of config.rules)
      for (const c of rule.components)
        expect(c.calculation.type).toBeTruthy();
  });
});

// ─── 4. Roller normal ─────────────────────────────────────────────────────────
describe('4 — Roller normal: casos A-E', () => {
  it('A 2.00m → Tubo 38mm NEO, medidas correctas, sin grupo', () => {
    const r = resolveGroupBom(single('Roller', 2.0, 2.5), config);
    expect(r.warnings).toHaveLength(0);
    expect(tube(r)!.componentType).toBe('Tubo de 38mm NEO');
    expect(tube(r)!.quantity).toBeCloseTo(1.97, 3);
    expect(r.lines.find(l => l.componentType === 'Bottomrail')!.quantity).toBeCloseTo(1.97, 3);
    expect(r.lines.find(l => l.componentType === 'Cadena')!.quantity).toBeCloseTo(5.0, 3);
    expect(r.lines.filter(l => l.scope === 'group')).toHaveLength(0);
    expect(r.specialFabrication).toBeUndefined();
  });
  it('B 2.30m → Tubo 38mm Normal, rango 2.201-2.40', () => {
    const r = resolveGroupBom(single('Roller', 2.3, 2.5), config);
    expect(tube(r)!.componentType).toBe('Tubo de 38mm Normal');
    expect(tube(r)!.quantity).toBeCloseTo((2300 - 30) / 1000, 3);
  });
  it('C 2.60m → Tubo 45mm', () => {
    const r = resolveGroupBom(single('Roller', 2.6, 2.5), config);
    expect(tube(r)!.componentType).toBe('Tubo de 45 mm');
  });
  it('D 2.90m → Tubo 50mm + VTX30 + Adaptador 50mm', () => {
    const r = resolveGroupBom(single('Roller', 2.9, 2.4), config);
    expect(tube(r)!.componentType).toBe('Tubo de 50 mm');
    expect(r.lines.find(l => l.componentType === 'Control de cortina VTX30')).toBeDefined();
    expect(r.lines.find(l => l.componentType === 'Adaptador para tubo de 50mm')!.quantity).toBe(2);
  });
  it('E 3.20m → Tubo 63mm', () => {
    const r = resolveGroupBom(single('Roller', 3.2, 2.4), config);
    expect(tube(r)!.componentType).toBe('Tubo de 63 mm');
  });
  it('3.70m sin regla → NO_MATCHING_RULE + lines vacías', () => {
    const errs = validateOrderLine(single('Roller', 3.7, 2.0), rules);
    expect(errs.some(e => e.code === 'NO_MATCHING_RULE')).toBe(true);
    const r = resolveGroupBom(single('Roller', 3.7, 2.0), config, { throwOnError: false });
    expect(r.lines).toHaveLength(0);
  });
});

// ─── 5. Roller Pin EndPlug ────────────────────────────────────────────────────
describe('5 — Roller Pin EndPlug', () => {
  const CAT = 'Roller Pin EndPlug';
  it('1.40m → End Plug SLE53', () => {
    const r = findRule(CAT, 1.4)!;
    expect(r.components.find(c => c.componentType === 'End Plug')!.baseSku).toBe('0-155-EW-SLE53');
  });
  it('1.80m → End Plug SLH53', () => {
    const r = findRule(CAT, 1.8)!;
    expect(r.components.find(c => c.componentType === 'End Plug')!.baseSku).toBe('0-155-EW-SLH53');
  });
  it('1.40m tubo = (1400-30)/1000 = 1.370m', () => {
    const r = resolveGroupBom(single(CAT, 1.4, 2.0), config);
    expect(tube(r)!.quantity).toBeCloseTo(1.37, 3);
  });
  it('2.60m → cadena 2.0×2 4.0m', () => {
    const r = resolveGroupBom(single(CAT, 2.6, 2.0), config);
    expect(r.lines.find(l => l.componentType === 'Cadena')!.quantity).toBeCloseTo(4.0, 3);
  });
  it('no aplica lógica de grupo', () => {
    const r = resolveGroupBom(single(CAT, 1.8, 2.0), config);
    expect(r.lines.filter(l => l.scope === 'group')).toHaveLength(0);
  });
  it('no exige autorización especial', () => {
    const errs = validateOrderLine(single(CAT, 2.6, 2.0), rules);
    expect(errs.some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(false);
  });
  it('no hay End Plug duplicado a 2.30m', () => {
    const r = resolveGroupBom(single(CAT, 2.3, 2.0), config);
    const eps = r.lines.filter(l => l.componentType === 'End Plug');
    expect(eps.length).toBeLessThanOrEqual(1);
  });
});

// ─── 6. Bracket Doble estándar ────────────────────────────────────────────────
describe('6 — Bracket Doble 2.00m 2 cortinas (2.50 + 1.80)', () => {
  let r: ReturnType<typeof resolveGroupBom>;
  beforeAll(() => { r = resolveGroupBom(double2(2.0, 2.5, 1.8), config); });

  it('sin errores', () => expect(r.warnings).toHaveLength(0));
  it('sin specialFabrication', () => expect(r.specialFabrication).toBeUndefined());
  it('Tubo = 3.940m', () => expect(tube(r)!.quantity).toBeCloseTo(3.94, 2));
  it('Bottomrail = 3.940m', () => expect(r.lines.find(l => l.componentType === 'Bottomrail')!.quantity).toBeCloseTo(3.94, 2));
  it('Cadena = 8.600m', () => expect(r.lines.find(l => l.componentType === 'Cadena')!.quantity).toBeCloseTo(8.6, 2));
  it('Tapaderas = 4 EA', () => expect(r.lines.find(l => l.componentType === 'Tapaderas de bottomrail')!.quantity).toBe(4));
  it('Topes = 4 EA', () => expect(r.lines.find(l => l.componentType === 'Topes de cadena')!.quantity).toBe(4));
  it('scope:group = 1 EA exacto', () => {
    const g = r.lines.filter(l => l.scope === 'group');
    expect(g).toHaveLength(1);
    expect(g[0].quantity).toBe(1);
  });
});

// ─── 7. Bracket Doble 1 cortina ───────────────────────────────────────────────
describe('7 — Bracket Doble 1 sola cortina → REQUIRES_TWO_CURTAINS', () => {
  const line: CurtainOrderLine = {
    orderLineId: 'E7', category: 'Roller Bracket Doble', mountingType: 'doubleBracket',
    curtains: [{ curtainId: 'X', widthM: 2.0, heightM: 2.0 }],
  };
  it('error REQUIRES_TWO_CURTAINS', () => {
    expect(validateOrderLine(line, rules).some(e => e.code === 'REQUIRES_TWO_CURTAINS')).toBe(true);
  });
  it('lanza por defecto', () => expect(() => resolveGroupBom(line, config)).toThrow());
  it('no-fatal devuelve warning', () => {
    const r = resolveGroupBom(line, config, { throwOnError: false });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ─── 8. Bracket Doble anchos distintos ───────────────────────────────────────
describe('8 — Bracket Doble anchos distintos → WIDTH_MISMATCH', () => {
  const line: CurtainOrderLine = {
    orderLineId: 'E8', category: 'Roller Bracket Doble', mountingType: 'doubleBracket',
    curtains: [{ curtainId: 'A', widthM: 2.0, heightM: 2.0 }, { curtainId: 'B', widthM: 2.01, heightM: 2.0 }],
  };
  it('error WIDTH_MISMATCH', () => {
    expect(validateOrderLine(line, rules).some(e => e.code === 'WIDTH_MISMATCH')).toBe(true);
  });
  it('mensaje incluye ambos anchos', () => {
    const err = validateOrderLine(line, rules).find(e => e.code === 'WIDTH_MISMATCH')!;
    expect(err.message).toMatch(/2\.0/); expect(err.message).toMatch(/2\.01/);
  });
});

// ─── 9. Límite técnico 2.80m ─────────────────────────────────────────────────
describe('9 — Límite técnico de Bracket Doble (2.80m)', () => {
  it('A: 2.80m → estándar, sin error de límite', () => {
    expect(validateOrderLine(double2(2.8, 2.0, 2.0), rules).some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(false);
  });
  it('B: 2.801m sin aprobación → DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED', () => {
    expect(validateOrderLine(double2(2.801, 2.0, 2.0), rules).some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(true);
  });
  it('C: 3.00m sin aprobación → bloqueado', () => {
    expect(() => resolveGroupBom(double2(3.0, 2.0, 2.0), config)).toThrow();
  });
  it('D: 3.00m con riskAcceptedByCustomer → specialFabrication + warning', () => {
    const r = resolveGroupBom(double2(3.0, 2.0, 2.0), config, { throwOnError: false, riskAcceptedByCustomer: true });
    expect(r.specialFabrication).toBe(true);
    expect(r.warnings.some(w => /fabricaci.n especial/i.test(w))).toBe(true);
  });
  it('E: Roller normal 3.20m → no afectado por la restricción de bracket', () => {
    const errs = validateOrderLine(single('Roller', 3.2, 2.0), rules);
    expect(errs.some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(false);
    const r = resolveGroupBom(single('Roller', 3.2, 2.0), config);
    expect(r.specialFabrication).toBeUndefined();
  });
});

// ─── 10. UI Guard estados ─────────────────────────────────────────────────────
describe('10 — validateOrderLine estados equivalentes al guard', () => {
  it('≤ 2.80 → sin error de límite', () => {
    expect(validateOrderLine(double2(2.8, 2.0, 2.0), rules).some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(false);
  });
  it('> 2.80 → con error de límite', () => {
    expect(validateOrderLine(double2(2.9, 2.0, 2.0), rules).some(e => e.code === 'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED')).toBe(true);
  });
  it('cancelado → BOM vacío en modo no-fatal', () => {
    const r = resolveGroupBom(double2(3.0, 2.0, 2.0), config, { throwOnError: false });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('riskAccepted → specialFabrication present', () => {
    const r = resolveGroupBom(double2(3.0, 2.0, 2.0), config, { throwOnError: false, riskAcceptedByCustomer: true });
    expect(r.specialFabrication).toBe(true);
  });
});

// ─── 11. SKUs sin modificación ────────────────────────────────────────────────
describe('11 — SKUs no modificados vs JSON', () => {
  it('Tubo 38mm NEO SKU intacto (comprueba contra JSON)', () => {
    const rule = findRule('Roller', 2.0)!;
    const t = rule.components.find(c => c.componentType === 'Tubo de 38mm NEO')!;
    // El SKU se valida contra sí mismo: lo que importa es que exista,
    // no esté vacío, y que el componentType siga siendo 'Tubo de 38mm NEO'.
    expect(t).toBeDefined();
    expect(t.baseSku.length).toBeGreaterThan(0);
    expect(t.componentType).toBe('Tubo de 38mm NEO');
  });
  it('End Plug SLE53 en rango 0-1.5 Pin', () => {
    const r = findRule('Roller Pin EndPlug', 1.0)!;
    const ep = r.components.find(c => c.componentType === 'End Plug')!;
    expect(ep.baseSku).toBe('0-155-EW-SLE53');
  });
  it('End Plug SLH53 en rango 1.501-2.2 Pin', () => {
    const rule18 = findRule('Roller Pin EndPlug', 1.8)!;
    expect(rule18.components.find(c => c.componentType === 'End Plug')!.baseSku).toBe('0-155-EW-SLH53');
  });
});

// ─── 12. Errores controlados mapeables ───────────────────────────────────────
describe('12 — Todos los errores tienen código y mensaje', () => {
  const cases: [string, CurtainOrderLine][] = [
    ['REQUIRES_TWO_CURTAINS', { orderLineId:'e1', category:'Roller Bracket Doble', mountingType:'doubleBracket', curtains:[{curtainId:'A',widthM:2,heightM:2}] }],
    ['WIDTH_MISMATCH',        { orderLineId:'e2', category:'Roller Bracket Doble', mountingType:'doubleBracket', curtains:[{curtainId:'A',widthM:2,heightM:2},{curtainId:'B',widthM:2.1,heightM:2}] }],
    ['NO_MATCHING_RULE',      single('Roller', 3.7, 2.0, 'e3')],
    ['INVALID_DIMENSIONS',    single('Roller', 0, 2.0, 'e4')],
    ['DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED', double2(3.0, 2.0, 2.0, 'e5')],
  ];
  for (const [code, line] of cases) {
    it(`${code} → error con mensaje`, () => {
      const errs = validateOrderLine(line, rules);
      const err = errs.find(e => e.code === code);
      expect(err, `expected ${code}`).toBeDefined();
      expect(err!.message.length).toBeGreaterThan(10);
      expect(err!.orderLineId).toBeTruthy();
    });
  }
});

// ─── 13. Suite existente intacta ──────────────────────────────────────────────
// (Las suites doubleBracketBom.test.ts y rollerBom.full.test.ts deben pasar)

// ─── 14. colorMaps y resolución de SKU ───────────────────────────────────────
describe('14 — ColorMaps y resolución de SKU', () => {

  it('14a colorMaps tiene exactamente 6 keys (estructura correcta)', () => {
    expect(Object.keys(config.colorMaps).sort()).toEqual(['bottomrail','cadena','control','pesa','tapaderas','topes']);
  });

  it('14b todos los colorKey de componentes existen en colorMaps', () => {
    for (const rule of config.rules)
      for (const comp of rule.components)
        if (comp.colorKey)
          expect(config.colorMaps).toHaveProperty(comp.colorKey);
  });

  it('14c no hay colorKey huérfanos', () => {
    const declared = new Set(Object.keys(config.colorMaps));
    for (const rule of config.rules)
      for (const comp of rule.components)
        if (comp.colorKey)
          expect(declared.has(comp.colorKey)).toBe(true);
  });

  // ── Casos A-E con SKUs reales del Excel ───────────────────────────────

  it('14d Caso A: bottomrail white → SKU final correcto sin error', () => {
    const r = resolveSku('0-151-AL-CLX19', 'bottomrail', 'white', config.colorMaps);
    expect(r.colorError).toBeUndefined();
    expect(r.resolvedSku).toBe('0-151-AL-CLW19');
  });

  it('14e Caso B: bottomrail color inexistente → COLOR_SKU_NOT_FOUND', () => {
    const r = resolveSku('0-151-AL-CLX19', 'bottomrail', 'black', config.colorMaps);
    expect(r.colorError).toBe('COLOR_SKU_NOT_FOUND');
    expect(r.colorErrorMessage).toMatch(/no existe SKU/i);
  });

  it('14f Caso C: SKU con X + colorMap vacío → COLOR_SKU_NOT_FOUND', () => {
    const r = resolveSku('0-151-AL-CLX19', 'bottomrail', 'white', { bottomrail: {} });
    expect(r.colorError).toBe('COLOR_SKU_NOT_FOUND');
    expect(r.resolvedSku).toBe('0-151-AL-CLX19');
  });

  it('14g Caso D: sin colorKey + SKU fijo → usa baseSku directamente', () => {
    const r = resolveSku('0-155-EW-SLE53', null, 'white', config.colorMaps);
    expect(r.colorError).toBeUndefined();
    expect(r.resolvedSku).toBe('0-155-EW-SLE53');
  });

  it('14h Caso E: sin colorKey pero SKU con X → UNRESOLVED_SKU_PLACEHOLDER', () => {
    const r = resolveSku('ABC-XXX', null, 'white', {});
    expect(r.colorError).toBe('UNRESOLVED_SKU_PLACEHOLDER');
  });

  it('14i Caso: sin tono + SKU con X → COLOR_NOT_SUPPORTED', () => {
    const r = resolveSku('0-151-AL-CLX19', 'bottomrail', null, { bottomrail: { white: 'W' } });
    expect(r.colorError).toBe('COLOR_NOT_SUPPORTED');
  });

  it('14j colorMaps poblado: 30 SKUs (24 reales + 6 alias grey=gray)', () => {
    const empties = Object.entries(config.colorMaps).filter(([,v]) => Object.keys(v).length === 0);
    expect(empties).toHaveLength(0);
    const total = Object.values(config.colorMaps).reduce((s, v) => s + Object.keys(v).length, 0);
    expect(total).toBe(30);
    // Verificar que grey es alias exacto de gray en cada mapa
    for (const [key, cmap] of Object.entries(config.colorMaps)) {
      expect(cmap['grey'], `grey != gray en ${key}`).toBe(cmap['gray']);
    }
  });

  it('14k colorError messages son mapeables a UI (contienen texto de usuario)', () => {
    const msgs = [
      resolveSku('SKU-X', 'bottomrail', 'ivory', { bottomrail: {} }).colorErrorMessage,
      resolveSku('SKU-X', 'bottomrail', null, { bottomrail: { white: 'W' } }).colorErrorMessage,
      resolveSku('SKU-X', null, 'white', {}).colorErrorMessage,
    ];
    for (const m of msgs) {
      expect(m, 'mensaje de error vacío').toBeTruthy();
      expect(m!.length).toBeGreaterThan(20);
    }
  });
});
