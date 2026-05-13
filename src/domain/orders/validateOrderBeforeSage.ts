import { SavedOrder } from '../curtains/types';
import { SavedOrderStatus } from './orderStatus';

export type SageValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type SageValidationResult = {
  ok: boolean;
  errors: SageValidationIssue[];
  warnings: SageValidationIssue[];
};

export function validateOrderBeforeSage(order: SavedOrder): SageValidationResult {
  const result: SageValidationResult = {
    ok: true,
    errors: [],
    warnings: []
  };

  const addError = (code: string, message: string) => {
    result.ok = false;
    result.errors.push({ code, message, severity: "error" });
  };

  const addWarning = (code: string, message: string) => {
    result.warnings.push({ code, message, severity: "warning" });
  };

  if (!order.items || order.items.length === 0) {
    addError("EMPTY_ORDER", "La orden no tiene cortinas.");
    return result;
  }

  // Verificar revisión
  if (order.status !== "materials_checked" || order.productionReview?.status !== "completed") {
    addError("MATERIAL_REVIEW_REQUIRED", "Debes revisar o confirmar los materiales antes de enviar la orden a Sage.");
    return result; // No seguimos validando SKUs si no hay finalMaterialLines confiables
  }

  const finalLines = order.productionReview.finalMaterialLines || [];
  if (finalLines.length === 0) {
    addError("MISSING_FINAL_MATERIAL_LINES", "La orden no contiene materiales para enviar a Sage.");
  }

  // Validar líneas finales
  const placeholderRegex = /^X+$/i;
  for (const line of finalLines) {
    if (!line.sku || line.sku.trim() === "") {
      addError("EMPTY_SKU", `Material sin SKU definido: ${line.description}`);
    } else if (placeholderRegex.test(line.sku.trim())) {
      addError("UNRESOLVED_SKU_PLACEHOLDER", `El SKU ${line.sku} contiene un placeholder sin resolver en: ${line.description}`);
    }
  }

  // Validar Telas
  const hasFabric = order.items.some(i => i.result?.selectedFabric);
  if (hasFabric) {
    const finalFabricLines = order.productionReview.finalFabricLines || [];
    if (finalFabricLines.length === 0) {
      addError("MISSING_FINAL_FABRIC_LINES", "La orden no contiene telas para enviar a Sage, aunque requiere tela.");
    }
    for (const line of finalFabricLines) {
      if (!line.sku || line.sku.trim() === "") {
        addError("EMPTY_FABRIC_SKU", `Tela sin SKU definido: ${line.description}`);
      } else if (placeholderRegex.test(line.sku.trim())) {
        addError("UNRESOLVED_FABRIC_SKU_PLACEHOLDER", `El SKU de tela ${line.sku} contiene un placeholder sin resolver en: ${line.description}`);
      }
      if (line.quantity <= 0) {
        addError("INVALID_FABRIC_QUANTITY", `La cantidad de tela exportada para ${line.sku} es <= 0.`);
      }
    }
    
    // Check if any adjustment couldn't resolve area
    const fabricAdjs = order.productionReview.fabricAdjustments || [];
    for (const adj of fabricAdjs) {
      if (adj.action !== 'removed') {
         if ((adj.actualAreaY2 === undefined || adj.actualAreaY2 <= 0) && (adj.calculatedWidthM === undefined || adj.calculatedHeightM === undefined) && adj.action === 'confirmed') {
            // Could not calculate Y2
            // Actually let's just rely on finalFabricLines length or quantity.
         }
      }
    }
  }

  // Validar piezas individuales
  for (const item of order.items) {
    if (item.materialWarnings && item.materialWarnings.length > 0) {
      addError("MATERIAL_ISSUES_PRESENT", `La cortina contiene advertencias de materiales pendientes.`);
    }

    if (item.input.specialFabrication) {
      if (!item.input.riskAcceptedByCustomer) {
        addError("SPECIAL_FABRICATION_NOT_AUTHORIZED", "Hay una fabricación especial que no ha sido autorizada por el cliente.");
      } else {
        addWarning("SPECIAL_FABRICATION", "La orden contiene cortinas de fabricación especial bajo riesgo del cliente.");
      }
    }

    if (item.reusedWastePiece) {
      if (!item.reusedWastePiece.widthMeters || !item.reusedWastePiece.heightMeters) {
        addWarning("INCOMPLETE_REMNANT_INFO", "Un retazo usado no tiene dimensiones completas registradas.");
      }
    }
  }

  return result;
}
