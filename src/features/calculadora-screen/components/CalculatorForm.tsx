import { Button } from '../../../components/ui/Button';
import { CURTAIN_OPTIONS } from '../../../domain/curtains/constants';
import type {
  CalculationFormValues,
  ScreenValidationErrors,
} from '../../../domain/curtains/types';

interface CalculatorFormProps {
  values: CalculationFormValues;
  errors: ScreenValidationErrors;
  onChange: (field: keyof CalculationFormValues, value: string) => void;
  onOrderNumberChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onAddToProject: () => void;
  canAddToProject: boolean;
  orderNumber: string;
}

export function CalculatorForm({
  values,
  errors,
  onChange,
  onOrderNumberChange,
  onSubmit,
  onClear,
  onAddToProject,
  canAddToProject,
  orderNumber,
}: CalculatorFormProps) {
  return (
    <div className="calculator-form calculator-form--compact">
      <div className="section-heading section-heading--compact">
        <span className="section-heading__eyebrow">Produccion</span>
        <h1>Roller</h1>
      </div>

      <div className="compact-form-grid">
        <label className="field">
          <span>Orden</span>
          <input
            type="text"
            value={orderNumber}
            placeholder="OC-1045"
            onChange={(event) => onOrderNumberChange(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Tipo</span>
          <select
            value={values.curtainType}
            onChange={(event) => onChange('curtainType', event.target.value)}
          >
            {CURTAIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Ancho (m)</span>
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            placeholder="1.80"
            value={values.widthMeters}
            onChange={(event) => onChange('widthMeters', event.target.value)}
          />
          {errors.widthMeters ? (
            <small className="field__error">{errors.widthMeters}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Alto (m)</span>
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            placeholder="1.80"
            value={values.heightMeters}
            onChange={(event) => onChange('heightMeters', event.target.value)}
          />
          {errors.heightMeters ? (
            <small className="field__error">{errors.heightMeters}</small>
          ) : null}
        </label>
      </div>

      {errors.general ? <div className="alert alert--error">{errors.general}</div> : null}

      <div className="button-row button-row--spread button-row--compact">
        <Button type="button" onClick={onSubmit}>
          Calcular
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onAddToProject}
          disabled={!canAddToProject}
        >
          Agregar
        </Button>
        <Button type="button" variant="secondary" onClick={onClear}>
          Limpiar
        </Button>
      </div>
    </div>
  );
}
