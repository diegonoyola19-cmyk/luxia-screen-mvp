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

/**
 * Maximum width (inclusive, in metres) for standard Roller Bracket Doble fabrication.
 * Widths above this require explicit customer approval (`riskAcceptedByCustomer: true`).
 */
const DOUBLE_BRACKET_MAX_WIDTH_M = 2.8;

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

// ─── Color resolution ────────────────────────────────────────────────────────

/** SKU placeholder pattern: one or more contiguous X characters. */
const SKU_PLACEHOLDER_RE = /X+/;

export type ColorResolutionError =
  | 'COLOR_SKU_NOT_FOUND'
  | 'UNRESOLVED_SKU_PLACEHOLDER'
  | 'COLOR_NOT_SUPPORTED';

export interface ResolvedSkuResult {
  resolvedSku: string;
  /** Set when color resolution failed — the SKU should NOT be used as-is. */
  colorError?: ColorResolutionError;
  colorErrorMessage?: string;
}

/**
 * Resolves the baseSku of a BomComponent using the colorMaps registry.
 *
 * Design: colorMaps[colorKey][tone] stores the **complete final SKU** for that
 * tone (as exported from the BOM Excel). The baseSku is used as the fallback
 * when no map entry exists, and to detect X placeholders that would indicate
 * an unresolved code.
 *
 * Error codes returned:
 *   COLOR_NOT_SUPPORTED      — no tone specified.
 *   COLOR_SKU_NOT_FOUND      — colorKey exists but tone has no entry in the map.
 *   UNRESOLVED_SKU_PLACEHOLDER — baseSku contains X and no resolution was found.
 */
export function resolveSku(
  baseSku: string,
  colorKey: string | null,
  tone: string | null | undefined,
  colorMaps: Record<string, Record<string, string>>
): ResolvedSkuResult {

  // No colorKey → SKU is fixed, use as-is (guard against accidental X)
  if (!colorKey) {
    if (SKU_PLACEHOLDER_RE.test(baseSku)) {
      return {
        resolvedSku: baseSku,
        colorError: 'UNRESOLVED_SKU_PLACEHOLDER',
        colorErrorMessage:
          `El SKU "${baseSku}" contiene un placeholder (X) pero no tiene colorKey. ` +
          `No existe SKU configurado para el color seleccionado en este componente.`,
      };
    }
    return { resolvedSku: baseSku };
  }

  // colorKey set but no tone provided
  if (!tone) {
    return {
      resolvedSku: baseSku,
      colorError: 'COLOR_NOT_SUPPORTED',
      colorErrorMessage:
        'No se especificó un tono de herrajes. El SKU no puede resolverse. ' +
        'No existe SKU configurado para el color seleccionado en este componente.',
    };
  }

  const map = colorMaps[colorKey];

  // colorMap key exists but has no entries yet (known data gap)
  if (!map || Object.keys(map).length === 0) {
    return {
      resolvedSku: baseSku,
      colorError: 'COLOR_SKU_NOT_FOUND',
      colorErrorMessage:
        `colorMaps["${colorKey}"] no tiene entradas configuradas para el tono "${tone}". ` +
        `No existe SKU configurado para el color seleccionado en este componente. ` +
        `Revisa el colorMap antes de generar el descargo.`,
    };
  }

  // Lookup: the map value IS the complete final SKU
  const finalSku = map[tone];
  if (!finalSku) {
    return {
      resolvedSku: baseSku,
      colorError: 'COLOR_SKU_NOT_FOUND',
      colorErrorMessage:
        `No existe SKU configurado para el tono "${tone}" en colorMaps["${colorKey}"]. ` +
        `No existe SKU configurado para el color seleccionado en este componente. ` +
        `Revisa el colorMap antes de generar el descargo.`,
    };
  }

  // Paranoid: verify the resolved SKU has no X placeholder
  if (SKU_PLACEHOLDER_RE.test(finalSku)) {
    return {
      resolvedSku: finalSku,
      colorError: 'UNRESOLVED_SKU_PLACEHOLDER',
      colorErrorMessage:
        `El SKU resuelto "${finalSku}" todavía contiene un placeholder. ` +
        `Verifica colorMaps["${colorKey}"]["${tone}"].`,
    };
  }

  return { resolvedSku: finalSku };
}

/**
 * Resolves a single BomComponent into a ResolvedBomLine for a given curtain.
 * Accepts an optional tone + colorMaps for SKU colour substitution.
 */
function resolveComponent(
  comp: BomComponent,
  widthM: number,
  heightM: number,
  tone?: string | null,
  colorMaps?: Record<string, Record<string, string>>
): ResolvedBomLine {
  const quantity = computeQuantity(comp.calculation, widthM, heightM);
  const unit     = resolveUnit(comp.calculation);

  const skuResult = colorMaps
    ? resolveSku(comp.baseSku, comp.colorKey, tone ?? null, colorMaps)
    : { resolvedSku: comp.baseSku };

  return {
    componentType: comp.componentType,
    resolvedSku:   skuResult.resolvedSku,
    quantity,
    unit,
    scope:         comp.scope,
    notes:         comp.notes,
    optional:      comp.optional    ?? false,
    recommended:   comp.recommended ?? false,
    colorError:    skuResult.colorError,
    colorErrorMessage: skuResult.colorErrorMessage,
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
 *   5. Width must not exceed DOUBLE_BRACKET_MAX_WIDTH_M (without approval flag).
 */
export function validateOrderLine(
  line: CurtainOrderLine,
  rules: BomRule[],
  options: { riskAcceptedByCustomer?: boolean; customerApproval?: boolean } = {}
): DoubleBracketValidationError[] {
  const errors: DoubleBracketValidationError[] = [];
  const riskAccepted = options.riskAcceptedByCustomer === true || options.customerApproval === true;

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

  // 4. Width limit for double-bracket — checked before rule lookup
  if (
    line.mountingType === 'doubleBracket' &&
    line.curtains.length > 0 &&
    !riskAccepted
  ) {
    const refWidth = line.curtains[0].widthM;
    if (refWidth > DOUBLE_BRACKET_MAX_WIDTH_M) {
      errors.push({
        code:        'DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED',
        message:
          'El bracket doble está recomendado solo hasta 2.80 m de ancho. ' +
          'Para medidas superiores, la fabricación queda bajo autorización ' +
          'especial y riesgo asumido por el cliente.',
        orderLineId: line.orderLineId,
      });
    }
  }

  // 5. A matching BOM rule must exist (use first curtain's width as reference)
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
 * Options:
 *   - `throwOnError`          — throw the errors array on validation failure (default: true).
 *   - `riskAcceptedByCustomer`— allow Roller Bracket Doble > 2.80 m; marks result as
 *                               `specialFabrication: true` (default: false).
 *   - `customerApproval`      — alias for `riskAcceptedByCustomer`.
 */
export function resolveGroupBom(
  line: CurtainOrderLine,
  config: RollerBomRulesConfig,
  options: {
    throwOnError?: boolean;
    riskAcceptedByCustomer?: boolean;
    customerApproval?: boolean;
  } = { throwOnError: true }
): ResolvedGroupBom {

  // ── Validate ──────────────────────────────────────────────────────────────
  const riskAccepted =
    options.riskAcceptedByCustomer === true || options.customerApproval === true;

  const validationErrors = validateOrderLine(line, config.rules, { riskAcceptedByCustomer: riskAccepted });

  if (validationErrors.length > 0 && options.throwOnError !== false) {
    throw validationErrors;
  }

  const warnings: string[] = validationErrors.map((e) => e.message);

  // Flag special fabrication when width limit was waived
  const isSpecialFab =
    riskAccepted &&
    line.mountingType === 'doubleBracket' &&
    line.curtains.length > 0 &&
    line.curtains[0].widthM > 2.8;

  if (isSpecialFab) {
    warnings.push(
      'FABRICACIÓN ESPECIAL: ancho supera 2.80 m en bracket doble. ' +
      'Riesgo asumido por el cliente.'
    );
  }

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
      orderLineId:  line.orderLineId,
      category:     line.category,
      mountingType: line.mountingType,
      warnings: [
        ...warnings,
        `No BOM rule matched for category="${line.category}" widthM=${refCurtain.widthM}`,
      ],
      lines: [],
      ...(isSpecialFab ? { specialFabrication: true as const } : {}),
    };
  }

  // ── Apply exclusion rules (e.g. VTX30 replaces normal control) ─────────
  const hasRecommendedControl = rule.components.some(
    (c) => c.componentType.startsWith('Control de cortina') && c.recommended
  );

  const activeComponents = rule.components.filter((c) => {
    if (
      hasRecommendedControl &&
      c.componentType.startsWith('Control de cortina') &&
      !c.recommended
    ) {
      return false;
    }
    return true;
  });

  // ── Separate components by scope ─────────────────────────────────────────
  const curtainComps = activeComponents.filter((c) => c.scope === 'curtain');
  const groupComps   = activeComponents.filter((c) => c.scope === 'group');

  const outputLines: ResolvedBomLine[] = [];

  // ── Curtain-scoped: one pass per curtain, quantities summed ───────────────
  // We aggregate by componentType so the BOM list stays flat:
  // each component appears once with the total quantity across all curtains.
  const curtainAgg = new Map<string, ResolvedBomLine>();

  for (const curtain of line.curtains) {
    for (const comp of curtainComps) {
      const resolved = resolveComponent(comp, curtain.widthM, curtain.heightM, curtain.tone, config.colorMaps);

      if (curtainAgg.has(resolved.resolvedSku)) {
        // Accumulate quantity for same SKU across curtains
        curtainAgg.get(resolved.resolvedSku)!.quantity = parseFloat(
          (curtainAgg.get(resolved.resolvedSku)!.quantity + resolved.quantity).toFixed(3)
        );
      } else {
        curtainAgg.set(resolved.resolvedSku, { ...resolved });
      }
    }
  }

  outputLines.push(...Array.from(curtainAgg.values()));

  // ── Group-scoped: calculated exactly once using reference curtain ─────────
  for (const comp of groupComps) {
    outputLines.push(resolveComponent(comp, refCurtain.widthM, refCurtain.heightM, refCurtain.tone, config.colorMaps));
  }

  return {
    orderLineId:       line.orderLineId,
    category:          line.category,
    mountingType:      line.mountingType,
    warnings,
    lines:             outputLines,
    ...(isSpecialFab ? { specialFabrication: true as const } : {}),
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
