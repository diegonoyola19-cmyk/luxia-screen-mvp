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
  insufficientItems: { sku: string; description: string; required: number; available: number; unit: string }[];
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
}

/**
 * Normaliza unidades para facilitar la comparación básica.
 * Soporta conversiones simples de FT a M y viceversa.
 */
function normalizeUnit(unit: string): string {
  if (!unit) return 'EA';
  const u = unit.toUpperCase().trim();
  if (u === 'UN' || u === 'PZ' || u === 'PIECE') return 'EA';
  if (u === 'MTR' || u === 'METERS' || u === 'METROS') return 'M';
  if (u === 'FEET' || u === 'PIES') return 'FT';
  if (u === 'Y2' || u === 'YD2' || u === 'YDS2') return 'YD2';
  return u;
}

/**
 * Convierte un valor a la unidad destino si es posible.
 * Retorna null si no son compatibles.
 */
function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  
  if (from === to) return quantity;
  
  if (from === 'M' && to === 'FT') return quantity * 3.28084;
  if (from === 'FT' && to === 'M') return quantity / 3.28084;
  
  // No hay conversión definida o no son compatibles (ej. EA vs M)
  return null;
}

/**
 * Validación pasiva y aproximada de inventario.
 * Suma los materiales requeridos y los compara contra el stock sumado disponible.
 * No reserva ni realiza algoritmos de nesting de cortes.
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
    warnings: []
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

  // 1. Extraer materiales requeridos
  const requiredMap = new Map<string, RequiredMaterial>();
  
  let hasLines = false;

  // Prioridad 1: Revisión final
  if (order.productionReview?.finalMaterialLines && order.productionReview.finalMaterialLines.length > 0) {
    hasLines = true;
    for (const line of order.productionReview.finalMaterialLines) {
      if (!line.sku) continue;
      const sku = line.sku.trim().toUpperCase();
      const unit = normalizeUnit(line.unit);
      const existing = requiredMap.get(sku);
      if (existing) {
        if (normalizeUnit(existing.unit) === unit) {
          existing.quantity += line.quantity;
        } else {
          result.status = 'incompatible_unit';
          result.reasons.push(`Unidad de requerimiento inconsistente para el SKU ${sku} (${existing.unit} vs ${line.unit}).`);
          return result;
        }
      } else {
        requiredMap.set(sku, { sku, description: line.description, quantity: line.quantity, unit });
      }
    }
    
    // Incluir telas si existen en la revisión
    if (order.productionReview.finalFabricLines) {
      for (const line of order.productionReview.finalFabricLines) {
        if (!line.sku) continue;
        const sku = line.sku.trim().toUpperCase();
        const unit = normalizeUnit(line.unit || 'YD2');
        const existing = requiredMap.get(sku);
        if (existing) {
           if (normalizeUnit(existing.unit) === unit) {
             existing.quantity += line.quantity;
           } else {
             // Podría ser error, lo agrupamos aparte
             requiredMap.set(sku + '_FABRIC', { sku, description: line.description, quantity: line.quantity, unit });
           }
        } else {
          requiredMap.set(sku, { sku, description: line.description, quantity: line.quantity, unit });
        }
      }
    }
  } 
  // Prioridad 2: Líneas de material base de los ítems
  else {
    for (const item of order.items) {
      if (item.materialLines && item.materialLines.length > 0) {
        hasLines = true;
        for (const line of item.materialLines) {
          const rawSku = line.sageItemCode || line.itemCode;
          if (!rawSku) continue;
          const sku = rawSku.trim().toUpperCase();
          const unit = normalizeUnit(line.unit);
          const existing = requiredMap.get(sku);
          if (existing) {
            if (normalizeUnit(existing.unit) === unit) {
              existing.quantity += line.quantity;
            } else {
              result.status = 'incompatible_unit';
              result.reasons.push(`Unidad de requerimiento inconsistente para el SKU ${sku} (${existing.unit} vs ${line.unit}).`);
              return result;
            }
          } else {
            requiredMap.set(sku, { sku, description: line.description, quantity: line.quantity, unit });
          }
        }
      }
    }
  }

  if (!hasLines) {
    result.status = 'missing_material_lines';
    result.reasons.push('No hay líneas de material calculadas para validar inventario.');
    return result;
  }

  // 2. Extraer disponibilidad pasiva del inventario global
  // Asumimos que context.inventoryItems tiene todo lo de Supabase
  const availableMap = new Map<string, { quantity: number; unit: string }>();

  for (const inv of context.inventoryItems) {
    if (inv.status !== 'available') continue;
    if (!inv.code) continue;
    
    const code = inv.code.trim().toUpperCase();
    const p = inv.payload || (inv as any);
    
    let invQty = 0;
    let invUnit = 'EA'; // Default fallback

    // Inferir cantidad y unidad del payload
    if (p.available_quantity !== undefined) {
      invQty = p.available_quantity;
      invUnit = p.unit ? normalizeUnit(p.unit) : 'EA';
    } else if (p.length_feet !== undefined) {
      invQty = p.length_feet;
      invUnit = 'FT';
    } else if (p.remainingLengthM !== undefined || p.length_meters !== undefined || p.lengthMeters !== undefined) {
      invQty = p.remainingLengthM ?? p.length_meters ?? p.lengthMeters;
      invUnit = 'M';
    } else {
      // Retazos / Telas
      const area = (p.width_meters ?? p.widthMeters ?? 0) * (p.length_meters ?? p.lengthMeters ?? 0);
      if (area > 0) {
         invQty = area * 1.19599; // Aproximación M2 a YD2
         invUnit = 'YD2';
      } else {
         invQty = 1;
         invUnit = 'EA';
      }
    }

    const existing = availableMap.get(code);
    if (existing) {
      // Sumar si la unidad es la misma o compatible
      const converted = convertQuantity(invQty, invUnit, existing.unit);
      if (converted !== null) {
        existing.quantity += converted;
      } else {
        // En caso raro de tener el mismo SKU con unidades irreconciliables en bodega
      }
    } else {
      availableMap.set(code, { quantity: invQty, unit: invUnit });
    }
  }

  // 3. Cruzar requerimientos vs disponibilidad
  for (const req of Array.from(requiredMap.values())) {
    const avail = availableMap.get(req.sku);

    if (!avail) {
      result.missingItems.push({
        sku: req.sku,
        description: req.description,
        required: req.quantity,
        unit: req.unit
      });
      continue;
    }

    const convertedAvailQty = convertQuantity(avail.quantity, avail.unit, req.unit);

    if (convertedAvailQty === null) {
      result.status = 'incompatible_unit';
      result.reasons.push(`Unidad de inventario no comparable para el SKU ${req.sku} (Req: ${req.unit}, Bodega: ${avail.unit}).`);
      return result;
    }

    // Usar un pequeño delta para evitar errores de precisión flotante en FT / M
    const Epsilon = 0.001;
    if (convertedAvailQty < req.quantity - Epsilon) {
      result.insufficientItems.push({
        sku: req.sku,
        description: req.description,
        required: req.quantity,
        available: convertedAvailQty,
        unit: req.unit
      });
    }
  }

  // 4. Determinar estado final
  if (result.missingItems.length > 0) {
    result.status = 'missing_sku';
    result.canProceed = false;
    result.reasons.push(`Faltan ${result.missingItems.length} materiales en bodega (SKUs no encontrados).`);
  } else if (result.insufficientItems.length > 0) {
    result.status = 'insufficient_stock';
    result.canProceed = false;
    result.reasons.push(`Stock insuficiente para ${result.insufficientItems.length} materiales.`);
  } else {
    result.status = 'available';
    result.canProceed = true;
  }

  return result;
}

export function hasBlockingInventoryIssue(
  order: SavedOrder,
  context: InventoryValidationContext
): boolean {
  const result = validateOrderInventoryAvailability(order, context);
  return !result.canProceed;
}

export function getOrderInventoryBlockingReasons(
  order: SavedOrder,
  context: InventoryValidationContext
): string[] {
  const result = validateOrderInventoryAvailability(order, context);
  return result.reasons;
}

export function getInventoryAvailabilitySummary(
  order: SavedOrder,
  context: InventoryValidationContext
): string {
  const result = validateOrderInventoryAvailability(order, context);
  if (result.canProceed) return 'Stock suficiente';
  return result.reasons.join(' | ');
}
