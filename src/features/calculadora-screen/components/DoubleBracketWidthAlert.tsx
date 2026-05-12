/**
 * DoubleBracketWidthAlert.tsx
 * Luxia MES — Modal de autorización para Roller Bracket Doble > 2.80 m.
 *
 * Muestra un diálogo bloqueante que obliga al operador a tomar una decisión
 * explícita antes de continuar con una medida fuera del límite estándar.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './DoubleBracketWidthAlert.css';

export interface DoubleBracketWidthAlertProps {
  /** El ancho que disparó la alerta (en metros). */
  widthM: number;
  /** Callback cuando el operador cancela. */
  onCancel: () => void;
  /** Callback cuando el operador acepta el riesgo. */
  onConfirm: () => void;
}

export function DoubleBracketWidthAlert({
  widthM,
  onCancel,
  onConfirm,
}: DoubleBracketWidthAlertProps) {

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        className="dbwa-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
        aria-modal="true"
        role="dialog"
        aria-labelledby="dbwa-title"
        aria-describedby="dbwa-desc"
      >
        {/* Dialog */}
        <motion.div
          className="dbwa-dialog"
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon row */}
          <div className="dbwa-icon-row">
            <div className="dbwa-icon-shell">
              <span className="material-symbols-outlined dbwa-icon">warning</span>
            </div>
          </div>

          {/* Header */}
          <h2 id="dbwa-title" className="dbwa-title">
            Límite de Bracket Doble superado
          </h2>

          {/* Body */}
          <p id="dbwa-desc" className="dbwa-body">
            La medida ingresada{' '}
            <strong className="dbwa-width">
              {widthM.toFixed(3).replace('.', '.')} m
            </strong>{' '}
            supera el límite recomendado de{' '}
            <strong>2.80 m</strong> para bracket doble estándar.
          </p>

          <div className="dbwa-info-box">
            <span className="material-symbols-outlined dbwa-info-icon">info</span>
            <p className="dbwa-info-text">
              Solo continuar si el cliente acepta el riesgo. La orden quedará
              marcada como <strong>Fabricación Especial</strong> y el cliente
              asumirá la responsabilidad estructural.
            </p>
          </div>

          {/* Actions */}
          <div className="dbwa-actions">
            <button
              id="dbwa-cancel"
              className="dbwa-btn dbwa-btn--cancel"
              onClick={onCancel}
              autoFocus
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                close
              </span>
              Cancelar
            </button>

            <button
              id="dbwa-confirm"
              className="dbwa-btn dbwa-btn--confirm"
              onClick={onConfirm}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                check_circle
              </span>
              Continuar bajo autorización
            </button>
          </div>

          {/* Footer note */}
          <p className="dbwa-footer">
            Al continuar se registrará:{' '}
            <code>riskAcceptedByCustomer: true</code> ·{' '}
            <code>specialFabrication: true</code>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
