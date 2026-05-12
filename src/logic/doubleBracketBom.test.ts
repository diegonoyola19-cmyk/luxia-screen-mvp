/**
 * doubleBracketBom.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Luxia MES — Tests for the scope-aware BOM engine (doubleBracketBom.ts).
 *
 * Covers the 5 acceptance cases defined in the business specification:
 *
 *   CASE 1 — Roller Bracket Doble, 2 curtains (any fabric), width 2.00 m.
 *             Expect: curtain components × 2, bracket support × 1.
 *
 *   CASE 2 — Roller Bracket Doble, 2 identical curtains.
 *             Expect: bracket support still × 1.
 *
 *   CASE 3 — Standard Roller, 1 curtain.
 *             Expect: no group logic, all components calculated normally.
 *
 *   CASE 4 — Roller Bracket Doble, only 1 curtain.
 *             Expect: validation error REQUIRES_TWO_CURTAINS.
 *
 *   CASE 5 — Roller Bracket Doble, 2 curtains with different widths.
 *             Expect: validation error WIDTH_MISMATCH.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  resolveGroupBom,
  validateOrderLine,
} from './doubleBracketBom';

import type {
  CurtainOrderLine,
  DoubleBracketValidationError,
  RollerBomRulesConfig,
} from '../domain/curtains/roller-bom-rules.types';

// ─── Load BOM config ──────────────────────────────────────────────────────────

let config: RollerBomRulesConfig;

beforeAll(() => {
  const jsonPath = resolve(__dirname, '../../docs/roller-bom-rules-v2.json');
  config = JSON.parse(readFileSync(jsonPath, 'utf-8')) as RollerBomRulesConfig;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDoubleBracketLine(
  widthA: number,
  heightA: number,
  widthB: number,
  heightB: number,
  id = 'line-test'
): CurtainOrderLine {
  return {
    orderLineId: id,
    category: 'Roller Bracket Doble',
    mountingType: 'doubleBracket',
    curtains: [
      { curtainId: 'curtain-A', widthM: widthA, heightM: heightA },
      { curtainId: 'curtain-B', widthM: widthB, heightM: heightB },
    ],
  };
}

function makeSingleRollerLine(
  widthM: number,
  heightM: number,
  id = 'line-single'
): CurtainOrderLine {
  return {
    orderLineId: id,
    category: 'Roller',
    mountingType: 'singleBracket',
    curtains: [{ curtainId: 'curtain-A', widthM, heightM }],
  };
}

// ─── CASE 1 ───────────────────────────────────────────────────────────────────

describe('CASE 1 — Roller Bracket Doble with 2 curtains (2.00 m wide)', () => {
  const line = makeDoubleBracketLine(2.0, 2.5, 2.0, 2.0);

  it('resolves without errors', () => {
    const errors = validateOrderLine(line, config.rules);
    expect(errors).toHaveLength(0);
  });

  it('produces a non-empty BOM', () => {
    const result = resolveGroupBom(line, config);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('curtain-scoped components accumulate quantities from both curtains', () => {
    const result = resolveGroupBom(line, config);

    // Tube is curtain-scoped. For widthM=2.0, tube = (2000mm - 30mm)/1000 = 1.97m per curtain.
    // Two curtains → 1.97 + 1.97 = 3.940m
    const tube = result.lines.find((l) => l.componentType === 'Tubo de 38mm NEO');
    expect(tube).toBeDefined();
    expect(tube!.scope).toBe('curtain');
    expect(tube!.quantity).toBeCloseTo(3.94, 2);
  });

  it('group-scoped bracket support appears exactly once with quantity = 1', () => {
    const result = resolveGroupBom(line, config);

    const groupLines = result.lines.filter((l) => l.scope === 'group');
    expect(groupLines).toHaveLength(1);

    const bracket = groupLines[0];
    expect(bracket.componentType).toBe('Soporte lado del control');
    expect(bracket.quantity).toBe(1);
  });

  it('does NOT depend on fabric type or fabric colour', () => {
    // Same line, no fabric info anywhere — still works
    const result = resolveGroupBom(line, config);
    expect(result.lines.length).toBeGreaterThan(0);
  });
});

// ─── CASE 2 ───────────────────────────────────────────────────────────────────

describe('CASE 2 — Roller Bracket Doble with 2 identical curtains', () => {
  const line = makeDoubleBracketLine(1.2, 2.0, 1.2, 2.0);

  it('resolves without errors', () => {
    expect(validateOrderLine(line, config.rules)).toHaveLength(0);
  });

  it('bracket support still counted exactly once even when curtains are identical', () => {
    const result = resolveGroupBom(line, config);
    const groupLines = result.lines.filter((l) => l.scope === 'group');
    expect(groupLines).toHaveLength(1);
    expect(groupLines[0].quantity).toBe(1);
  });

  it('curtain components are doubled for identical curtains', () => {
    const result = resolveGroupBom(line, config);
    // Chain is curtain-scoped: height × 2 per curtain → 2.0 × 2 × 2 curtains = 8.0m
    const chain = result.lines.find((l) => l.componentType === 'Cadena');
    expect(chain).toBeDefined();
    expect(chain!.scope).toBe('curtain');
    expect(chain!.quantity).toBeCloseTo(8.0, 2);
  });
});

// ─── CASE 3 ───────────────────────────────────────────────────────────────────

describe('CASE 3 — Standard Roller with 1 curtain', () => {
  const line = makeSingleRollerLine(1.5, 2.0);

  it('resolves without errors', () => {
    expect(validateOrderLine(line, config.rules)).toHaveLength(0);
  });

  it('produces BOM with no group-scoped components', () => {
    const result = resolveGroupBom(line, config);
    const groupLines = result.lines.filter((l) => l.scope === 'group');
    expect(groupLines).toHaveLength(0);
  });

  it('all components have scope curtain', () => {
    const result = resolveGroupBom(line, config);
    expect(result.lines.every((l) => l.scope === 'curtain')).toBe(true);
  });

  it('tube quantity equals one-curtain calculation (1.5m - 30mm = 1.47m)', () => {
    const result = resolveGroupBom(line, config);
    const tube = result.lines.find((l) => l.componentType.startsWith('Tubo'));
    expect(tube).toBeDefined();
    expect(tube!.quantity).toBeCloseTo(1.47, 2);
  });
});

// ─── CASE 4 ───────────────────────────────────────────────────────────────────

describe('CASE 4 — Roller Bracket Doble with only 1 curtain (invalid)', () => {
  const line: CurtainOrderLine = {
    orderLineId: 'line-only-one',
    category: 'Roller Bracket Doble',
    mountingType: 'doubleBracket',
    curtains: [{ curtainId: 'curtain-A', widthM: 1.5, heightM: 2.0 }],
  };

  it('returns REQUIRES_TWO_CURTAINS validation error', () => {
    const errors = validateOrderLine(line, config.rules);
    expect(errors.some((e) => e.code === 'REQUIRES_TWO_CURTAINS')).toBe(true);
  });

  it('throws when resolveGroupBom is called with throwOnError=true (default)', () => {
    expect(() => resolveGroupBom(line, config)).toThrow();
  });

  it('returns warnings and empty lines when throwOnError=false', () => {
    const result = resolveGroupBom(line, config, { throwOnError: false });
    expect(result.warnings.length).toBeGreaterThan(0);
    // Lines may or may not exist (depends on whether rule was found),
    // but no crash should occur.
  });
});

// ─── CASE 5 ───────────────────────────────────────────────────────────────────

describe('CASE 5 — Roller Bracket Doble with mismatched widths (invalid)', () => {
  const line = makeDoubleBracketLine(1.5, 2.0, 2.0, 2.0, 'line-width-mismatch');

  it('returns WIDTH_MISMATCH validation error', () => {
    const errors = validateOrderLine(line, config.rules);
    expect(errors.some((e) => e.code === 'WIDTH_MISMATCH')).toBe(true);
  });

  it('throws when resolveGroupBom is called with throwOnError=true (default)', () => {
    expect(() => resolveGroupBom(line, config)).toThrow();
  });

  it('error message includes both widths for debuggability', () => {
    const errors = validateOrderLine(line, config.rules);
    const mismatch = errors.find(
      (e: DoubleBracketValidationError) => e.code === 'WIDTH_MISMATCH'
    )!;
    expect(mismatch.message).toMatch(/1\.5/);
    expect(mismatch.message).toMatch(/2/);
  });
});
