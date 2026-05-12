// ─────────────────────────────────────────────────────────────────────────────
// Luxia MES — Roller BOM Rules — TypeScript type definitions
// File: src/domain/curtains/roller-bom-rules.types.ts
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Calculation strategies
// ---------------------------------------------------------------------------

/** Width minus a fixed mm offset → result in meters (e.g., tube, bottomrail). */
export interface WidthMinusCalculation {
  type: "widthMinus";
  /** Amount to subtract from the curtain width, in mm. */
  value: number;
  unit: "mm";
  /** The resulting quantity is expressed in meters. */
  resultUnit: "m";
}

/** A fixed count of pieces, regardless of curtain dimensions. */
export interface FixedQuantityCalculation {
  type: "fixedQuantity";
  value: number;
  unit: "EA";
}

/** Multiply the curtain height by a factor (e.g., chain length = height × 2). */
export interface HeightMultiplierCalculation {
  type: "heightMultiplier";
  value: number;
  unit: "m";
  basedOn: "height";
}

/** Fallback for any unrecognised calculation type (should not appear in production). */
export interface UnknownCalculation {
  type: "unknown";
  value: number | null;
  unit: string;
}

export type BomCalculation =
  | WidthMinusCalculation
  | FixedQuantityCalculation
  | HeightMultiplierCalculation
  | UnknownCalculation;

// ---------------------------------------------------------------------------
// Component scope
// ---------------------------------------------------------------------------

/**
 * Determines how many times a component is counted per order group:
 *
 * - `"curtain"` — calculated once **per individual curtain** in the group.
 *   Examples: tube, bottomrail, chain, control, fabric.
 *
 * - `"group"` — calculated once **per mounting group** (e.g. a double-bracket
 *   set of 2 curtains), regardless of how many curtains are in the group.
 *   Examples: double-bracket support bracket.
 */
export type BomComponentScope = "curtain" | "group";

// ---------------------------------------------------------------------------
// Color map keys — all keys that may appear in BomComponent.colorKey
// ---------------------------------------------------------------------------
export type ColorMapKey =
  | "bottomrail"
  | "cadena"
  | "control"
  | "pesa"
  | "tapaderas"
  | "topes";

/**
 * Maps a human-readable color name to the resolved SKU suffix/code.
 * Keys are colour names as used in the product catalogue.
 */
export type ColorMap = Record<string, string>;

/** Colour map registry — one entry per ColorMapKey. */
export type ColorMaps = Record<ColorMapKey, ColorMap>;

// ---------------------------------------------------------------------------
// BOM component
// ---------------------------------------------------------------------------
export interface BomComponent {
  /** Human-readable description of the component (e.g. "Tubo de 38mm NEO"). */
  componentType: string;

  /**
   * Base SKU.  May contain placeholder characters ("X") that must be replaced
   * at runtime using the matching colorMaps entry when colorKey is not null.
   */
  baseSku: string;

  /**
   * When not null, references a key in `colorMaps` whose value must be used
   * to substitute the "X" placeholder(s) in `baseSku`.
   */
  colorKey: ColorMapKey | null;

  /**
   * Defines whether this component is consumed per individual curtain or once
   * per mounting group (e.g. a double-bracket set).
   *
   * - `"curtain"` → multiply by the number of curtains in the group.
   * - `"group"`   → consume exactly once regardless of curtain count.
   */
  scope: BomComponentScope;

  /** How to compute the required quantity for this component. */
  calculation: BomCalculation;

  /** Human-readable production note.  Must NOT be the sole source of business logic. */
  notes: string;

  // --- Operative flags (only present when truthy) ---

  /**
   * When true, this component is not mandatory.
   * Typically set when notes contain "opcional" or "queda a elección".
   */
  optional?: true;

  /**
   * When true, this component is the preferred choice among alternatives.
   * Typically set when notes contain "primera opción".
   */
  recommended?: true;

  /**
   * Ordering priority within a group of alternative components.
   * Lower value = higher priority.  Present only when `recommended` is true.
   */
  priority?: number;
}

// ---------------------------------------------------------------------------
// BOM rule block  (one range band for one category)
// ---------------------------------------------------------------------------
export interface BomRule {
  /** Curtain system / product category, e.g. "Roller", "Roller Pin EndPlug". */
  category: string;

  /** Minimum curtain width (inclusive) in metres this rule applies to. */
  minWidthM: number;

  /** Maximum curtain width (inclusive) in metres this rule applies to. */
  maxWidthM: number;

  /** All components required when the curtain width falls within [minWidthM, maxWidthM]. */
  components: BomComponent[];
}

// ---------------------------------------------------------------------------
// Root document
// ---------------------------------------------------------------------------
export interface RollerBomRulesConfig {
  /** Semantic version of this configuration schema. */
  version: string;

  /** Identifier of the system that owns this configuration. */
  system: "rollerBomRules";

  /**
   * Ordered list of rule blocks.
   * For a given category + width, exactly ONE block should match.
   * Ranges are guaranteed to be mutually exclusive within each category.
   */
  rules: BomRule[];

  /**
   * Colour-to-SKU mapping registry.
   * Used at runtime to resolve placeholder "X" characters in baseSku fields.
   * Each top-level key corresponds to a possible value of BomComponent.colorKey.
   */
  colorMaps: ColorMaps;
}

// ---------------------------------------------------------------------------
// Order-line / group input models
// ---------------------------------------------------------------------------

/** Dimensions and tone for a single curtain within a mounting group. */
export interface CurtainInput {
  /** Unique identifier for this curtain within the order (e.g. UUID or line index). */
  curtainId: string;
  /** Finished width in metres. */
  widthM: number;
  /** Finished height in metres. */
  heightM: number;
  /**
   * Hardware tone for SKU colour resolution.
   * Defaults to "white" if not specified.
   */
  tone?: "white" | "ivory" | "grey" | "bronze";
}

/**
 * Represents a single mounting-group line in a production order.
 *
 * For `"doubleBracket"` mounting:
 * - Exactly 2 curtains must be present in `curtains`.
 * - Both curtains must share the same `widthM`.
 * - Bracket-scoped components are consumed once per group.
 *
 * For `"standard"` and `"pinEndPlug"` mounting:
 * - Exactly 1 curtain is expected per line.
 * - All components are curtain-scoped.
 */
export interface CurtainOrderLine {
  /** Unique identifier for this order-group line (e.g. UUID). */
  orderLineId: string;
  /**
   * Mounting category — must match a `category` value in the BOM rules JSON.
   * Examples: "Roller", "Roller Pin EndPlug", "Roller Bracket Doble".
   */
  category: string;
  /**
   * Mounting type shorthand used for internal logic branching.
   * - `"singleBracket"` → standard or pin end-plug, 1 curtain per line.
   * - `"doubleBracket"` → double-bracket set, exactly 2 curtains per line.
   */
  mountingType: "singleBracket" | "doubleBracket";
  /** Curtains belonging to this mounting group. */
  curtains: CurtainInput[];
}

// ---------------------------------------------------------------------------
// Runtime resolved output types
// ---------------------------------------------------------------------------

/**
 * Result of a BOM resolution for a single component,
 * after applying width, height and colour substitutions.
 */
export interface ResolvedBomLine {
  componentType: string;
  /** Final SKU after colour substitution — no placeholders remain. */
  resolvedSku: string;
  /** Computed quantity (metres or EA) based on curtain dimensions. */
  quantity: number;
  unit: "m" | "EA";
  /** Whether this line was calculated per-curtain or per-group. */
  scope: BomComponentScope;
  notes: string;
  optional: boolean;
  recommended: boolean;
}

/** Aggregated BOM result for a complete order line (one mounting group). */
export interface ResolvedGroupBom {
  orderLineId: string;
  category: string;
  mountingType: "singleBracket" | "doubleBracket";
  /** Warnings generated during validation (non-fatal). */
  warnings: string[];
  /** All resolved material lines for the group. */
  lines: ResolvedBomLine[];
  /**
   * True when the order line was processed under a special-fabrication exception
   * (e.g. Roller Bracket Doble > 2.80 m with `riskAcceptedByCustomer: true`).
   * Must be surfaced clearly in the UI / production order.
   */
  specialFabrication?: true;
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

/** Structured validation error for a double-bracket order line. */
export interface DoubleBracketValidationError {
  code:
    | "REQUIRES_TWO_CURTAINS"
    | "WIDTH_MISMATCH"
    | "NO_MATCHING_RULE"
    | "INVALID_DIMENSIONS"
    /**
     * Fired when a Roller Bracket Doble line exceeds 2.80 m without explicit
     * customer approval (`riskAcceptedByCustomer: true`).
     */
    | "DOUBLE_BRACKET_WIDTH_LIMIT_EXCEEDED";
  message: string;
  orderLineId: string;
}
