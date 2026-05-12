/**
 * rollerBom.full.test.ts — Luxia MES
 * Suite completa de QA para las 3 categorías de BOM roller.
 * Cubre los 12 grupos de validación especificados.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveGroupBom, validateOrderLine } from './doubleBracketBom';
import type {
  CurtainOrderLine,
  RollerBomRulesConfig,
  BomRule,
} from '../domain/curtains/roller-bom-rules.types';

// ─── Setup ────────────────────────────────────────────────────────────────────

let config: RollerBomRulesConfig;
let rules: BomRule[];

beforeAll(() => {
  const p = resolve(__dirname, '../../docs/roller-bom-rules-v2.json');
  config = JSON.parse(readFileSync(p, 'utf-8')) as RollerBomRulesConfig;
  rules = config.rules;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function singleLine(
  category: string,
  widthM: number,
  heightM: number,
  id = 'L1'
): CurtainOrderLine {
  return {
    orderLineId: id,
    category,
    mountingType: 'singleBracket',
    curtains: [{ curtainId: 'C1', widthM, heightM }],
  };
}

function doubleLine(
  widthA: number, heightA: number,
  widthB: number, heightB: number,
  id = 'DL1'
): CurtainOrderLine {
  return {
    orderLineId: id,
    category: 'Roller Bracket Doble',
    mountingType: 'doubleBracket',
    curtains: [
      { curtainId: 'CA', widthM: widthA, heightM: heightA },
      { curtainId: 'CB', widthM: widthB, heightM: heightB },
    ],
  };
}

function findRule(category: string, widthM: number): BomRule | undefined {
  return rules.find(
    (r) => r.category === category && widthM >= r.minWidthM && widthM <= r.maxWidthM
  );
}

function getTube(line: ReturnType<typeof resolveGroupBom>) {
  return line.lines.find((l) => l.componentType.startsWith('Tubo'));
}

// ─── GROUP 1: Range selection — Roller normal ─────────────────────────────────

describe('1 — Roller: selección de rango por ancho', () => {
  const cases: [number, string][] = [
    [0.50,  'Tubo de 38mm NEO'],
    [2.20,  'Tubo de 38mm NEO'],
    [2.201, 'Tubo de 38mm Normal'],
    [2.40,  'Tubo de 38mm Normal'],
    [2.401, 'Tubo de 45 mm'],
    [2.80,  'Tubo de 45 mm'],
    [2.801, 'Tubo de 50 mm'],
    [3.00,  'Tubo de 50 mm'],
    [3.01,  'Tubo de 63 mm'],
    [3.60,  'Tubo de 63 mm'],
  ];

  for (const [width, expectedTube] of cases) {
    it(`ancho ${width}m → ${expectedTube}`, () => {
      const rule = findRule('Roller', width);
      expect(rule, `No rule found for width=${width}`).toBeDefined();
      const tube = rule!.components.find((c) => c.componentType.startsWith('Tubo'));
      expect(tube?.componentType).toBe(expectedTube);
    });
  }
});

// ─── GROUP 2: Tipos de cálculo ────────────────────────────────────────────────

describe('2 — Tipos de cálculo', () => {
  it('widthMinus: 2.00m - 30mm = 1.970m', () => {
    const result = resolveGroupBom(singleLine('Roller', 2.0, 2.5), config);
    const tube = getTube(result)!;
    expect(tube.quantity).toBeCloseTo(1.97, 3);
    expect(tube.unit).toBe('m');
  });

  it('heightMultiplier: alto 2.50m × 2 = 5.000m', () => {
    const result = resolveGroupBom(singleLine('Roller', 2.0, 2.5), config);
    const chain = result.lines.find((l) => l.componentType === 'Cadena')!;
    expect(chain.quantity).toBeCloseTo(5.0, 3);
    expect(chain.unit).toBe('m');
  });

  it('fixedQuantity: Tapaderas = 2 EA', () => {
    const result = resolveGroupBom(singleLine('Roller', 2.0, 2.5), config);
    const tap = result.lines.find((l) => l.componentType === 'Tapaderas de bottomrail')!;
    expect(tap.quantity).toBe(2);
    expect(tap.unit).toBe('EA');
  });

  it('fixedQuantity: End Plug = 1 EA', () => {
    const result = resolveGroupBom(singleLine('Roller', 2.0, 2.5), config);
    const ep = result.lines.find((l) => l.componentType === 'End Plug')!;
    expect(ep.quantity).toBe(1);
    expect(ep.unit).toBe('EA');
  });
});

// ─── GROUP 3: Roller normal 2.00m × 2.50m ────────────────────────────────────

describe('3 — Roller normal: ancho 2.00m, alto 2.50m', () => {
  let res: ReturnType<typeof resolveGroupBom>;

  beforeAll(() => {
    res = resolveGroupBom(singleLine('Roller', 2.0, 2.5), config);
  });

  it('sin errores ni warnings', () => {
    expect(res.warnings).toHaveLength(0);
  });

  it('Tubo = 1.970m', () => {
    expect(getTube(res)!.quantity).toBeCloseTo(1.97, 3);
  });

  it('Bottomrail = 1.970m', () => {
    const br = res.lines.find((l) => l.componentType === 'Bottomrail')!;
    expect(br.quantity).toBeCloseTo(1.97, 3);
  });

  it('Cadena = 5.000m', () => {
    expect(res.lines.find((l) => l.componentType === 'Cadena')!.quantity).toBeCloseTo(5.0, 3);
  });

  it('Soporte lado del control = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Soporte lado del control')!.quantity).toBe(1);
  });

  it('Soporte del lado del end plug = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Soporte del lado del end plug')!.quantity).toBe(1);
  });

  it('End Plug = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'End Plug')!.quantity).toBe(1);
  });

  it('Chapita = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Chapita')!.quantity).toBe(1);
  });

  it('Control de cortina = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Control de cortina')!.quantity).toBe(1);
  });

  it('Pesa de cadena = 1 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Pesa de cadena')!.quantity).toBe(1);
  });

  it('Tapaderas de bottomrail = 2 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Tapaderas de bottomrail')!.quantity).toBe(2);
  });

  it('Topes de cadena = 2 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Topes de cadena')!.quantity).toBe(2);
  });

  it('no hay componentes con scope "group"', () => {
    expect(res.lines.filter((l) => l.scope === 'group')).toHaveLength(0);
  });

  it('11 componentes en total', () => {
    expect(res.lines).toHaveLength(11);
  });
});

// ─── GROUP 4: Roller rango alto 2.90m × 2.40m ────────────────────────────────

describe('4 — Roller rango alto: ancho 2.90m, alto 2.40m', () => {
  let res: ReturnType<typeof resolveGroupBom>;

  beforeAll(() => {
    res = resolveGroupBom(singleLine('Roller', 2.9, 2.4), config);
  });

  it('rango 2.801–3.00 seleccionado (tubo de 50mm)', () => {
    expect(getTube(res)!.componentType).toBe('Tubo de 50 mm');
  });

  it('Tubo = 2.870m (2900-30)/1000', () => {
    expect(getTube(res)!.quantity).toBeCloseTo(2.87, 3);
  });

  it('incluye Adaptador para tubo de 50mm = 2 EA', () => {
    const adp = res.lines.find((l) => l.componentType === 'Adaptador para tubo de 50mm')!;
    expect(adp).toBeDefined();
    expect(adp.quantity).toBe(2);
  });

  it('incluye Control de cortina VTX30 = 1 EA', () => {
    const vtx = res.lines.find((l) => l.componentType === 'Control de cortina VTX30')!;
    expect(vtx).toBeDefined();
    expect(vtx.quantity).toBe(1);
  });

  it('no hay duplicados de componentType', () => {
    const types = res.lines.map((l) => l.componentType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});

// ─── GROUP 5: Roller Pin EndPlug ─────────────────────────────────────────────

describe('5 — Roller Pin EndPlug: selección de End Plug por rango', () => {
  const CAT = 'Roller Pin EndPlug';

  it('ancho 1.40m → End Plug SKU 0-155-EW-SLE53 (rango 0–1.5)', () => {
    const rule = findRule(CAT, 1.4)!;
    const ep = rule.components.find((c) => c.componentType === 'End Plug')!;
    expect(ep.baseSku).toBe('0-155-EW-SLE53');
  });

  it('ancho 1.50m → End Plug SKU 0-155-EW-SLE53 (límite exacto rango 0–1.5)', () => {
    const rule = findRule(CAT, 1.5)!;
    const ep = rule.components.find((c) => c.componentType === 'End Plug')!;
    expect(ep.baseSku).toBe('0-155-EW-SLE53');
  });

  it('ancho 1.80m → End Plug SKU 0-155-EW-SLH53 (rango 1.501–2.2)', () => {
    const rule = findRule(CAT, 1.8)!;
    const ep = rule.components.find((c) => c.componentType === 'End Plug')!;
    expect(ep.baseSku).toBe('0-155-EW-SLH53');
  });

  it('ancho 2.30m → rango 2.201–2.4, sin End Plug separado (ya fusionado)', () => {
    const rule = findRule(CAT, 2.3)!;
    expect(rule).toBeDefined();
    expect(rule.minWidthM).toBe(2.201);
  });

  it('ancho 2.60m → rango 2.401–2.8, End Plug SLH53', () => {
    const rule = findRule(CAT, 2.6)!;
    const ep = rule.components.find((c) => c.componentType === 'End Plug')!;
    expect(ep.baseSku).toBe('0-155-EW-SLH53');
  });

  it('no existen solapamientos en Roller Pin EndPlug', () => {
    const pinRules = rules.filter((r) => r.category === CAT);
    for (let i = 0; i < pinRules.length; i++) {
      for (let j = i + 1; j < pinRules.length; j++) {
        const a = pinRules[i], b = pinRules[j];
        const overlap = Math.max(a.minWidthM, b.minWidthM) < Math.min(a.maxWidthM, b.maxWidthM);
        expect(overlap, `Solapamiento: [${a.minWidthM}-${a.maxWidthM}] ∩ [${b.minWidthM}-${b.maxWidthM}]`).toBe(false);
      }
    }
  });

  it('cálculo tubo correcto a 1.40m: (1400-30)/1000 = 1.370m', () => {
    const result = resolveGroupBom(singleLine(CAT, 1.4, 2.0), config);
    expect(getTube(result)!.quantity).toBeCloseTo(1.37, 3);
  });

  it('cálculo cadena correcto a 1.80m, alto 2.00m: 2.00×2 = 4.00m', () => {
    const result = resolveGroupBom(singleLine(CAT, 1.8, 2.0), config);
    const chain = result.lines.find((l) => l.componentType === 'Cadena')!;
    expect(chain.quantity).toBeCloseTo(4.0, 3);
  });
});

// ─── GROUP 6: Bracket Doble — 2 cortinas distintas ───────────────────────────

describe('6 — Roller Bracket Doble: 2 cortinas (2.00m / 2.50m + 1.80m)', () => {
  let res: ReturnType<typeof resolveGroupBom>;

  beforeAll(() => {
    res = resolveGroupBom(doubleLine(2.0, 2.5, 2.0, 1.8), config);
  });

  it('sin errores', () => {
    expect(res.warnings).toHaveLength(0);
  });

  it('Tubo = 1.97 + 1.97 = 3.940m (scope curtain × 2)', () => {
    expect(getTube(res)!.quantity).toBeCloseTo(3.94, 2);
  });

  it('Bottomrail = 3.940m', () => {
    expect(res.lines.find((l) => l.componentType === 'Bottomrail')!.quantity).toBeCloseTo(3.94, 2);
  });

  it('Cadena = 2.50×2 + 1.80×2 = 5.00 + 3.60 = 8.600m', () => {
    expect(res.lines.find((l) => l.componentType === 'Cadena')!.quantity).toBeCloseTo(8.6, 2);
  });

  it('Tapaderas = 2+2 = 4 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Tapaderas de bottomrail')!.quantity).toBe(4);
  });

  it('Topes = 4 EA', () => {
    expect(res.lines.find((l) => l.componentType === 'Topes de cadena')!.quantity).toBe(4);
  });

  it('Soporte scope:group = 1 EA (no duplicado por cortina)', () => {
    const grp = res.lines.filter((l) => l.scope === 'group');
    expect(grp).toHaveLength(1);
    expect(grp[0].componentType).toBe('Soporte lado del control');
    expect(grp[0].quantity).toBe(1);
  });

  it('no depende de tipo de tela ni color (sin esos campos)', () => {
    // La línea no contiene fabric info — debe funcionar igualmente
    expect(res.lines.length).toBeGreaterThan(0);
  });
});

// ─── GROUP 7: Bracket Doble — 1 sola cortina ─────────────────────────────────

describe('7 — Roller Bracket Doble: 1 sola cortina → error', () => {
  const line: CurtainOrderLine = {
    orderLineId: 'ERR-1',
    category: 'Roller Bracket Doble',
    mountingType: 'doubleBracket',
    curtains: [{ curtainId: 'CA', widthM: 1.5, heightM: 2.0 }],
  };

  it('validateOrderLine devuelve REQUIRES_TWO_CURTAINS', () => {
    const errs = validateOrderLine(line, rules);
    expect(errs.some((e) => e.code === 'REQUIRES_TWO_CURTAINS')).toBe(true);
  });

  it('resolveGroupBom lanza al usar throwOnError (default)', () => {
    expect(() => resolveGroupBom(line, config)).toThrow();
  });

  it('modo no-fatal devuelve warnings y no crashea', () => {
    const result = resolveGroupBom(line, config, { throwOnError: false });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── GROUP 8: Bracket Doble — anchos distintos ───────────────────────────────

describe('8 — Roller Bracket Doble: anchos distintos → WIDTH_MISMATCH', () => {
  const line = doubleLine(2.0, 2.5, 2.01, 2.5, 'ERR-2');

  it('validateOrderLine devuelve WIDTH_MISMATCH', () => {
    const errs = validateOrderLine(line, rules);
    expect(errs.some((e) => e.code === 'WIDTH_MISMATCH')).toBe(true);
  });

  it('mensaje de error menciona ambos anchos', () => {
    const errs = validateOrderLine(line, rules);
    const err = errs.find((e) => e.code === 'WIDTH_MISMATCH')!;
    expect(err.message).toMatch(/2\.0/);
    expect(err.message).toMatch(/2\.01/);
  });

  it('resolveGroupBom lanza', () => {
    expect(() => resolveGroupBom(line, config)).toThrow();
  });
});

// ─── GROUP 9: Ancho fuera de rango ────────────────────────────────────────────

describe('9 — Ancho fuera de rango soportado (3.70m)', () => {
  const line = singleLine('Roller', 3.7, 2.0, 'ERR-3');

  it('validateOrderLine devuelve NO_MATCHING_RULE', () => {
    const errs = validateOrderLine(line, rules);
    expect(errs.some((e) => e.code === 'NO_MATCHING_RULE')).toBe(true);
  });

  it('resolveGroupBom en modo no-fatal devuelve lines vacías', () => {
    const result = resolveGroupBom(line, config, { throwOnError: false });
    expect(result.lines).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── GROUP 10: Dimensiones inválidas ─────────────────────────────────────────

describe('10 — Dimensiones inválidas', () => {
  const invalids: [string, number, number][] = [
    ['ancho=0',        0,   2.0],
    ['alto=0',         2.0, 0  ],
    ['ancho negativo', -1,  2.0],
    ['alto negativo',  2.0, -1 ],
  ];

  for (const [label, w, h] of invalids) {
    it(`${label} → INVALID_DIMENSIONS`, () => {
      const line = singleLine('Roller', w, h, `ERR-${label}`);
      const errs = validateOrderLine(line, rules);
      expect(errs.some((e) => e.code === 'INVALID_DIMENSIONS')).toBe(true);
    });
  }
});

// ─── GROUP 11: Integridad estructural del JSON ────────────────────────────────

describe('11 — Integridad estructural del JSON v2', () => {
  const FORBIDDEN = [
    'tipo_calculo', 'valor_descuento_mm', 'cantidad_fija',
    'factor_multiplicador', 'rango_min_m', 'rango_max_m',
    'componentes', 'categoria', 'reglas', 'sku_base',
    'componente_tipo', 'color_key', 'unidad',
  ];

  it('system = "rollerBomRules"', () => {
    expect(config.system).toBe('rollerBomRules');
  });

  it('colorMaps existe', () => {
    expect(config.colorMaps).toBeDefined();
    expect(typeof config.colorMaps).toBe('object');
  });

  it('no hay claves snake_case prohibidas en todo el documento', () => {
    const raw = JSON.stringify(config);
    for (const key of FORBIDDEN) {
      expect(raw, `Clave prohibida encontrada: "${key}"`).not.toContain(`"${key}"`);
    }
  });

  it('todos los bloques tienen minWidthM y maxWidthM', () => {
    for (const rule of config.rules) {
      expect(rule.minWidthM, rule.category).toBeDefined();
      expect(rule.maxWidthM, rule.category).toBeDefined();
    }
  });

  it('todos los componentes tienen scope válido', () => {
    for (const rule of config.rules) {
      for (const comp of rule.components) {
        expect(['curtain', 'group'], comp.componentType).toContain(comp.scope);
      }
    }
  });

  it('todos los componentes tienen calculation', () => {
    for (const rule of config.rules) {
      for (const comp of rule.components) {
        expect(comp.calculation, comp.componentType).toBeDefined();
        expect(comp.calculation.type, comp.componentType).toBeDefined();
      }
    }
  });

  it('todos los componentes tienen componentType y baseSku no vacíos', () => {
    for (const rule of config.rules) {
      for (const comp of rule.components) {
        expect(comp.componentType.length).toBeGreaterThan(0);
        expect(comp.baseSku.length).toBeGreaterThan(0);
      }
    }
  });

  it('13 bloques de reglas en total', () => {
    expect(config.rules).toHaveLength(13);
  });

  it('136 componentes en total', () => {
    const total = config.rules.reduce((s, r) => s + r.components.length, 0);
    expect(total).toBe(136);
  });
});

// ─── GROUP 12: No hay solapamientos por categoría ────────────────────────────

describe('12 — Sin solapamientos de rangos por categoría', () => {
  // categories must be computed inside a test/hook, not at module evaluation time,
  // because `rules` is populated asynchronously by the root beforeAll.
  it('Roller: rangos mutuamente excluyentes', () => {
    checkNoOverlap('Roller');
  });
  it('Roller Pin EndPlug: rangos mutuamente excluyentes', () => {
    checkNoOverlap('Roller Pin EndPlug');
  });
  it('Roller Bracket Doble: rangos mutuamente excluyentes', () => {
    checkNoOverlap('Roller Bracket Doble');
  });
});

function checkNoOverlap(cat: string) {
  const catRules = rules.filter((r) => r.category === cat);
  for (let i = 0; i < catRules.length; i++) {
    for (let j = i + 1; j < catRules.length; j++) {
      const a = catRules[i], b = catRules[j];
      const overlapStart = Math.max(a.minWidthM, b.minWidthM);
      const overlapEnd   = Math.min(a.maxWidthM, b.maxWidthM);
      expect(
        overlapStart < overlapEnd,
        `Solapamiento en "${cat}": [${a.minWidthM}-${a.maxWidthM}] ∩ [${b.minWidthM}-${b.maxWidthM}]`
      ).toBe(false);
    }
  }
}
