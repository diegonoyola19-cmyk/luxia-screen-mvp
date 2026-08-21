import type { SavedOrder } from '../curtains/types';
import type { InventoryItem } from '../inventory/types';

export type InventoryAvailabilityStatus =
  | 'available'
  | 'insufficient_stock'
  | 'missing_sku'
  | 'sync_error'
  | 'unknown'
  | 'missing_material_lines'
  | 'incompatible_unit';

export interface InventoryAvailabilityResult {
  status: InventoryAvailabilityStatus;
  canProceed: boolean;
  reasons: string[];
  missingItems: { sku: string; description: string; required: number; unit: string }[];
  insufficientItems: {
    sku: string;
    description: string;
    required: number;
    available: number;
    unit: string;
    reason?: 'width_mismatch' | 'insufficient_stock' | 'incompatible_unit';
  }[];
  warnings: string[];
}

export interface InventoryValidationContext {
  inventoryItems?: InventoryItem[];
  isSyncError?: boolean;
  syncErrorMessage?: string;
}

interface RequiredMaterial {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  /** Si se requiere un ítem físico específico (retazos, piezas asignadas) */
  specificInventoryItemId?: string;
  /** Ancho de rollo requerido en metros (telas) */
  requiredWidthMeters?: number;
}

// ─── Tolerancias y constantes ────────────────────────────────────────────────

const WIDTH_TOLERANCE_M = 0.01;  // ±1 cm de tolerancia en ancho de rollo
const FLOAT_EPSILON    = 0.001;  // Para evitar errores de precisión flotante

// ─── Clasificación de tipos de ítem ────────────────────────────────────────
//
// FÍSICO-INDIVIDUAL: telas (Y2), lineales (FT/M), retazos.
//   La validación debe encontrar AL MENOS UN ítem individual con stock suficiente.
//   NO se permite sumar varios ítems distintos para cubrir el requerimiento.
//
// FUNGIBLE-AGREGADO: componentes EA (tornillos, topes, adaptadores, etc.)
//   La validación puede sumar el total disponible de todos los ítems del SKU.

type PhysicalItemType = 'fabric_roll' | 'linear_bar' | 'scrap';
type FungibleItemType = 'fungible_ea';
type ResolvedItemType = PhysicalItemType | FungibleItemType;

function resolveItemType(reqUnit: string, invKind?: string): ResolvedItemType {
  const unit = normalizeUnit(reqUnit);

  if (unit === 'YD2') return 'fabric_roll';

  if (unit === 'FT' || unit === 'M') {
    if (invKind === 'scrap' || invKind === 'offcut') return 'scrap';
    return 'linear_bar';
  }

  return 'fungible_ea';
}

// ─── Normalización de unidades ───────────────────────────────────────────────

function normalizeUnit(unit: string): string {
  if (!unit) return 'EA';
  const u = unit.toUpperCase().trim();
  if (u === 'UN' || u === 'PZ' || u === 'PIECE') return 'EA';
  if (u === 'MTR' || u === 'METERS' || u === 'METROS') return 'M';
  if (u === 'FEET' || u === 'PIES') return 'FT';
  if (u === 'Y2' || u === 'YD2' || u === 'YDS2') return 'YD2';
  return u;
}

function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (from === to) return quantity;

  if (from === 'M' && to === 'FT') return quantity * 3.28084;
  if (from === 'FT' && to === 'M') return quantity / 3.28084;

  // YD2 ↔ M2 aproximado (1 yd² = 0.8361 m²)
  if (from === 'M2' && to === 'YD2') return quantity * 1.19599;
  if (from === 'YD2' && to === 'M2') return quantity / 1.19599;

  return null; // Unidades incompatibles
}

// ─── Extracción de cantidad desde payload del inventario ────────────────────

interface ExtractedInventoryQty {
  qty: number;
  unit: string;
  availableYd2?: number;
  widthMeters?: number;
  lengthFeet?: number;
}

function extractInventoryQty(inv: InventoryItem): ExtractedInventoryQty | null {
  if (inv.status !== 'available') return null;
  if (!inv.code) return null;

  const p = inv.payload || (inv as any);

  // Prioridad 1: available_quantity explícito (fungibles: EA, tornillos, etc.)
  if (p.available_quantity !== undefined && p.unit) {
    const unit = normalizeUnit(p.unit);
    // Si tiene available_yd2 también, usamos eso para telas
    if (p.available_yd2 !== undefined && unit === 'YD2') {
      return {
        qty: p.available_yd2,
        unit: 'YD2',
        availableYd2: p.available_yd2,
        widthMeters: p.width_meters,
        lengthFeet: p.length_feet,
      };
    }
    return { qty: p.available_quantity, unit };
  }

  // Prioridad 2: available_yd2 directo (rollo de tela sin available_quantity)
  if (p.available_yd2 !== undefined) {
    return {
      qty: p.available_yd2,
      unit: 'YD2',
      availableYd2: p.available_yd2,
      widthMeters: p.width_meters,
      lengthFeet: p.length_feet,
    };
  }

  // Prioridad 3: area width×length (retazo o rollo de tela con ambas dimensiones)
  // Debe evaluarse ANTES de la interpretación lineal de length_meters,
  // porque un retazo de tela tiene tanto width_meters como length_meters.
  const widthM = p.width_meters ?? p.widthMeters ?? 0;
  const lengthMArea = p.length_meters ?? p.lengthMeters ?? 0;
  if (widthM > 0 && lengthMArea > 0) {
    const yd2 = widthM * lengthMArea * 1.19599;
    return {
      qty: yd2,
      unit: 'YD2',
      availableYd2: yd2,
      widthMeters: widthM,
    };
  }

  // Prioridad 4: length_feet (tubo/barra lineal)
  if (p.length_feet !== undefined) {
    return {
      qty: p.length_feet,
      unit: 'FT',
      lengthFeet: p.length_feet,
    };
  }

  // Prioridad 5: length_meters / remainingLengthM (barra/retazo lineal solo con largo)
  const lengthM = p.remainingLengthM ?? p.length_meters ?? p.lengthMeters;
  if (lengthM !== undefined) {
    return { qty: lengthM, unit: 'M' };
  }

  // Prioridad 6: fallback fungible EA=1
  return { qty: 1, unit: 'EA' };
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Validación pasiva de inventario previo a producción.
 *
 * Clasifica cada material requerido en:
 *   - FÍSICO-INDIVIDUAL (telas Y2, lineales FT/M, retazos): busca AL MENOS UN
 *     ítem con stock individual suficiente. No suma varios ítems.
 *   - FUNGIBLE-AGREGADO (EA/unidades): suma total disponible del SKU.
 *
 * No reserva inventario ni ejecuta algoritmos de corte.
 */
export function validateOrderInventoryAvailability(
  order: SavedOrder,
  context: InventoryValidationContext
): InventoryAvailabilityResult {
  const result: InventoryAvailabilityResult = {
    status: 'unknown',
    canProceed: false,
    reasons: [],
    missingItems: [],
    insufficientItems: [],
    warnings: [],
  };

  if (context.isSyncError) {
    result.status = 'sync_error';
    result.reasons.push(context.syncErrorMessage || 'Error de sincronización con la bodega global.');
    return result;
  }

  if (!context.inventoryItems) {
    result.status = 'unknown';
    result.reasons.push('Datos de inventario no provistos al contexto.');
    return result;
  }

  // ── 1. Extraer materiales requeridos ───────────────────────────────────────
  const requiredMap = new Map<string, RequiredMaterial>();
  let hasLines = false;

  function addRequired(sku: string, description: string, quantity: number, unit: string, opts?: Partial<RequiredMaterial>) {
    const normSku = sku.trim().toUpperCase();
    const normUnit = normalizeUnit(unit);
    const existing = requiredMap.get(normSku);
    if (existing) {
      if (normalizeUnit(existing.unit) === normUnit) {
        existing.quantity += quantity;
      } else {
        // Unidades inconsistentes para el mismo SKU en la misma orden: error inmediato
        result.status = 'incompatible_unit';
        result.reasons.push(
          `Unidad de requerimiento inconsistente para el SKU ${normSku} (${existing.unit} vs ${unit}).`
        );
      }
    } else {
      requiredMap.set(normSku, {
        sku: normSku,
        description,
        quantity,
        unit: normUnit,
        ...opts,
      });
    }
  }

  // Prioridad 1: Revisión final (finalMaterialLines)
  if (order.productionReview?.finalMaterialLines && order.productionReview.finalMaterialLines.length > 0) {
    hasLines = true;
    for (const line of order.productionReview.finalMaterialLines) {
      if (!line.sku) continue;
      addRequired(line.sku, line.description, line.quantity, line.unit);
      if (result.status === 'incompatible_unit') return result;
    }

    if (order.productionReview.finalFabricLines) {
      for (const line of order.productionReview.finalFabricLines) {
        if (!line.sku) continue;
        addRequired(line.sku, line.description, line.quantity, line.unit || 'YD2', {
          requiredWidthMeters: line.width_meters,
        });
        if (result.status === 'incompatible_unit') return result;
      }
    }
  }
  // Prioridad 2: materialLines de los ítems
  else {
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      if (item?.materialLines && item.materialLines.length > 0) {
        hasLines = true;
        for (const line of item.materialLines) {
          const rawSku = line.sageItemCode || line.itemCode;
          if (!rawSku) continue;
          addRequired(rawSku, line.description, line.quantity, line.unit, {
            specificInventoryItemId: line.specificInventoryItemId,
            requiredWidthMeters: line.requiredWidthMeters,
          });
          if (result.status === 'incompatible_unit') return result;
        }
      }
    }
  }

  if (!hasLines) {
    result.status = 'missing_material_lines';
    result.reasons.push('No hay líneas de material calculadas para validar inventario.');
    return result;
  }

  // ── 2. Indexar ítems de inventario disponibles por SKU ─────────────────────
  const inventoryBySku = new Map<string, { item: InventoryItem; extracted: ExtractedInventoryQty }[]>();
  const inventoryById = new Map<string, { item: InventoryItem; extracted: ExtractedInventoryQty }>();

  for (const inv of context.inventoryItems) {
    const extracted = extractInventoryQty(inv);
    if (!extracted) continue;

    const code = inv.code.trim().toUpperCase();
    if (!inventoryBySku.has(code)) inventoryBySku.set(code, []);
    inventoryBySku.get(code)!.push({ item: inv, extracted });

    if (inv.id) inventoryById.set(inv.id, { item: inv, extracted });
  }

  // ── 3. Validar cada requerimiento ──────────────────────────────────────────
  for (const req of Array.from(requiredMap.values())) {
    const entries = inventoryBySku.get(req.sku);

    if (!entries || entries.length === 0) {
      result.missingItems.push({
        sku: req.sku,
        description: req.description,
        required: req.quantity,
        unit: req.unit,
      });
      continue;
    }

    // Detectar tipo de ítem para saber si aplicar lógica física o fungible
    // Usamos el kind del primer ítem encontrado para este SKU
    const firstKind = entries[0]?.item.kind;
    const itemType = resolveItemType(req.unit, firstKind);

    if (itemType === 'fungible_ea') {
      // ── FUNGIBLE: sumar todos los disponibles ───────────────────────────
      let totalAvail = 0;
      for (const { extracted } of entries) {
        const converted = convertQuantity(extracted.qty, extracted.unit, req.unit);
        if (converted !== null) totalAvail += converted;
      }

      if (totalAvail < req.quantity - FLOAT_EPSILON) {
        result.insufficientItems.push({
          sku: req.sku,
          description: req.description,
          required: req.quantity,
          available: totalAvail,
          unit: req.unit,
          reason: 'insufficient_stock',
        });
      }

    } else if (itemType === 'fabric_roll') {
      // ── TELA/ROLLO: buscar AL MENOS UN ítem con área suficiente y ancho compatible ──
      //
      // Reglas:
      //   1. El ítem debe ser 'available'
      //   2. available_yd2 (o área calculada) >= cantidad requerida en YD2
      //   3. Si se especificó requiredWidthMeters, el width_meters del ítem debe estar
      //      dentro de ±WIDTH_TOLERANCE_M
      //   4. Si hay specificInventoryItemId, solo ese ítem cuenta

      let foundCompatible = false;
      // bestAvailableYd2: mejor área encontrada en ítems compatibles por ancho
      let bestAvailableYd2 = 0;
      // bestAreaIgnoringWidth: mejor área encontrada en ítems con ancho incompatible
      // (para distinguir "no hay stock" de "hay área pero ancho erróneo")
      let bestAreaIgnoringWidth = 0;
      let hasWidthMismatch = false;

      const candidateEntries = req.specificInventoryItemId
        ? (inventoryById.has(req.specificInventoryItemId)
           ? [inventoryById.get(req.specificInventoryItemId)!]
           : [])
        : entries;

      for (const { item, extracted } of candidateEntries) {
        if (item.status !== 'available') continue;
        if (extracted.unit !== 'YD2') continue;

        const yd2 = extracted.availableYd2 ?? extracted.qty;

        // Verificar ancho compatible (si se especificó)
        if (req.requiredWidthMeters !== undefined && extracted.widthMeters !== undefined) {
          const widthDiff = Math.abs(extracted.widthMeters - req.requiredWidthMeters);
          if (widthDiff > WIDTH_TOLERANCE_M) {
            hasWidthMismatch = true;
            // Registrar área del ítem incompatible por ancho (para el warning)
            if (yd2 > bestAreaIgnoringWidth) bestAreaIgnoringWidth = yd2;
            continue; // Este ítem no es compatible por ancho
          }
        }

        if (yd2 > bestAvailableYd2) bestAvailableYd2 = yd2;

        if (yd2 >= req.quantity - FLOAT_EPSILON) {
          foundCompatible = true;
          break;
        }
      }

      if (!foundCompatible) {
        // Si todos los ítems fueron descartados por ancho, es width_mismatch
        const pureWidthMismatch = hasWidthMismatch && bestAvailableYd2 === 0 && bestAreaIgnoringWidth > 0;
        const insuffReason: 'width_mismatch' | 'insufficient_stock' =
          pureWidthMismatch ? 'width_mismatch' : 'insufficient_stock';

        // El mejor stock reportado: preferir ítems compatibles; si no hay, reportar 0
        const reportedAvailable = bestAvailableYd2;

        result.insufficientItems.push({
          sku: req.sku,
          description: req.description,
          required: req.quantity,
          available: reportedAvailable,
          unit: 'YD2',
          reason: insuffReason,
        });

        // Emitir warning si había área suficiente en rollos pero con ancho incompatible
        if (hasWidthMismatch && bestAreaIgnoringWidth >= req.quantity - FLOAT_EPSILON) {
          result.warnings.push(
            `SKU ${req.sku}: Hay rollos con área suficiente pero ancho incompatible ` +
            `(requerido: ${req.requiredWidthMeters?.toFixed(2)} m ±${WIDTH_TOLERANCE_M} m).`
          );
        } else if (hasWidthMismatch) {
          result.warnings.push(
            `SKU ${req.sku}: Ancho incompatible en rollos disponibles ` +
            `(requerido: ${req.requiredWidthMeters?.toFixed(2)} m ±${WIDTH_TOLERANCE_M} m).`
          );
        }
      }

    } else {
      // ── LINEAL (tubo, barra, retazo lineal): buscar AL MENOS UNA PIEZA suficiente ──
      //
      // Reglas:
      //   1. El ítem debe ser 'available'
      //   2. El largo del ítem (en la unidad del requerimiento) >= cantidad requerida
      //   3. Si hay specificInventoryItemId, solo ese ítem cuenta
      //   4. NO se suman varios ítems distintos

      let foundCompatible = false;
      let bestAvailableFt = 0;

      const candidateEntries = req.specificInventoryItemId
        ? (inventoryById.has(req.specificInventoryItemId)
           ? [inventoryById.get(req.specificInventoryItemId)!]
           : [])
        : entries;

      for (const { item, extracted } of candidateEntries) {
        if (item.status !== 'available') continue;

        const convertedQty = convertQuantity(extracted.qty, extracted.unit, req.unit);
        if (convertedQty === null) continue; // Unidad incompatible, saltar este ítem

        if (convertedQty > bestAvailableFt) bestAvailableFt = convertedQty;

        if (convertedQty >= req.quantity - FLOAT_EPSILON) {
          foundCompatible = true;
          break;
        }
      }

      if (!foundCompatible) {
        result.insufficientItems.push({
          sku: req.sku,
          description: req.description,
          required: req.quantity,
          available: bestAvailableFt,
          unit: req.unit,
          reason: 'insufficient_stock',
        });
      }
    }
  }

  // ── 4. Determinar estado final ─────────────────────────────────────────────
  if (result.missingItems.length > 0) {
    result.status = 'missing_sku';
    result.canProceed = false;
    result.reasons.push(`Faltan ${result.missingItems.length} materiales en bodega (SKUs no encontrados).`);
  } else if (result.insufficientItems.length > 0) {
    result.status = 'insufficient_stock';
    result.canProceed = false;
    result.reasons.push(`Stock insuficiente para ${result.insufficientItems.length} materiales.`);
    for (const item of result.insufficientItems) {
      const reasonLabel = item.reason === 'width_mismatch'
        ? 'Ancho incompatible'
        : 'Stock insuficiente';
      result.reasons.push(
        `${reasonLabel} — ${item.sku}: requiere ${item.required} ${item.unit}, disponible ${item.available.toFixed(3)} ${item.unit}.`
      );
    }
  } else {
    result.status = 'available';
    result.canProceed = true;
  }

  return result;
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

export function hasBlockingInventoryIssue(
  order: SavedOrder,
  context: InventoryValidationContext
): boolean {
  return !validateOrderInventoryAvailability(order, context).canProceed;
}

export function getOrderInventoryBlockingReasons(
  order: SavedOrder,
  context: InventoryValidationContext
): string[] {
  return validateOrderInventoryAvailability(order, context).reasons;
}

export function getInventoryAvailabilitySummary(
  order: SavedOrder,
  context: InventoryValidationContext
): string {
  const result = validateOrderInventoryAvailability(order, context);
  if (result.canProceed) return 'Stock suficiente';
  return result.reasons.join(' | ');
}
