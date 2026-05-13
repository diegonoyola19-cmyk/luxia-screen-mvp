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
 * Normaliza estados antiguos o inválidos a un estado seguro actual.
 * - "pending" -> "ready_for_production"
 * - "sent_to_sage" -> se conserva
 * - vacíos, inválidos -> "ready_for_production"
 */
export function normalizeOrderStatus(status: unknown): SavedOrderStatus {
  if (status === "pending") {
    return "ready_for_production";
  }
  
  if (typeof status === "string" && VALID_STATUSES.has(status as SavedOrderStatus)) {
    return status as SavedOrderStatus;
  }
  
  return "ready_for_production";
}
