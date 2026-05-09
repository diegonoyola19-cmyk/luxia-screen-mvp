/**
 * generateRollerBOM.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor data-driven para generación de BOM (Lista de Materiales) de cortinas
 * tipo Roller. Las reglas se cargan desde `roller-bom-rules.json`.
 *
 * Schema del JSON:
 *   - category        : nombre del sistema de montaje
 *   - minWidthMeters  : límite inferior del rango de ancho
 *   - maxWidthMeters  : límite superior del rango de ancho
 *   - components[]    : lista de componentes con colorVariants por tono
 *
 * Uso:
 *   const bom = generateRollerBOM(1.35, 1.20, 'bronze', 'standard');
 *
 * @author Luxia MES — V3.1
 */

import rulesRaw from '../data/roller-bom-rules.json';
import type { MountingSystem } from '../domain/curtains/types';

// ─── Tipos del schema ─────────────────────────────────────────────────────────

export type Tone = 'grey' | 'ivory' | 'white' | 'bronze';

interface ColorVariants {
  grey:   string | null;
  ivory:  string | null;
  white:  string | null;
  bronze: string | null;
}

interface RuleComponent {
  componentType:    string;
  suggestedSku:     string;
  value:            number;
  calculationType:  string;
  additionalRules:  string | null;
  hasColorVariants: boolean;
  colorVariants:    ColorVariants;
}

interface RuleGroup {
  category:        string;
  minWidthMeters:  number;
  maxWidthMeters:  number;
  groupLabel:      string | null;
  components:      RuleComponent[];
}

// ─── Tipos de salida ──────────────────────────────────────────────────────────

/** Ítem resuelto del BOM generado */
export interface BOMItem {
  /** Nombre descriptivo del componente */
  componente:          string;
  /** SKU final resuelto (con color aplicado) */
  skuFinal:            string;
  /** Cantidad o medida calculada */
  cantidadCalculada:   number;
  /** Unidad: 'm' para lineales, 'EA' para piezas */
  unidad:              string;
  /** SKU base sin resolver (para debug) */
  skuBase:             string;
  /** Nota de la regla de ingeniería */
  regla:               string;
}

/** Resultado completo de la función */
export interface RollerBOMResult {
  items:         BOMItem[];
  rangoAplicado: string;
  ancho:         number;
  alto:          number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_ANCHO_M = 3.6;

const RULES: RuleGroup[] = rulesRaw as RuleGroup[];

/** Mapa de MountingSystem → category en el JSON */
const CATEGORIA_MAP: Record<MountingSystem, string> = {
  standard:       'Roller',
  pin_endplug:    'Roller con End Plug de Pin',
  double_bracket: 'Roller en bracket doble',
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Resuelve el SKU final para un componente dado el tono seleccionado.
 * Si el componente tiene variantes de color, usa colorVariants[tone].
 * Si no, usa el suggestedSku directamente.
 */
function resolveSkuColor(comp: RuleComponent, tone: Tone): string {
  if (!comp.hasColorVariants) return comp.suggestedSku;
  const resolved = comp.colorVariants[tone];
  if (!resolved) {
    // Fallback: intentar white, luego el suggestedSku
    return comp.colorVariants.white ?? comp.suggestedSku;
  }
  return resolved;
}

/**
 * Calcula la cantidad según el tipo de cálculo.
 */
function calcularCantidad(
  tipo:  string,
  valor: number,
  ancho: number,
  alto:  number
): number {
  switch (tipo) {
    case 'Descuento (mm)':
      return parseFloat(((ancho * 1000 - valor) / 1000).toFixed(3));
    case 'Cantidad fija':
      return valor;
    case 'Factor (alto)':
      return parseFloat((alto * valor).toFixed(3));
    default:
      return valor;
  }
}

/**
 * Determina la unidad de medida del componente.
 * Usa 'm' para cálculos lineales, 'EA' para piezas.
 */
function resolveUnidad(tipo: string, valor: number): string {
  if (tipo === 'Descuento (mm)' || tipo === 'Factor (alto)') return 'm';
  // Cantidad fija con valor grande (tubos, etc.) también en metros
  if (tipo === 'Cantidad fija' && valor >= 20) return 'm';
  return 'EA';
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera la Lista de Materiales (BOM) completa para una cortina tipo Roller.
 *
 * @param ancho           Ancho terminado en metros (ej: 1.35)
 * @param alto            Alto terminado en metros  (ej: 1.20)
 * @param tone            Tono de herrajes: 'white' | 'ivory' | 'grey' | 'bronze'
 * @param mountingSystem  Sistema de montaje (default: 'standard')
 * @returns               BOMResult con items resueltos y metadata del rango
 *
 * @throws Error si el ancho supera el máximo soportado
 * @throws Error si no se encuentra rango aplicable
 */
export function generateRollerBOM(
  ancho:          number,
  alto:           number,
  tone:           Tone = 'white',
  mountingSystem: MountingSystem = 'standard'
): RollerBOMResult {

  // ── Validaciones ───────────────────────────────────────────────────────────
  if (ancho > MAX_ANCHO_M) {
    throw new Error(
      `[generateRollerBOM] Ancho ${ancho.toFixed(3)}m supera el máximo ` +
      `soportado de ${MAX_ANCHO_M}m.`
    );
  }
  if (ancho <= 0 || alto <= 0) {
    throw new Error(
      `[generateRollerBOM] Dimensiones inválidas: ancho=${ancho}m, alto=${alto}m.`
    );
  }

  // ── Filtrar por sistema de montaje ─────────────────────────────────────────
  const categoriaTarget = CATEGORIA_MAP[mountingSystem];
  const rulesForSystem  = RULES.filter((r) => r.category === categoriaTarget);

  // ── Buscar rango aplicable ─────────────────────────────────────────────────
  const rangos = rulesForSystem.filter(
    (r) => ancho >= r.minWidthMeters && ancho <= r.maxWidthMeters
  );

  if (rangos.length === 0) {
    throw new Error(
      `[generateRollerBOM] No se encontró rango para ancho=${ancho.toFixed(3)}m ` +
      `en sistema "${categoriaTarget}". Verifica roller-bom-rules.json.`
    );
  }

  // ── Generar BOM ────────────────────────────────────────────────────────────
  // Unificar componentes de todos los rangos aplicables (evita duplicados por componentType)
  const allComponents = new Map<string, RuleComponent>();
  for (const r of rangos) {
    for (const comp of r.components) {
      if (!allComponents.has(comp.componentType)) {
        allComponents.set(comp.componentType, comp);
      }
    }
  }

  const items: BOMItem[] = Array.from(allComponents.values()).map((comp): BOMItem => {
    const skuFinal         = resolveSkuColor(comp, tone);
    const cantidadCalculada = calcularCantidad(comp.calculationType, comp.value, ancho, alto);
    const unidad           = resolveUnidad(comp.calculationType, comp.value);

    return {
      componente:        comp.componentType,
      skuFinal,
      cantidadCalculada,
      unidad,
      skuBase:           comp.suggestedSku,
      regla:             comp.additionalRules ?? '',
    };
  });

  return {
    items,
    rangoAplicado: rangos.map(r => `${r.minWidthMeters.toFixed(2)}m – ${r.maxWidthMeters.toFixed(2)}m`).join(', '),
    ancho,
    alto,
  };
}

// ─── Exportaciones de compatibilidad ─────────────────────────────────────────
// Mantenidas para que los archivos que aún las importen no rompan en compilación.
// Se pueden eliminar cuando todos los callers estén migrados.

/** @deprecated — usar el parámetro `tone` directamente en generateRollerBOM */
export type RollerColorMappings = Record<string, string>;

/** @deprecated — pasar tone string directamente */
export const TONE_COLOR_MAP: Record<string, RollerColorMappings> = {
  white:  { bottomrail: 'W', cadena: '007', control: 'WH', pesa: 'WH', tapaderas: '005', topes: 'WH' },
  ivory:  { bottomrail: 'I', cadena: '003', control: 'IV', pesa: 'IV', tapaderas: '112', topes: 'IV' },
  grey:   { bottomrail: 'A', cadena: '006', control: 'GR', pesa: 'GY', tapaderas: '026', topes: 'GR' },
  bronze: { bottomrail: 'Z', cadena: '012', control: 'BR', pesa: 'BZ', tapaderas: '105', topes: 'BZ' },
};

/** @deprecated */
export const COLOR_WHITE:  RollerColorMappings = TONE_COLOR_MAP.white;
/** @deprecated */
export const COLOR_IVORY:  RollerColorMappings = TONE_COLOR_MAP.ivory;
/** @deprecated */
export const COLOR_GREY:   RollerColorMappings = TONE_COLOR_MAP.grey;
/** @deprecated */
export const COLOR_BRONZE: RollerColorMappings = TONE_COLOR_MAP.bronze;
