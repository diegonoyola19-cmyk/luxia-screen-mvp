/**
 * generateRollerBOM.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adapter de compatibilidad canónico hacia el motor oficial de BOM V2
 * (`roller-bom-rules-v2.json` y `resolveGroupBom`).
 *
 * @author Luxia MES — V3.2 (Single Source of Truth)
 */

import rollerBomRulesConfigV2 from '../data/roller-bom-rules-v2.json';
import { resolveGroupBom } from './doubleBracketBom';
import type { CurtainOrderLine } from '../domain/curtains/roller-bom-rules.types';
import type { MountingSystem } from '../domain/curtains/types';

export type Tone = 'grey' | 'ivory' | 'white' | 'bronze';

/** Ítem resuelto del BOM generado */
export interface BOMItem {
  componente: string;
  skuFinal: string;
  cantidadCalculada: number;
  unidad: string;
  skuBase: string;
  regla: string;
}

/** Resultado completo de la función */
export interface RollerBOMResult {
  items: BOMItem[];
  rangoAplicado: string;
  ancho: number;
  alto: number;
}

const MAX_ANCHO_M = 3.6;

const CATEGORIA_MAP: Record<MountingSystem, string> = {
  standard: 'Roller',
  pin_endplug: 'Roller Pin EndPlug',
  double_bracket: 'Roller Bracket Doble',
};

/**
 * Genera la Lista de Materiales (BOM) completa para una cortina tipo Roller
 * delegando directamente al motor oficial V2 (`resolveGroupBom`).
 */
export function generateRollerBOM(
  ancho: number,
  alto: number,
  tone: Tone = 'white',
  mountingSystem: MountingSystem = 'standard'
): RollerBOMResult {
  if (ancho > MAX_ANCHO_M) {
    throw new Error(
      `[generateRollerBOM] Ancho ${ancho.toFixed(3)}m supera el máximo soportado de ${MAX_ANCHO_M}m.`
    );
  }
  if (ancho <= 0 || alto <= 0) {
    throw new Error(
      `[generateRollerBOM] Dimensiones inválidas: ancho=${ancho}m, alto=${alto}m.`
    );
  }

  const category = CATEGORIA_MAP[mountingSystem] || 'Roller';
  const isDouble = mountingSystem === 'double_bracket';

  const orderLine: CurtainOrderLine = {
    orderLineId: 'single-line',
    category,
    mountingType: isDouble ? 'doubleBracket' : 'singleBracket',
    curtains: isDouble
      ? [
          { curtainId: 'c1', widthM: ancho, heightM: alto, tone },
          { curtainId: 'c2', widthM: ancho, heightM: alto, tone },
        ]
      : [
          { curtainId: 'c1', widthM: ancho, heightM: alto, tone },
        ],
  };

  const res = resolveGroupBom(orderLine, rollerBomRulesConfigV2 as any, {
    throwOnError: true,
    riskAcceptedByCustomer: true,
  });

  const items: BOMItem[] = res.lines.map((line) => ({
    componente: line.componentType,
    skuFinal: line.resolvedSku,
    cantidadCalculada: line.quantity,
    unidad: line.unit,
    skuBase: line.resolvedSku,
    regla: line.notes || '',
  }));

  return {
    items,
    rangoAplicado: `${ancho}m`,
    ancho,
    alto,
  };
}

// ─── Exportaciones de compatibilidad ─────────────────────────────────────────
export type RollerColorMappings = Record<string, string>;

export const TONE_COLOR_MAP: Record<string, RollerColorMappings> = {
  white: { bottomrail: 'W', cadena: '007', control: 'WH', pesa: 'WH', tapaderas: '005', topes: 'WH' },
  ivory: { bottomrail: 'I', cadena: '003', control: 'IV', pesa: 'IV', tapaderas: '112', topes: 'IV' },
  grey: { bottomrail: 'A', cadena: '006', control: 'GR', pesa: 'GY', tapaderas: '026', topes: 'GR' },
  bronze: { bottomrail: 'Z', cadena: '012', control: 'BR', pesa: 'BZ', tapaderas: '105', topes: 'BZ' },
};

export const COLOR_WHITE: RollerColorMappings = TONE_COLOR_MAP.white;
export const COLOR_IVORY: RollerColorMappings = TONE_COLOR_MAP.ivory;
export const COLOR_GREY: RollerColorMappings = TONE_COLOR_MAP.grey;
export const COLOR_BRONZE: RollerColorMappings = TONE_COLOR_MAP.bronze;
