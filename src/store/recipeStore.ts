/**
 * recipeStore.ts — Store Zustand del Motor de Reglas de Producción V3
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestiona el estado de los grupos de reglas en memoria.
 * Provee:
 *   - `ruleGroups`          : estado global de reglas cargadas
 *   - `isLoading`           : indicador de carga asíncrona
 *   - `error`               : mensaje de error si la carga falla
 *   - `loadRules(groups)`   : acción para cargar reglas desde el parser
 *   - `loadRulesFromSource` : acción async que parsea y carga el JSON local
 *   - `getRulesForDimensions`: selector para consultar el grupo aplicable
 *   - `clearRules`          : limpia el estado (útil para tests / reset)
 *
 * Uso recomendado:
 *   const { ruleGroups, loadRulesFromSource } = useRecipeStore();
 *   useEffect(() => { loadRulesFromSource(); }, []);
 *
 * @author Luxia MES — V3
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { RuleGroup } from '../types/rules';
import { parseRuleGroups } from '../lib/rulesParser';

// ─── Tipos del store ──────────────────────────────────────────────────────────

interface RecipeState {
  /** Grupos de reglas cargados en memoria. */
  ruleGroups: RuleGroup[];
  /** True mientras se cargan las reglas de forma asíncrona. */
  isLoading:  boolean;
  /** Mensaje de error si la última carga falló. null si no hay error. */
  error:      string | null;
}

interface RecipeActions {
  /**
   * Carga un array de RuleGroup ya procesado directamente en el store.
   * Útil cuando el parser ya se ejecutó externamente o se recibe de Supabase.
   *
   * ─── PUNTO DE USO CON SUPABASE ────────────────────────────────────────────
   * Llamar `loadRules(groups)` después de hacer fetch de Supabase:
   *   const { data } = await supabase.from('rule_groups')
   *     .select('*, rule_components(*)');
   *   loadRules(mapSupabaseRowsToRuleGroups(data));
   * ──────────────────────────────────────────────────────────────────────────
   */
  loadRules: (groups: RuleGroup[]) => void;

  /**
   * Carga y parsea las reglas desde la fuente de datos local (roller-bom-rules.json).
   * Es la acción de arranque recomendada para ProduccionV3.
   */
  loadRulesFromSource: () => Promise<void>;

  /**
   * Limpia el estado de reglas. Útil para forzar recarga o en pruebas.
   */
  clearRules: () => void;
}

interface RecipeSelectors {
  /**
   * Selector: devuelve el RuleGroup cuyo rango de ancho contiene el `width`
   * dado para la `category` especificada.
   *
   * Uso en UI:
   *   const group = useRecipeStore(s => s.getRulesForDimensions('Roller', 1.35));
   *   // group.components tiene todos los componentes con sus SKUs y cantidades
   *
   * @param category  Categoría del producto (ej. "Roller")
   * @param width     Ancho terminado en metros (ej. 1.35)
   * @returns         El RuleGroup aplicable, o `undefined` si ninguno encaja.
   */
  getRulesForDimensions: (category: string, width: number) => RuleGroup | undefined;
}

export type RecipeStore = RecipeState & RecipeActions & RecipeSelectors;

// ─── Estado inicial ───────────────────────────────────────────────────────────

const initialState: RecipeState = {
  ruleGroups: [],
  isLoading:  false,
  error:      null,
};

// ─── Creación del store ───────────────────────────────────────────────────────

/**
 * Store Zustand para el motor de reglas de producción.
 *
 * No utiliza `persist` porque las reglas provienen de una fuente externa
 * (JSON local o Supabase) y deben refrescarse en cada sesión para garantizar
 * que los cambios de configuración se reflejen sin limpiar localStorage.
 *
 * Si se desea persistencia offline, agregar `persist` con `partialize`
 * para guardar solo `ruleGroups` y usar `version` para invalidar el caché.
 */
export const useRecipeStore = create<RecipeStore>()(
  devtools(
    (set, get) => ({
      // ── Estado inicial ──────────────────────────────────────────────────
      ...initialState,

      // ── Acciones ────────────────────────────────────────────────────────

      loadRules: (groups: RuleGroup[]) => {
        set(
          { ruleGroups: groups, isLoading: false, error: null },
          false,
          'recipeStore/loadRules'
        );
      },

      loadRulesFromSource: async () => {
        set({ isLoading: true, error: null }, false, 'recipeStore/loadRulesFromSource:start');

        try {
          // Parseamos de forma asíncrona para no bloquear el hilo principal
          // En un entorno Next.js/Node, aquí se podría leer el CSV con fs/csv-parser.
          const groups = await Promise.resolve(parseRuleGroups());

          // ── PUNTO DE SINCRONIZACIÓN SUPABASE ──────────────────────────────
          // Después de `parseRuleGroups()`, si se desea sincronizar con Supabase,
          // descomentar el siguiente bloque:
          //
          // import { syncRulesToSupabase } from '../lib/rulesParser';
          // import { supabase } from '../lib/supabaseClient';
          // await syncRulesToSupabase(groups, supabase);
          //
          // O si se prefiere cargar desde Supabase en lugar del JSON local:
          // const { data } = await supabase
          //   .from('rule_groups')
          //   .select('*, rule_components(*)')
          //   .order('min_width_meters');
          // const groups = mapSupabaseRowsToRuleGroups(data);
          // ──────────────────────────────────────────────────────────────────

          set(
            { ruleGroups: groups, isLoading: false, error: null },
            false,
            'recipeStore/loadRulesFromSource:success'
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido al cargar reglas';
          console.error('[useRecipeStore] Error cargando reglas:', err);
          set(
            { isLoading: false, error: message },
            false,
            'recipeStore/loadRulesFromSource:error'
          );
        }
      },

      clearRules: () => {
        set(initialState, false, 'recipeStore/clearRules');
      },

      // ── Selectores ──────────────────────────────────────────────────────

      getRulesForDimensions: (category: string, width: number): RuleGroup | undefined => {
        const { ruleGroups } = get();

        return ruleGroups.find(
          (group) =>
            group.category.toLowerCase() === category.toLowerCase() &&
            width >= group.minWidthMeters &&
            width <= group.maxWidthMeters
        );
      },
    }),
    { name: 'RecipeStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// ─── Helper: mapear filas de Supabase al modelo en memoria ───────────────────

/**
 * Convierte las filas retornadas por Supabase (con JOIN de rule_components)
 * al modelo `RuleGroup[]` del store.
 *
 * ─── PUNTO DE USO CON SUPABASE ────────────────────────────────────────────────
 * Usar este helper cuando se carguen las reglas desde Supabase:
 *
 *   const { data } = await supabase
 *     .from('rule_groups')
 *     .select('*, rule_components(*)')
 *     .order('min_width_meters');
 *
 *   const groups = mapSupabaseRowsToRuleGroups(data ?? []);
 *   loadRules(groups);
 * ─────────────────────────────────────────────────────────────────────────────
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSupabaseRowsToRuleGroups(rows: any[]): RuleGroup[] {
  return rows.map((row) => ({
    id:             row.id,
    category:       row.category,
    minWidthMeters: row.min_width_meters,
    maxWidthMeters: row.max_width_meters,
    groupLabel:     row.group_label ?? null,
    components: (row.rule_components ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (comp: any) => ({
        id:               comp.id,
        ruleGroupId:      comp.rule_group_id,
        componentType:    comp.component_type,
        suggestedSku:     comp.suggested_sku,
        value:            comp.value,
        calculationType:  comp.calculation_type,
        additionalRules:  comp.additional_rules ?? null,
        hasColorVariants: comp.has_color_variants,
        colorVariants:    comp.color_variants,
      })
    ),
  }));
}
