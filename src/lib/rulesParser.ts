/**
 * rulesParser.ts — Parser y Transformador del Motor de Reglas V3
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte la fuente de datos (JSON local o CSV futuro) en el modelo
 * canónico `RuleGroup[]` listo para ser cargado en Zustand y/o Supabase.
 *
 * Pipeline:
 *   1. Lee `roller-bom-rules.json` (o CSV via papaparse si se implementa)
 *   2. Clasifica `hasColorVariants` a partir del texto de `reglas`
 *   3. Construye `ColorVariants` con los SKUs reales por tono
 *   4. Mapea el `tipo_calculo` al enum `CalculationType`
 *   5. Agrupa componentes por (categoria, rango_min_m, rango_max_m) → RuleGroup[]
 *
 * ─── Punto de sincronización con Supabase ────────────────────────────────────
 * Después del paso 5, el array `RuleGroup[]` resultante está listo para:
 *   A) Cargarse directamente en Zustand (uso offline / desarrollo).
 *   B) Enviarse a Supabase en dos operaciones relacionales:
 *        supabase.from('rule_groups').upsert(groups.map(toGroupRow))
 *        supabase.from('rule_components').upsert(components.map(toComponentRow))
 *      Ver la función `syncRulesToSupabase` al final de este archivo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @author Luxia MES — V3
 */

import type {
  RuleGroup,
  RuleComponent,
  ColorVariants,
  CalculationType,
} from '../types/rules';

// ─── Importación del JSON local (fuente de verdad actual) ────────────────────
// Si en el futuro el CSV se sube desde el cliente, usar papaparse:
//   import Papa from 'papaparse';
//   const { data } = Papa.parse(csvString, { header: true, skipEmptyLines: true });
import rulesRaw from '../data/roller-bom-rules.json';

// ─── Tipos internos del JSON de origen ───────────────────────────────────────

type TipoCalculo = 'Descuento (mm)' | 'Cantidad fija' | 'Factor (alto)';
type ColorKey = 'bottomrail' | 'cadena' | 'control' | 'pesa' | 'tapaderas' | 'topes';

interface ComponenteRaw {
  componente_tipo: string;
  sku_base:        string;
  valor:           number;
  tipo_calculo:    TipoCalculo;
  unidad:          string;
  color_key:       ColorKey | null;
  reglas:          string;
}

interface RangoRaw {
  categoria:   string;
  rango_min_m: number;
  rango_max_m: number;
  componentes: ComponenteRaw[];
}

// ─── Mapas de SKUs reales por tono ───────────────────────────────────────────
// Estos mapas mapean el color_key del JSON de origen a los SKUs completos por tono.
// Son la fuente de resolución para construir ColorVariants.

const COLOR_MAP_POR_KEY: Record<ColorKey, Record<'grey' | 'ivory' | 'white' | 'bronze', string | null>> = {
  bottomrail: {
    grey:   '0-151-AL-CLA19',
    ivory:  '0-151-AL-CLI19',
    white:  '0-151-AL-CLW19',
    bronze: '0-151-AL-CLZ19',
  },
  cadena: {
    grey:   '0-151-CH-006H0',
    ivory:  '0-151-CH-003H0',
    white:  '0-151-CH-007H0',
    bronze: '0-151-CH-012H0',
  },
  control: {
    grey:   '0-154-CL-V20GR',
    ivory:  '0-154-CL-V20IV',
    white:  '0-154-CL-V20WH',
    bronze: '0-154-CL-V20BR',
  },
  pesa: {
    grey:   '0-151-CA-001GY',
    ivory:  '0-151-CA-001IV',
    white:  '0-151-CA-001WH',
    bronze: '0-151-CA-001BZ',
  },
  tapaderas: {
    grey:   '0-151-RE-02600',
    ivory:  '0-151-RE-11200',
    white:  '0-151-RE-00500',
    bronze: '0-151-RE-10500',
  },
  topes: {
    grey:   '0-151-CA-100GR',
    ivory:  '0-151-CA-100IV',
    white:  '0-151-CA-100WH',
    bronze: '0-151-CA-100BZ',
  },
};

// ─── Helpers de transformación ────────────────────────────────────────────────

/**
 * Convierte el tipo de cálculo del JSON de origen al enum CalculationType.
 * Si se agrega un nuevo tipo en el futuro, se debe actualizar aquí.
 */
function mapCalculationType(tipo: TipoCalculo): CalculationType {
  const mapping: Record<TipoCalculo, CalculationType> = {
    'Descuento (mm)': 'DESCUENTO_MM',
    'Cantidad fija':  'CANTIDAD_FIJA',
    'Factor (alto)':  'FACTOR_ALTO',
  };
  return mapping[tipo];
}

/**
 * Determina si el componente tiene variantes de color basándose en el texto
 * de la regla de negocio. Si la regla contiene la frase "no existen otros
 * colores que no sea blanco", se marca como sin variantes de color.
 *
 * Esta heurística es equivalente a leer la columna "reglas" de un CSV.
 */
function hasColorVariantsFromRule(regla: string): boolean {
  const normalizado = regla.toLowerCase();
  if (normalizado.includes('no existen otros colores')) return false;
  if (normalizado.includes('no existe otro color'))     return false;
  return true;
}

/**
 * Construye el objeto ColorVariants para un componente dado.
 * - Si el componente tiene `color_key`, usa el mapa de SKUs.
 * - Si no tiene `color_key` o la regla indica único color, todos los valores son null.
 */
function buildColorVariants(
  colorKey:        ColorKey | null,
  hasVariants:     boolean,
  skuBase:         string,
): ColorVariants {
  if (!hasVariants || !colorKey) {
    // Componentes sin variantes: el SKU base aplica para blanco,
    // los demás colores no existen (null).
    return { grey: null, ivory: null, white: skuBase, bronze: null };
  }

  const skusPorTono = COLOR_MAP_POR_KEY[colorKey];
  return {
    grey:   skusPorTono.grey,
    ivory:  skusPorTono.ivory,
    white:  skusPorTono.white,
    bronze: skusPorTono.bronze,
  };
}

/**
 * Genera una etiqueta legible para el rango en metros.
 * Ej.: "0.00m – 1.80m" → "Hasta 1.80 m"
 */
function buildGroupLabel(minM: number, maxM: number): string {
  if (minM === 0) return `Hasta ${maxM.toFixed(2)} m`;
  return `${minM.toFixed(2)} m – ${maxM.toFixed(2)} m`;
}

// ─── Función principal de parsing ─────────────────────────────────────────────

/**
 * Transforma el array de reglas crudas (JSON o CSV parseado) en el modelo
 * canónico `RuleGroup[]`.
 *
 * ─── PUNTO DE SINCRONIZACIÓN SUPABASE (Paso 1) ───────────────────────────────
 * Después de llamar a `parseRuleGroups()`, el resultado puede enviarse a
 * Supabase con `syncRulesToSupabase(groups)`. Ver función al final del archivo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param rawData Array de rangos crudos provenientes del JSON o CSV.
 * @returns Array de RuleGroup listos para Zustand y Supabase.
 */
export function parseRuleGroups(rawData: RangoRaw[] = rulesRaw as RangoRaw[]): RuleGroup[] {
  return rawData.map((rango): RuleGroup => {
    const components: RuleComponent[] = rango.componentes.map(
      (comp): RuleComponent => {
        const hasVariants = hasColorVariantsFromRule(comp.reglas);

        return {
          // id y ruleGroupId se asignan cuando se persiste en Supabase
          componentType:    comp.componente_tipo,
          suggestedSku:     comp.sku_base,
          value:            comp.valor,
          calculationType:  mapCalculationType(comp.tipo_calculo),
          // Si la regla no aporta información extra, se deja null
          additionalRules:  comp.reglas.trim() || null,
          hasColorVariants: hasVariants,
          colorVariants:    buildColorVariants(comp.color_key, hasVariants, comp.sku_base),
        };
      }
    );

    return {
      // id se asigna cuando se persiste en Supabase
      category:       rango.categoria,
      minWidthMeters: rango.rango_min_m,
      maxWidthMeters: rango.rango_max_m,
      groupLabel:     buildGroupLabel(rango.rango_min_m, rango.rango_max_m),
      components,
    };
  });
}

// ─── Exportación del resultado pre-procesado ──────────────────────────────────

/**
 * Grupos de reglas listos para ser consumidos por el store Zustand.
 * Se genera una sola vez al importar el módulo (singleton en memoria).
 *
 * ─── PUNTO DE SINCRONIZACIÓN SUPABASE (Paso 2) ───────────────────────────────
 * Este objeto `PARSED_RULE_GROUPS` es el JSON final que debe enviarse a
 * Supabase durante la sincronización inicial o cuando se actualiza el CSV.
 * Ver `syncRulesToSupabase` a continuación.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PARSED_RULE_GROUPS: RuleGroup[] = parseRuleGroups();

// ─── Preparación para Supabase ────────────────────────────────────────────────

/**
 * Tipos de fila para las tablas de Supabase (snake_case, según convención SQL).
 * Usar estos tipos al llamar a supabase.from('rule_groups').upsert(...)
 */
export interface SupabaseRuleGroupRow {
  id?:               string;
  category:          string;
  min_width_meters:  number;
  max_width_meters:  number;
  group_label:       string | null;
}

export interface SupabaseRuleComponentRow {
  id?:               string;
  rule_group_id:     string;
  component_type:    string;
  suggested_sku:     string;
  value:             number;
  calculation_type:  CalculationType;
  additional_rules:  string | null;
  has_color_variants:boolean;
  color_variants:    ColorVariants;
}

/**
 * Convierte un RuleGroup al formato de fila de Supabase `rule_groups`.
 */
export function toSupabaseGroupRow(group: RuleGroup): SupabaseRuleGroupRow {
  return {
    ...(group.id ? { id: group.id } : {}),
    category:         group.category,
    min_width_meters: group.minWidthMeters,
    max_width_meters: group.maxWidthMeters,
    group_label:      group.groupLabel,
  };
}

/**
 * Convierte un RuleComponent al formato de fila de Supabase `rule_components`.
 * Requiere que `groupId` sea el UUID ya asignado por Supabase al grupo padre.
 */
export function toSupabaseComponentRow(
  comp:    RuleComponent,
  groupId: string,
): SupabaseRuleComponentRow {
  return {
    ...(comp.id ? { id: comp.id } : {}),
    rule_group_id:      groupId,
    component_type:     comp.componentType,
    suggested_sku:      comp.suggestedSku,
    value:              comp.value,
    calculation_type:   comp.calculationType,
    additional_rules:   comp.additionalRules,
    has_color_variants: comp.hasColorVariants,
    color_variants:     comp.colorVariants,
  };
}

/**
 * Sincroniza los grupos de reglas con Supabase.
 *
 * ─── FLUJO DE SINCRONIZACIÓN SUPABASE ────────────────────────────────────────
 * Este es el punto de entrada recomendado para enviar los datos a la nube.
 * Debe llamarse:
 *   1. En la carga inicial de la app (si la BD está vacía).
 *   2. Cuando el administrador sube un nuevo CSV desde la UI.
 *   3. Durante un proceso de migración de datos (script Node.js).
 *
 * Prerrequisito: el cliente Supabase debe estar configurado en
 *   `src/lib/supabaseClient.ts` con las credenciales correctas.
 *
 * Tablas requeridas en Supabase:
 *   CREATE TABLE rule_groups (
 *     id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     category         TEXT NOT NULL,
 *     min_width_meters NUMERIC NOT NULL,
 *     max_width_meters NUMERIC NOT NULL,
 *     group_label      TEXT,
 *     created_at       TIMESTAMPTZ DEFAULT now(),
 *     updated_at       TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   CREATE TABLE rule_components (
 *     id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     rule_group_id      UUID NOT NULL REFERENCES rule_groups(id) ON DELETE CASCADE,
 *     component_type     TEXT NOT NULL,
 *     suggested_sku      TEXT NOT NULL,
 *     value              NUMERIC NOT NULL,
 *     calculation_type   TEXT NOT NULL CHECK (calculation_type IN ('DESCUENTO_MM','CANTIDAD_FIJA','FACTOR_ALTO')),
 *     additional_rules   TEXT,
 *     has_color_variants BOOLEAN NOT NULL DEFAULT false,
 *     color_variants     JSONB NOT NULL DEFAULT '{}',
 *     created_at         TIMESTAMPTZ DEFAULT now()
 *   );
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param groups Array de RuleGroup a sincronizar (resultado de parseRuleGroups).
 * @param supabase Cliente de Supabase (importar de src/lib/supabaseClient.ts).
 *
 * @example
 * import { createClient } from '@supabase/supabase-js';
 * import { PARSED_RULE_GROUPS, syncRulesToSupabase } from './rulesParser';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 * await syncRulesToSupabase(PARSED_RULE_GROUPS, supabase);
 */
export async function syncRulesToSupabase(
  groups:   RuleGroup[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<void> {
  // ── PASO A: Insertar/actualizar grupos ────────────────────────────────────
  // PUNTO DE SINCRONIZACIÓN: aquí se upsert de rule_groups.
  const groupRows = groups.map(toSupabaseGroupRow);
  const { data: insertedGroups, error: groupError } = await supabase
    .from('rule_groups')
    .upsert(groupRows, { onConflict: 'category,min_width_meters,max_width_meters' })
    .select();

  if (groupError) {
    console.error('[syncRulesToSupabase] Error al insertar rule_groups:', groupError);
    throw groupError;
  }

  // ── PASO B: Insertar componentes vinculados a cada grupo ──────────────────
  // PUNTO DE SINCRONIZACIÓN: aquí se upsert de rule_components.
  // Los IDs de los grupos deben haberse obtenido del paso anterior.
  const componentRows: SupabaseRuleComponentRow[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group    = groups[i];
    const dbGroup  = insertedGroups?.[i];
    const groupId  = dbGroup?.id ?? group.id;

    if (!groupId) {
      console.warn('[syncRulesToSupabase] Grupo sin ID:', group.category, group.minWidthMeters);
      continue;
    }

    for (const comp of group.components) {
      componentRows.push(toSupabaseComponentRow(comp, groupId));
    }
  }

  const { error: compError } = await supabase
    .from('rule_components')
    .upsert(componentRows, { onConflict: 'rule_group_id,component_type' });

  if (compError) {
    console.error('[syncRulesToSupabase] Error al insertar rule_components:', compError);
    throw compError;
  }

  console.info(
    `[syncRulesToSupabase] ✅ Sincronizados ${groups.length} grupos y ` +
    `${componentRows.length} componentes a Supabase.`
  );
}
