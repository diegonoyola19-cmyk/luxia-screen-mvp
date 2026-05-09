/**
 * rollerEngineV3.ts — Motor Completo: Herrajes + Telas
 *
 * Fuentes de Verdad:
 *   - src/data/roller-bom-rules.json → Reglas de fabricación por rango (data-driven)
 *   - src/data/v3-catalog.json       → SKUs con costo y stock (enriquecimiento)
 *   - src/data/v3-fabrics.json       → Telas Rollux con CROSSW, MostRecentCost y QtyOH
 *
 * Arquitectura:
 *   generateRollerBOM  →  SKU resuelto + cantidad calculada  (reglas JSON)
 *   rollerEngineV3     →  Enriquece con costo/stock del catálogo
 */
import catalogRaw from '../data/v3-catalog.json';
import fabricsRaw from '../data/v3-fabrics.json';
import { generateRollerBOM, TONE_COLOR_MAP } from './generateRollerBOM';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type Tone = 'white' | 'ivory' | 'grey' | 'bronze';
export type StockStatus = 'ok' | 'alt' | 'out';

export interface RecipeLine {
  role:      string;
  sku:       string;
  desc:      string;
  cost:      number;   // MostRecentCost
  qty:       number;
  unit:      string;
  totalCost: number;
  qtyOH:     number;   // -1 = no aplica (corte de tela)
  status:    StockStatus;
  altNote?:  string;
}

export interface FabricItem {
  sku:        string;
  desc:       string;
  subfamily:  string;
  color:      string;
  unit:       string;
  crossW:     number;  // Ancho del rollo (metros)
  rollLength: number;  // Largo del rollo (metros)
  cost:       number;  // MostRecentCost por SQYD
  qtyOH:      number;
  qtyTotal:   number;
}

export interface FabricCut {
  fabric:          FabricItem;
  cutWidth:        number;   // widthM + 0.02 (margen técnico 2cm)
  cutHeight:       number;   // heightM + 0.15 (enrolle) + 0.05 (bolsillo)
  cutAreaSqYd:     number;   // m² → SQYD
  wasteWidth:      number;   // CROSSW - cutWidth
  wasteAreaSqYd:   number;   // área desperdiciada en SQYD
  fabricCost:      number;   // costo total del corte
  feasible:        boolean;  // cutWidth <= CROSSW
  feasibleNote?:   string;
}

// ─── Catálogos indexados ───────────────────────────────────────────────────────
type HardwareItem = { sku: string; desc: string; cost: number; qtyOH: number; uom: string };
const HW_MAP: Record<string, HardwareItem> = {};
for (const item of catalogRaw as HardwareItem[]) {
  HW_MAP[item.sku.toLowerCase()] = item;
}

export const ALL_FABRICS: FabricItem[] = fabricsRaw as FabricItem[];
const FABRIC_MAP: Record<string, FabricItem> = {};
for (const f of ALL_FABRICS) { FABRIC_MAP[f.sku] = f; }

function hw(sku: string): HardwareItem | null { return HW_MAP[sku.toLowerCase()] ?? null; }
function hasStock(sku: string): boolean { return (hw(sku)?.qtyOH ?? 0) > 0; }
/** Devuelve la descripción completa del catálogo para un SKU, o null si no está en el catálogo. */
export function getHWDesc(sku: string): string | null { return hw(sku)?.desc ?? null; }

// ─── SKUs MAESTROS — Tabla validada del taller ────────────────────────────────

// Tubos
const TUBE_38       = '0-154-TU-38111';
const TUBE_45       = '0-154-TU-45211';
const TUBE_63       = '0-154-TU-63001';
const TUBE_45_ADAPT = '0-154-PA-00501';

// Soportes (fijos, solo blanco)
const BRACKET_CONTROL  = '0-154-PB-E04WH';  // Soporte lado del control
const BRACKET_ENDPLUG  = '0-154-PB-E03WH';  // Soporte lado del end plug
const END_PLUG         = '0-154-PE-00501';
const CHAPITA          = '0-154-PS-00500';

// Bottomrail por color — 0-151-AL-CLX19
const BOTTOMRAIL: Record<Tone, string> = {
  grey:   '0-151-AL-CLA19',  // Satin Anodized
  ivory:  '0-151-AL-CLI19',  // Ivory
  white:  '0-151-AL-CLW19',  // White
  bronze: '0-151-AL-CLZ19',  // Bronze
};

// Cadena por color — 0-151-CH-XXXH0
const CHAIN: Record<Tone, string> = {
  grey:   '0-151-CH-006H0',
  ivory:  '0-151-CH-003H0',
  white:  '0-151-CH-007H0',
  bronze: '0-151-CH-012H0',
};

// Control (Clutch) por color — 0-154-CL-V20XX
const CLUTCH: Record<Tone, string> = {
  white:  '0-154-CL-V20WH',
  ivory:  '0-154-CL-V20IV',
  grey:   '0-154-CL-V20GR',
  bronze: '0-154-CL-V20BR',
};

// Pesa de cadena por color — 0-151-CA-001XX
const PULLEY: Record<Tone, string> = {
  white:  '0-151-CA-001WH',
  ivory:  '0-151-CA-001IV',
  grey:   '0-151-CA-001GY',
  bronze: '0-151-CA-001BZ',
};

// Tapaderas de bottomrail por color — 0-151-RE-XXX00
const TAPADERAS: Record<Tone, string> = {
  grey:   '0-151-RE-02600',
  ivory:  '0-151-RE-11200',
  white:  '0-151-RE-00500',
  bronze: '0-151-RE-10500',
};

// Topes de cadena por color — 0-151-CA-100XX
const TOPES: Record<Tone, string> = {
  grey:   '0-151-CA-100GR',
  ivory:  '0-151-CA-100IV',
  white:  '0-151-CA-100WH',
  bronze: '0-151-CA-100BZ',
};

// Motor (motorizado)
const MOTOR_BRACKET = '0-154-PB-EO60W';
const CROWN_DRIVE   = '6-700-AD-45063';
const MOTOR_UNIT    = '6-800-MM-35U06';

// Orden de fallback por color
const COLOR_FALLBACK: Record<Tone, Tone[]> = {
  white:  ['ivory', 'grey'],
  ivory:  ['white', 'grey'],
  grey:   ['white', 'ivory'],
  bronze: ['grey', 'white'],
};

// Descuento lineal para tubo y bottomrail (mm → m)
const LINEAR_DISCOUNT_M = 0.030;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toLine(
  role: string, sku: string, qty: number, unit: string,
  status: StockStatus = 'ok', altNote?: string
): RecipeLine {
  const item = hw(sku);
  if (!item) {
    return {
      role, sku, desc: 'SKU no en catálogo', cost: 0, qty, unit,
      totalCost: 0, qtyOH: 0, status: 'out',
      altNote: altNote ?? 'No encontrado en export.xlsx',
    };
  }
  return {
    role, sku: item.sku, desc: item.desc, cost: item.cost, qty, unit,
    totalCost: item.cost * qty, qtyOH: item.qtyOH, status, altNote,
  };
}

function resolveWithFallback(map: Record<Tone, string>, tone: Tone) {
  const ideal = map[tone];
  if (hasStock(ideal)) return { sku: ideal, status: 'ok' as StockStatus };
  for (const alt of COLOR_FALLBACK[tone]) {
    const altSku = map[alt];
    if (altSku && hasStock(altSku))
      return { sku: altSku, status: 'alt' as StockStatus, altNote: `Sin stock ${tone} → usando ${alt}` };
  }
  return { sku: ideal, status: 'out' as StockStatus, altNote: 'Sin stock en ningún color disponible' };
}

function linearLine(role: string, sku: string, cutLengthM: number, status: StockStatus, altNote?: string): RecipeLine {
  const item = hw(sku);
  if (!item) {
    return {
      role, sku, desc: 'SKU no en catálogo', cost: 0,
      qty: parseFloat(cutLengthM.toFixed(3)), unit: 'm',
      totalCost: 0, qtyOH: 0, status: 'out', altNote: altNote ?? 'No encontrado',
    };
  }
  return {
    role, sku: item.sku, desc: item.desc, cost: item.cost,
    qty: parseFloat(cutLengthM.toFixed(3)), unit: 'm',
    totalCost: parseFloat((item.cost * cutLengthM).toFixed(4)),
    qtyOH: item.qtyOH, status, altNote,
  };
}

// ─── Motor de Herrajes ────────────────────────────────────────────────────────
/**
 * Genera el BOM de herrajes para una cortina Roller.
 * @param widthM   Ancho de la cortina en metros
 * @param heightM  Alto de la cortina en metros (necesario para Cadena)
 * @param tone     Tono de herrajes seleccionado
 * @param isMotorized  Si la cortina lleva motor
 */
export function resolveHardwareRecipe(
  widthM: number, heightM: number, tone: Tone, isMotorized: boolean
): RecipeLine[] {
  const lines: RecipeLine[] = [];
  const cutLength = widthM - LINEAR_DISCOUNT_M; // longitud de corte real (mm discount)

  // ── 1. TUBO ────────────────────────────────────────────────────────────────
  let tubeSku = TUBE_38;
  let tubeAlt: string | undefined;
  let tubeKey = 't38';

  if (widthM <= 1.80) {
    // Rango 0-1.80: siempre T38mm NEO
    if (!hasStock(TUBE_38)) {
      tubeSku = TUBE_45; tubeKey = 't45';
      tubeAlt = 'T38 sin stock → escalando a T45mm + adaptador';
    }
  } else if (widthM <= 2.20) {
    if (!hasStock(TUBE_38)) {
      tubeSku = TUBE_45; tubeKey = 't45';
      tubeAlt = 'T38 sin stock → escalando a T45mm + adaptador';
    }
  } else if (widthM <= 2.70) {
    tubeSku = TUBE_45; tubeKey = 't45';
    if (!hasStock(TUBE_45)) { tubeSku = TUBE_63; tubeKey = 't63'; tubeAlt = 'T45 sin stock → escalando a T63mm'; }
  } else {
    tubeSku = TUBE_63; tubeKey = 't63';
    if (!hasStock(TUBE_63)) { tubeSku = TUBE_45; tubeKey = 't45'; tubeAlt = 'T63 sin stock → usando T45mm'; }
  }

  lines.push(linearLine('Tubo de Enrolle 38mm NEO', tubeSku, cutLength,
    tubeAlt ? 'alt' : (hasStock(tubeSku) ? 'ok' : 'out'), tubeAlt));

  // Adaptador si se escala T38→T45
  if (tubeKey === 't45' && tubeAlt?.includes('adaptador')) {
    lines.push(toLine('Adaptador 45mm para VTX', TUBE_45_ADAPT, 1, 'EA',
      hasStock(TUBE_45_ADAPT) ? 'ok' : 'out'));
  }

  // ── 2. BOTTOMRAIL (color-dependiente, mismo descuento) ────────────────────
  const { sku: railSku, status: railStatus, altNote: railAlt } = resolveWithFallback(BOTTOMRAIL, tone);
  lines.push(linearLine('Bottomrail (contrapeso)', railSku, cutLength, railStatus, railAlt));

  // ── 3. SOPORTE LADO DEL CONTROL ──────────────────────────────────────────
  lines.push(toLine('Soporte lado del control', BRACKET_CONTROL, 1, 'EA',
    hasStock(BRACKET_CONTROL) ? 'ok' : 'out'));

  // ── 4. SOPORTE LADO DEL END PLUG ─────────────────────────────────────────
  lines.push(toLine('Soporte lado del end plug', BRACKET_ENDPLUG, 1, 'EA',
    hasStock(BRACKET_ENDPLUG) ? 'ok' : 'out'));

  // ── 5. END PLUG ───────────────────────────────────────────────────────────
  lines.push(toLine('End Plug', END_PLUG, 1, 'EA',
    hasStock(END_PLUG) ? 'ok' : 'out'));

  // ── 6. CHAPITA ────────────────────────────────────────────────────────────
  lines.push(toLine('Chapita', CHAPITA, 1, 'EA',
    hasStock(CHAPITA) ? 'ok' : 'out'));

  // ── 7. CADENA (Factor × Alto) ─────────────────────────────────────────────
  const chainLengthM = parseFloat((heightM * 2).toFixed(3));
  const { sku: chainSku, status: chainStatus, altNote: chainAlt } = resolveWithFallback(CHAIN, tone);
  lines.push(linearLine('Cadena de operación', chainSku, chainLengthM, chainStatus, chainAlt));

  // ── 8. MECANISMO (Manual vs Motorizado) ───────────────────────────────────
  if (isMotorized) {
    lines.push(toLine('Bracket Motor Block', MOTOR_BRACKET, 1, 'EA',
      hasStock(MOTOR_BRACKET) ? 'ok' : 'out'));
    lines.push(toLine('Corona / Drive Motor', CROWN_DRIVE, 1, 'EA',
      hasStock(CROWN_DRIVE) ? 'ok' : 'out'));
    lines.push(toLine('Motor Celtic Unidireccional', MOTOR_UNIT, 1, 'EA',
      hasStock(MOTOR_UNIT) ? 'ok' : 'out'));
  } else {
    const { sku: clutchSku, status: cs, altNote: ca } = resolveWithFallback(CLUTCH, tone);
    lines.push(toLine('Control de cortina (Clutch VTX 20)', clutchSku, 1, 'EA', cs, ca));
  }

  // ── 9. PESA DE CADENA ────────────────────────────────────────────────────
  const { sku: pulleySku, status: ps, altNote: pa } = resolveWithFallback(PULLEY, tone);
  lines.push(toLine('Pesa de cadena', pulleySku, 1, 'EA', ps, pa));

  // ── 10. TAPADERAS DE BOTTOMRAIL ──────────────────────────────────────────
  const { sku: tapSku, status: tapStatus, altNote: tapAlt } = resolveWithFallback(TAPADERAS, tone);
  lines.push(toLine('Tapaderas de bottomrail', tapSku, 2, 'EA', tapStatus, tapAlt));

  // ── 11. TOPES DE CADENA ──────────────────────────────────────────────────
  const { sku: topesSku, status: topesStatus, altNote: topesAlt } = resolveWithFallback(TOPES, tone);
  lines.push(toLine('Topes de cadena', topesSku, 2, 'EA', topesStatus, topesAlt));

  return lines;
}

// ─── Motor de Telas ───────────────────────────────────────────────────────────
const SQM_TO_SQYD = 1.19599;

export function calcFabricCut(fabric: FabricItem, widthM: number, heightM: number): FabricCut {
  const cutWidth  = widthM  + 0.02;          // +2cm margen técnico
  const cutHeight = heightM + 0.15 + 0.05;   // +15cm enrolle + 5cm bolsillo
  const cutAreaSqM    = cutWidth * cutHeight;
  const cutAreaSqYd   = cutAreaSqM * SQM_TO_SQYD;
  const wasteWidth    = fabric.crossW - cutWidth;
  const wasteAreaSqM  = Math.max(0, wasteWidth) * cutHeight;
  const wasteAreaSqYd = wasteAreaSqM * SQM_TO_SQYD;
  const feasible      = cutWidth <= fabric.crossW;
  const fabricCost    = cutAreaSqYd * fabric.cost;

  return {
    fabric, cutWidth, cutHeight, cutAreaSqYd,
    wasteWidth: Math.max(0, wasteWidth), wasteAreaSqYd,
    fabricCost, feasible,
    feasibleNote: !feasible
      ? `⛔ Ancho de corte (${cutWidth.toFixed(2)}m) supera el rollo (${fabric.crossW.toFixed(2)}m). Elige otro rollo.`
      : undefined,
  };
}

export function getFabricLine(cut: FabricCut): RecipeLine {
  return {
    role: 'Tela (corte)',
    sku:  cut.fabric.sku,
    desc: `${cut.fabric.desc} | Corte: ${cut.cutWidth.toFixed(2)}m × ${cut.cutHeight.toFixed(2)}m`,
    cost: cut.fabric.cost,
    qty:  parseFloat(cut.cutAreaSqYd.toFixed(2)),
    unit: 'SQYD',
    totalCost: parseFloat(cut.fabricCost.toFixed(2)),
    qtyOH: cut.fabric.qtyOH,
    status: !cut.feasible ? 'out' : cut.fabric.qtyOH > 0 ? 'ok' : 'out',
    altNote: cut.feasibleNote,
  };
}

// ─── Bridge: BOM data-driven + enriquecimiento de catálogo ───────────────────
/**
 * Función principal recomendada para ProduccionV3.
 *
 * Pipeline:
 *   1. generateRollerBOM  → SKU resuelto + cantidad (lee roller-bom-rules.json)
 *   2. HW_MAP lookup      → cost, qtyOH por cada SKU
 *   3. Retorna RecipeLine[] con stock status listo para el dashboard
 *
 * Si el SKU resuelto no está en catálogo, intenta el skuBase como fallback.
 * Componentes motorizados se anexan al final de la lista.
 */
export function resolveHardwareRecipeFromBOM(
  widthM:      number,
  heightM:     number,
  tone:        Tone,
  isMotorized: boolean
): RecipeLine[] {

  // 1. Generar BOM data-driven
  // 1. Generar BOM data-driven
  const { items } = generateRollerBOM(widthM, heightM, tone);

  // 2. Enriquecer con catálogo
  const lines: RecipeLine[] = items.map((item): RecipeLine => {
    // Intenta SKU resuelto primero, luego base como fallback
    const catalogItem = hw(item.skuFinal) ?? hw(item.skuBase);
    const cost        = catalogItem?.cost   ?? 0;
    const qtyOH       = catalogItem?.qtyOH  ?? 0;

    let status: StockStatus = 'ok';
    let altNote: string | undefined;

    if (!catalogItem) {
      status  = 'out';
      altNote = `SKU ${item.skuFinal} no encontrado en catálogo`;
    } else if (qtyOH <= 0) {
      status  = 'out';
    }

    return {
      role:      item.componente,
      sku:       catalogItem?.sku ?? item.skuFinal,
      desc:      catalogItem?.desc ?? 'SKU no en catálogo — verificar export.xlsx',
      cost,
      qty:       item.cantidadCalculada,
      unit:      item.unidad,
      totalCost: parseFloat((cost * item.cantidadCalculada).toFixed(4)),
      qtyOH:     catalogItem ? qtyOH : 0,
      status,
      altNote,
    };
  });

  // 3. Componentes de motor (si aplica) — no cubiertos por el JSON de reglas aún
  if (isMotorized) {
    const motorItems: [string, string][] = [
      ['Bracket Motor Block',           MOTOR_BRACKET],
      ['Corona / Drive Motor',          CROWN_DRIVE],
      ['Motor Celtic Unidireccional',   MOTOR_UNIT],
    ];
    for (const [role, sku] of motorItems) {
      const l = toLine(role, sku, 1, 'EA', hasStock(sku) ? 'ok' : 'out');
      lines.push(l);
    }
  }

  return lines;
}

// ─── Cálculo de totales ────────────────────────────────────────────────────────
export function calcTotalCost(lines: RecipeLine[]): number {
  return lines.reduce((s, l) => s + l.totalCost, 0);
}

export type { HardwareItem };
