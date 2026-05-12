/**
 * doubleBracketBom.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Luxia MES — Motor de BOM con soporte de scope "curtain" / "group".
 *
 * Implementa la regla de negocio para conjuntos de Roller Bracket Doble:
 *   - Componentes scope:"curtain" → se calculan una vez por cada cortina.
 *   - Componentes scope:"group"   → se calculan una sola vez por conjunto.
 *
 * Uso básico:
 *   const result = resolveGroupBom(orderLine, bomRules);
 *
 * @module doubleBracketBom
 */

import type {
  BomComponent,
  BomCalculation,
  BomRule,
  CurtainInput,
  CurtainOrderLine,
  DoubleBracketValidationError,
  ResolvedBomLine,
  ResolvedGroupBom,
  RollerBomRulesConfig,
} from '../domain/curtains/roller-bom-rules.types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Width tolerance in metres for double-bracket same-width validation. */
const WIDTH_TOLERANCE_M = 0.001;

/** Category name used to identify double-bracket rules in the JSON. */
const DOUBLE_BRACKET_CATEGORY = 'Roller Bracket Doble';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Computes a scalar quantity from a BOM calculation definition
 * given the curtain's physical dimensions.
 */
function computeQuantity(
  calculation: BomCalculation,
  widthM: number,
  heightM: number
): number {
  switch (calculation.type) {
    case 'widthMinus':
      // Width in mm minus discount, then convert back to metres.
      return parseFloat(
        ((widthM * 1000 - calculation.value) / 1000).toFixed(3)
      );

    case 'fixedQuantity':
      return calculation.value;

    case 'heightMultiplier':
      return parseFloat((heightM * calculation.value).toFixed(3));

    case 'unknown':
    default:
      return calculation.value ?? 0;
  }
}

/**
 * Resolves the unit string from a calculation object.
 */
function resolveUnit(calculation: BomCalculation): 'm' | 'EA' {
  if (
    calculation.type === 'widthMinus' ||
    calculation.type === 'heightMultiplier'
  ) {
    return 'm';
  }
  return 'EA';
}

/**
 * Finds the single BOM rule that applies for a given category + width.
 * Returns undefined if no rule matches.
 */
function findRule(
  rules: BomRule[],
  category: string,
  widthM: number
): BomRule | undefined {
  return rules.find(
    (r) =>
      r.category === category &&
      widthM >= r.minWidthM &&
      widthM <= r.maxWidthM
  );
}

/**
 * Resolves a single BomComponent into a ResolvedBomLine for a given curtain.
 */
function resolveComponent(
  comp: BomComponent,
  widthM: number,
  heightM: number
): ResolvedBomLine {
  const quantity = computeQuantity(comp.calculation, widthM, heightM);
  const unit     = resolveUnit(comp.calculation);

  return {
    componentType: comp.componentType,
    resolvedSku:   comp.baseSku,  // SKU colour resolution left to caller/colorMaps layer
    quantity,
    unit,
    scope:       comp.scope,
    notes:       comp.notes,
    optional:    comp.optional    ?? false,
    recommended: comp.recommended ?? false,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a CurtainOrderLine against double-bracket business rules.
 *
 * Returns an array of structured errors.  An empty array means the line is valid.
 *
 * Rules checked:
 *   1. Positive dimensions for every curtain.
 *   2. Exactly 2 curtains for double-bracket lines.
 *   3. Both curtains must share the same width (within WIDTH_TOLERANCE_M).
 *   4. A matching BOM rule must exist for the given category + width.
 */
export function validateOrderLine(
  line: CurtainOrderLine,
  rules: BomRule[]
): DoubleBracketValidationError[] {
  const errors: DoubleBracketValidationError[] = [];

  // 1. Dimension sanity for every curtain
  for (const c of line.curtains) {
    if (c.widthM <= 0 || c.heightM <= 0) {
      errors.push({
        code:        'INVALID_DIMENSIONS',
        message:     `Cortina "${c.curtainId}" tiene dimensiones inválidas: ` +
                     `ancho=${c.widthM}m, alto=${c.heightM}m.`,
        orderLineId: line.orderLineId,
      });
    }
  }

  // 2. Double-bracket requires exactly 2 curtains
  if (line.mountingType === 'doubleBracket' && line.curtains.length !== 2) {
    errors.push({
      code:        'REQUIRES_TWO_CURTAINS',
      message:     `Roller Bracket Doble requiere exactamente 2 cortinas en el ` +
                   `conjunto (línea "${line.orderLineId}" tiene ${line.curtains.length}).`,
      orderLineId: line.orderLineId,
    });
  }

  // 3. All curtains in a double-bracket group must share the same width
  if (line.mountingType === 'doubleBracket' && line.curtains.length === 2) {
    const [a, b] = line.curtains;
    if (Math.abs(a.widthM - b.widthM) > WIDTH_TOLERANCE_M) {
      errors.push({
        code:        'WIDTH_MISMATCH',
        message:     `Las cortinas del conjunto "${line.orderLineId}" tienen anchos ` +
                     `distintos: ${a.widthM}m vs ${b.widthM}m. ` +
                     `El bracket doble requiere el mismo ancho en ambas cortinas.`,
        orderLineId: line.orderLineId,
      });
    }
  }

  // 4. A matching BOM rule must exist (use first curtain's width as reference)
  if (line.curtains.length > 0) {
    const refWidth = line.curtains[0].widthM;
    const rule = findRule(rules, line.category, refWidth);
    if (!rule) {
      errors.push({
        code:        'NO_MATCHING_RULE',
        message:     `No existe regla BOM para categoría "${line.category}" ` +
                     `con ancho ${refWidth.toFixed(3)}m.`,
        orderLineId: line.orderLineId,
      });
    }
  }

  return errors;
}

// ─── Main engine ─────────────────────────────────────────────────────────────

/**
 * Resolves the complete BOM for a CurtainOrderLine, respecting component scope.
 *
 * - Components with `scope: "curtain"` are calculated once per curtain and
 *   their quantities summed into the output lines.
 * - Components with `scope: "group"` are calculated exactly once using the
 *   first curtain's dimensions as the reference (width is shared in valid groups).
 *
 * @param line      The order group line to resolve.
 * @param config    The full RollerBomRulesConfig document.
 * @throws {DoubleBracketValidationError[]} Array of errors if validation fails
 *         (only when `throwOnError` is true, default).
 */
export function resolveGroupBom(
  line: CurtainOrderLine,
  config: RollerBomRulesConfig,
  options: { throwOnError?: boolean } = { throwOnError: true }
): ResolvedGroupBom {

  // ── Validate ──────────────────────────────────────────────────────────────
  const validationErrors = validateOrderLine(line, config.rules);

  if (validationErrors.length > 0 && options.throwOnError !== false) {
    throw validationErrors;
  }

  const warnings: string[] = validationErrors.map((e) => e.message);

  // Use first curtain as the reference for group-scoped dimensions
  const refCurtain: CurtainInput = line.curtains[0] ?? {
    curtainId: '__fallback',
    widthM:    0,
    heightM:   0,
  };

  // ── Find matching BOM rule ────────────────────────────────────────────────
  const rule = findRule(config.rules, line.category, refCurtain.widthM);

  if (!rule) {
    // Return empty result with warning rather than crashing
    return {
      orderLineId: line.orderLineId,
      category:    line.category,
      mountingType: line.mountingType,
      warnings:    [
        ...warnings,
        `No BOM rule matched for category="${line.category}" widthM=${refCurtain.widthM}`,
      ],
      lines: [],
    };
  }

  // ── Separate components by scope ─────────────────────────────────────────
  const curtainComps = rule.components.filter((c) => c.scope === 'curtain');
  const groupComps   = rule.components.filter((c) => c.scope === 'group');

  const outputLines: ResolvedBomLine[] = [];

  // ── Curtain-scoped: one pass per curtain, quantities summed ───────────────
  // We aggregate by componentType so the BOM list stays flat:
  // each component appears once with the total quantity across all curtains.
  const curtainAgg = new Map<string, ResolvedBomLine>();

  for (const curtain of line.curtains) {
    for (const comp of curtainComps) {
      const resolved = resolveComponent(comp, curtain.widthM, curtain.heightM);

      if (curtainAgg.has(comp.componentType)) {
        // Accumulate quantity for same component type across curtains
        curtainAgg.get(comp.componentType)!.quantity = parseFloat(
          (curtainAgg.get(comp.componentType)!.quantity + resolved.quantity).toFixed(3)
        );
      } else {
        curtainAgg.set(comp.componentType, { ...resolved });
      }
    }
  }

  outputLines.push(...Array.from(curtainAgg.values()));

  // ── Group-scoped: calculated exactly once using reference curtain ─────────
  for (const comp of groupComps) {
    outputLines.push(resolveComponent(comp, refCurtain.widthM, refCurtain.heightM));
  }

  return {
    orderLineId:  line.orderLineId,
    category:     line.category,
    mountingType: line.mountingType,
    warnings,
    lines:        outputLines,
  };
}

/**
 * Convenience wrapper: resolves BOM for multiple order lines.
 * Returns one ResolvedGroupBom per line.
 * Lines with validation errors are included with warnings (non-fatal mode).
 */
export function resolveOrderBom(
  lines: CurtainOrderLine[],
  config: RollerBomRulesConfig
): ResolvedGroupBom[] {
  return lines.map((line) =>
    resolveGroupBom(line, config, { throwOnError: false })
  );
}
