/**
 * useDoubleBracketWidthGuard.ts
 * Luxia MES — Hook que detecta si la configuración actual de bracket doble
 * supera el límite de 2.80 m y gestiona el flujo de autorización.
 *
 * Uso:
 *   const guard = useDoubleBracketWidthGuard({ widthM, mountingSystem });
 *
 *   // Mostrar el modal si guard.needsConfirmation
 *   // Pasar guard.handleCancel / guard.handleConfirm al modal
 *   // Leer guard.approvalState para saber el estado actual
 */

import { useState, useEffect, useCallback } from 'react';

/** Estado de la autorización del cliente para medidas especiales. */
export type ApprovalState =
  /** Medida dentro del límite estándar — no se requiere acción. */
  | 'within_limit'
  /** Medida fuera de límite, esperando decisión del operador. */
  | 'pending_confirmation'
  /** El operador canceló — no continuar el cálculo. */
  | 'cancelled'
  /** El operador aceptó el riesgo — continuar como fabricación especial. */
  | 'risk_accepted';

const DOUBLE_BRACKET_MAX_WIDTH_M = 2.8;
const DOUBLE_BRACKET_CATEGORY   = 'double_bracket' as const;

interface UseDoubleBracketWidthGuardOptions {
  /** Ancho actual en metros (de parsedFormValues.widthMeters). */
  widthM: number;
  /** Sistema de montaje seleccionado en el store. */
  mountingSystem: string | null | undefined;
}

export interface DoubleBracketWidthGuardResult {
  /** Si es true, mostrar el modal de confirmación. */
  needsConfirmation: boolean;
  /** Estado actual del flujo de autorización. */
  approvalState: ApprovalState;
  /**
   * Datos para persisir en la orden cuando la fabricación es especial.
   * undefined si no aplica.
   */
  specialFabricationMeta:
    | {
        riskAcceptedByCustomer: true;
        specialFabrication: true;
        specialFabricationReason: string;
      }
    | undefined;
  /** Llamar cuando el operador hace click en "Cancelar". */
  handleCancel: () => void;
  /** Llamar cuando el operador hace click en "Continuar bajo autorización". */
  handleConfirm: () => void;
}

export function useDoubleBracketWidthGuard({
  widthM,
  mountingSystem,
}: UseDoubleBracketWidthGuardOptions): DoubleBracketWidthGuardResult {

  const [approvalState, setApprovalState] = useState<ApprovalState>('within_limit');

  const isDoubleBracket = mountingSystem === DOUBLE_BRACKET_CATEGORY;
  const exceedsLimit    = isDoubleBracket && widthM > DOUBLE_BRACKET_MAX_WIDTH_M;

  // Cuando el ancho o sistema cambian, re-evaluar si se necesita confirmación.
  useEffect(() => {
    if (!exceedsLimit) {
      // Dentro del límite o no es bracket doble — limpiar cualquier estado previo.
      setApprovalState('within_limit');
      return;
    }

    // Si ya está en un estado final (aceptado o cancelado) y el ancho no cambió
    // a algo que supere de nuevo el límite, no reabrir el modal.
    setApprovalState((prev) => {
      if (prev === 'risk_accepted' || prev === 'cancelled') {
        // El ancho sigue fuera de límite pero el operador ya decidió.
        // Mantener su decisión hasta que cambie el ancho.
        return prev;
      }
      return 'pending_confirmation';
    });
  }, [exceedsLimit, widthM]);

  const handleCancel = useCallback(() => {
    setApprovalState('cancelled');
  }, []);

  const handleConfirm = useCallback(() => {
    setApprovalState('risk_accepted');
  }, []);

  const needsConfirmation = approvalState === 'pending_confirmation';

  const specialFabricationMeta =
    approvalState === 'risk_accepted'
      ? {
          riskAcceptedByCustomer: true  as const,
          specialFabrication:     true  as const,
          specialFabricationReason: `Bracket doble mayor a ${DOUBLE_BRACKET_MAX_WIDTH_M} m`,
        }
      : undefined;

  return {
    needsConfirmation,
    approvalState,
    specialFabricationMeta,
    handleCancel,
    handleConfirm,
  };
}
