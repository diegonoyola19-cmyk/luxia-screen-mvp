export type SavedOrderStatus =
  | "draft"
  | "ready_for_production"
  | "in_production"
  | "materials_checked"
  | "sent_to_sage"
  | "completed"
  | "cancelled";

const VALID_STATUSES: Set<SavedOrderStatus> = new Set([
  "draft",
  "ready_for_production",
  "in_production",
  "materials_checked",
  "sent_to_sage",
  "completed",
  "cancelled"
]);

/**
 * Normaliza estados legacy o inválidos a un estado seguro.
 *
 * Reglas:
 * - "pending" (estado legacy de BD) -> "ready_for_production"
 * - Estados válidos del tipo -> se conservan tal cual
 * - null / undefined / vacío / desconocido -> "draft"
 *   (fallback conservador: no asumimos que la orden está lista para producción)
 */
export function normalizeOrderStatus(status: unknown): SavedOrderStatus {
  // Mapeo explícito de estados legacy
  if (status === "pending") {
    return "ready_for_production";
  }

  if (typeof status === "string" && VALID_STATUSES.has(status as SavedOrderStatus)) {
    return status as SavedOrderStatus;
  }

  // Fallback seguro: cualquier valor null, undefined, vacío o desconocido → draft
  return "draft";
}

/**
 * Determina el siguiente estado tras generar el PDF de materiales.
 * Solo avanza si la orden ya está en ready_for_production con líneas válidas.
 * Un draft NO puede saltar directamente a in_production sin pasar por ready_for_production.
 */
export function getNextStatusAfterPdfGeneration(
  currentStatus: SavedOrderStatus | string | undefined | null,
  hasValidMaterialLines: boolean
): SavedOrderStatus | null {
  const status = normalizeOrderStatus(currentStatus);

  if (status === 'ready_for_production' && hasValidMaterialLines) {
    return 'in_production';
  }

  // draft ya no puede saltar directo a in_production; debe pasar por ready_for_production
  return null;
}
