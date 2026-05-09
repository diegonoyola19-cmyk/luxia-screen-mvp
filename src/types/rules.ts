/**
 * rules.ts — Tipado del Motor de Reglas de Producción V3
 * ─────────────────────────────────────────────────────────────────────────────
 * Define las interfaces canónicas para grupos de reglas y componentes de
 * fabricación. Estas interfaces son la fuente de verdad entre:
 *   - El parser de CSV/JSON (parseRulesFromSource)
 *   - El store Zustand (useRecipeStore)
 *   - Las tablas relacionales de Supabase (rule_groups, rule_components)
 *
 * Supabase mapping:
 *   RuleGroup     → tabla `rule_groups`
 *   RuleComponent → tabla `rule_components`
 *   ColorVariants → columnas JSON dentro de `rule_components`
 *
 * @author Luxia MES — V3
 */

// ─── Variantes de color por componente ───────────────────────────────────────

/**
 * SKU por tono de herraje. Un valor `null` indica que ese color no existe
 * para este componente (ej.: soportes solo existen en blanco → ivory/grey/bronze = null).
 *
 * Supabase: almacenado como columna JSONB `color_variants` en `rule_components`.
 */
export interface ColorVariants {
  grey:   string | null;
  ivory:  string | null;
  white:  string | null;
  bronze: string | null;
}

// ─── Tipos de cálculo soportados ─────────────────────────────────────────────

/**
 * Métodos de cálculo de cantidad reconocidos por el motor.
 *
 * - `DESCUENTO_MM`   : largo lineal = (ancho_m * 1000 - descuento) / 1000
 * - `CANTIDAD_FIJA`  : siempre el valor exacto sin dependencia de medidas
 * - `FACTOR_ALTO`    : largo = alto_m * factor  (cadena = alto * 2)
 */
export type CalculationType =
  | 'DESCUENTO_MM'
  | 'CANTIDAD_FIJA'
  | 'FACTOR_ALTO';

// ─── Componente de regla ──────────────────────────────────────────────────────

/**
 * Representa un único material/componente dentro de un grupo de reglas.
 *
 * Supabase: tabla `rule_components`
 *   Columnas relevantes:
 *     id             UUID PK
 *     rule_group_id  UUID FK → rule_groups.id
 *     component_type TEXT
 *     suggested_sku  TEXT
 *     value          NUMERIC
 *     calculation_type TEXT (CHECK constraint con valores de CalculationType)
 *     additional_rules TEXT nullable
 *     has_color_variants BOOLEAN
 *     color_variants JSONB
 */
export interface RuleComponent {
  /** UUID asignado por Supabase al persistir. Opcional en memoria. */
  id?:             string;
  /** FK al RuleGroup padre. Opcional en memoria, requerido al insertar en Supabase. */
  ruleGroupId?:    string;
  /** Nombre descriptivo del tipo de componente (ej. "Tubo de 38mm NEO") */
  componentType:   string;
  /** SKU base (puede contener placeholder X para color, ej. "0-151-AL-CLX19") */
  suggestedSku:    string;
  /** Valor numérico usado por el tipo de cálculo */
  value:           number;
  /** Tipo de cálculo a aplicar */
  calculationType: CalculationType;
  /**
   * Regla de negocio adicional en texto libre.
   * `null` si el componente no requiere aclaraciones.
   */
  additionalRules: string | null;
  /**
   * `true`  → el componente varía por tono (bottomrail, cadena, control, etc.)
   * `false` → existe un único SKU independiente del color (soportes, end plug)
   */
  hasColorVariants: boolean;
  /**
   * SKUs por tono. Si `hasColorVariants` es false, todos los valores son `null`.
   * Si el componente solo existe en un tono, los demás quedan en `null`.
   */
  colorVariants: ColorVariants;
}

// ─── Grupo de reglas ──────────────────────────────────────────────────────────

/**
 * Agrupa los componentes que aplican para una categoría de producto
 * dentro de un rango de ancho definido.
 *
 * Supabase: tabla `rule_groups`
 *   Columnas relevantes:
 *     id              UUID PK
 *     category        TEXT  (ej. "Roller")
 *     min_width_meters NUMERIC
 *     max_width_meters NUMERIC
 *     group_label     TEXT nullable
 *     created_at      TIMESTAMPTZ
 *     updated_at      TIMESTAMPTZ
 */
export interface RuleGroup {
  /** UUID asignado por Supabase al persistir. Opcional en memoria. */
  id?:             string;
  /** Categoría de producto (ej. "Roller", "Blackout", "Screen") */
  category:        string;
  /** Límite inferior del rango de ancho en metros (inclusive) */
  minWidthMeters:  number;
  /** Límite superior del rango de ancho en metros (inclusive) */
  maxWidthMeters:  number;
  /**
   * Etiqueta legible del rango para mostrar en UI.
   * `null` si se genera automáticamente desde min/max.
   * Ej.: "Hasta 1.80 m" | "1.80 m – 2.50 m"
   */
  groupLabel:      string | null;
  /** Lista de componentes que integran este grupo de reglas */
  components:      RuleComponent[];
}
