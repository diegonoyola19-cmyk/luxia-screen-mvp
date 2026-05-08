/**
 * generateRollerBOM.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Servicio data-driven para generación de BOM (Lista de Materiales) de
 * cortinas tipo Roller. Las reglas de fabricación se cargan desde
 * `src/data/roller-bom-rules.json`, desacoplando la lógica de la configuración.
 *
 * Uso:
 *   const bom = generateRollerBOM(1.35, 1.20, WHITE_LINEN_COLORS);
 *
 * @author Luxia MES — V3
 */

import rulesRaw from '../data/roller-bom-rules.json';

// ─── Tipos estrictos ──────────────────────────────────────────────────────────

/** Claves de color disponibles para cada componente variable */
export type ColorKey =
  | 'bottomrail'   // 1 char:  A / I / W / Z
  | 'cadena'       // 3 chars: 006 / 003 / 007 / 012
  | 'control'      // 2 chars: WH / IV / GR / BR
  | 'pesa'         // 2 chars: WH / IV / GY / BZ
  | 'tapaderas'    // 3 chars: 026 / 112 / 005 / 105
  | 'topes';       // 2 chars: GR / IV / WH / BZ

/**
 * Mapa de colores por componente que debe proveer el consumidor.
 * Cada valor es el chip de color exacto (respetando el largo del patrón X).
 *
 * @example
 * // Cortina color White
 * const WHITE: RollerColorMappings = {
 *   bottomrail: 'W',
 *   cadena:     '007',
 *   control:    'WH',
 *   pesa:       'WH',
 *   tapaderas:  '005',
 *   topes:      'WH',
 * };
 */
export type RollerColorMappings = Record<ColorKey, string>;

/** Tipos de cálculo definidos en el JSON de reglas */
type TipoCalculo = 'Descuento (mm)' | 'Cantidad fija' | 'Factor (alto)';

/** Estructura interna de cada componente en el JSON de reglas */
interface ComponenteRegla {
  componente_tipo: string;
  sku_base:        string;
  valor:           number;
  tipo_calculo:    TipoCalculo;
  unidad:          string;
  color_key:       ColorKey | null;
  reglas:          string;
}

/** Estructura de cada rango en el JSON de reglas */
interface RangoRegla {
  categoria:   string;
  rango_min_m: number;
  rango_max_m: number;
  componentes: ComponenteRegla[];
}

/** Ítem resultante del BOM generado */
export interface BOMItem {
  /** Nombre descriptivo del componente */
  componente:          string;
  /** SKU resuelto (con color ya sustituido) */
  skuFinal:            string;
  /** Cantidad o medida calculada (metros o unidades) */
  cantidadCalculada:   number;
  /** Unidad de medida: 'm' para lineales, 'EA' para piezas */
  unidad:              string;
  /** SKU base sin resolución (útil para debug/fallback) */
  skuBase:             string;
  /** Nota de la regla de ingeniería aplicada */
  regla:               string;
}

/** Resultado completo de la función */
export interface RollerBOMResult {
  items:        BOMItem[];
  rangoAplicado: string;  // Ej: "0.00m – 1.80m"
  ancho:        number;
  alto:         number;
}

// ─── Constante de validación ──────────────────────────────────────────────────
const MAX_ANCHO_M = 2.95;

// ─── Reglas cargadas (tipadas) ────────────────────────────────────────────────
const RULES: RangoRegla[] = rulesRaw as RangoRegla[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resuelve el SKU final reemplazando todas las secuencias de X's consecutivas
 * por el chip de color correspondiente al color_key del componente.
 *
 * La expresión regular X+ captura cualquier cantidad de X's contiguas.
 * Si el componente no tiene color_key, el sku_base se devuelve sin cambios.
 *
 * @param skuBase     SKU con placeholders (ej: "0-151-AL-CLX19")
 * @param colorKey    Slot de color (ej: "bottomrail")
 * @param colorMap    Mapa de colores del consumidor
 * @returns           SKU resuelto (ej: "0-151-AL-CLW19")
 */
function resolveSkuColor(
  skuBase:  string,
  colorKey: ColorKey | null,
  colorMap: RollerColorMappings
): string {
  if (!colorKey) return skuBase;

  const chip = colorMap[colorKey];
  if (!chip) {
    throw new Error(
      `[generateRollerBOM] colorMappings falta la clave "${colorKey}" ` +
      `para el SKU base "${skuBase}". Proporciona el chip de color correcto.`
    );
  }

  // Reemplaza la primera (y única) secuencia de X's consecutivas
  return skuBase.replace(/X+/, chip);
}

/**
 * Calcula la cantidad final según el tipo de cálculo definido en las reglas.
 *
 * @param tipo    Tipo de cálculo
 * @param valor   Valor numérico base de la regla
 * @param ancho   Ancho de la cortina en metros
 * @param alto    Alto de la cortina en metros
 * @returns       Cantidad calculada (metros o piezas, 3 decimales para lineales)
 */
function calcularCantidad(
  tipo:  TipoCalculo,
  valor: number,
  ancho: number,
  alto:  number
): number {
  switch (tipo) {
    case 'Descuento (mm)':
      // Corte lineal: ancho (en mm) - descuento, convertido de vuelta a metros
      return parseFloat(((ancho * 1000 - valor) / 1000).toFixed(3));

    case 'Cantidad fija':
      // Siempre la cantidad exacta de la regla
      return valor;

    case 'Factor (alto)':
      // Largo de cadena: alto × factor, en metros
      return parseFloat((alto * valor).toFixed(3));

    default: {
      // Exhaustive check en TypeScript
      const _exhaustive: never = tipo;
      throw new Error(`[generateRollerBOM] tipo_calculo desconocido: ${_exhaustive}`);
    }
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera la Lista de Materiales (BOM) completa para una cortina tipo Roller.
 *
 * @param ancho         Ancho de la cortina en metros (ej: 1.35)
 * @param alto          Alto de la cortina en metros  (ej: 1.20)
 * @param colorMappings Mapa de chips de color por componente
 * @returns             BOMResult con items resueltos y metadata del rango
 *
 * @throws Error si el ancho supera el máximo soportado (2.95m)
 * @throws Error si no se encuentra rango aplicable para el ancho dado
 * @throws Error si falta un color_key en el colorMappings provisto
 *
 * @example
 * const bom = generateRollerBOM(1.35, 1.20, {
 *   bottomrail: 'W',
 *   cadena:     '007',
 *   control:    'WH',
 *   pesa:       'WH',
 *   tapaderas:  '005',
 *   topes:      'WH',
 * });
 */
export function generateRollerBOM(
  ancho:         number,
  alto:          number,
  colorMappings: RollerColorMappings
): RollerBOMResult {

  // ── Validación de rango máximo ─────────────────────────────────────────────
  if (ancho > MAX_ANCHO_M) {
    throw new Error(
      `[generateRollerBOM] Ancho ${ancho.toFixed(3)}m supera el máximo ` +
      `soportado de ${MAX_ANCHO_M}m. La cortina no puede fabricarse con ` +
      `los rangos definidos actualmente.`
    );
  }

  if (ancho <= 0 || alto <= 0) {
    throw new Error(
      `[generateRollerBOM] Dimensiones inválidas: ancho=${ancho}m, alto=${alto}m. ` +
      `Ambos valores deben ser mayores que 0.`
    );
  }

  // ── Búsqueda del rango aplicable ───────────────────────────────────────────
  const rango = RULES.find(
    (r) => ancho >= r.rango_min_m && ancho <= r.rango_max_m
  );

  if (!rango) {
    throw new Error(
      `[generateRollerBOM] No se encontró rango de configuración para ` +
      `ancho=${ancho.toFixed(3)}m. Verifica roller-bom-rules.json.`
    );
  }

  // ── Generación del BOM ─────────────────────────────────────────────────────
  const items: BOMItem[] = rango.componentes.map((comp): BOMItem => {
    const skuFinal         = resolveSkuColor(comp.sku_base, comp.color_key, colorMappings);
    const cantidadCalculada = calcularCantidad(comp.tipo_calculo, comp.valor, ancho, alto);

    return {
      componente:        comp.componente_tipo,
      skuFinal,
      cantidadCalculada,
      unidad:            comp.unidad,
      skuBase:           comp.sku_base,
      regla:             comp.reglas,
    };
  });

  return {
    items,
    rangoAplicado: `${rango.rango_min_m.toFixed(2)}m – ${rango.rango_max_m.toFixed(2)}m`,
    ancho,
    alto,
  };
}

// ─── Mapas de colores predefinidos (helpers para el consumidor) ───────────────

/** Chips de color para herrajes White */
export const COLOR_WHITE: RollerColorMappings = {
  bottomrail: 'W',
  cadena:     '007',
  control:    'WH',
  pesa:       'WH',
  tapaderas:  '005',
  topes:      'WH',
};

/** Chips de color para herrajes Ivory */
export const COLOR_IVORY: RollerColorMappings = {
  bottomrail: 'I',
  cadena:     '003',
  control:    'IV',
  pesa:       'IV',
  tapaderas:  '112',
  topes:      'IV',
};

/** Chips de color para herrajes Grey / Satin Anodized */
export const COLOR_GREY: RollerColorMappings = {
  bottomrail: 'A',
  cadena:     '006',
  control:    'GR',
  pesa:       'GY',
  tapaderas:  '026',
  topes:      'GR',
};

/** Chips de color para herrajes Bronze */
export const COLOR_BRONZE: RollerColorMappings = {
  bottomrail: 'Z',
  cadena:     '012',
  control:    'BR',
  pesa:       'BZ',
  tapaderas:  '105',
  topes:      'BZ',
};

/** Mapa de tone (UI) → RollerColorMappings para integración con el store */
export const TONE_COLOR_MAP: Record<string, RollerColorMappings> = {
  white:  COLOR_WHITE,
  ivory:  COLOR_IVORY,
  grey:   COLOR_GREY,
  bronze: COLOR_BRONZE,
};
