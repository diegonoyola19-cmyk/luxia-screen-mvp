import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type {
  ScreenRuleConfigErrors,
  ScreenRuleConfigFormValues,
} from '../../../domain/curtains/types';

interface RulesPanelProps {
  values: ScreenRuleConfigFormValues;
  errors: ScreenRuleConfigErrors;
  onChange: (field: keyof ScreenRuleConfigFormValues, value: string) => void;
  onFixedComponentChange: (index: number, value: string) => void;
  onFixedComponentQuantityChange: (index: number, value: string) => void;
  onFixedComponentUnitChange: (index: number, value: string) => void;
  onFixedComponentCostChange: (index: number, value: string) => void;
  onAddFixedComponent: () => void;
  onRemoveFixedComponent: (index: number) => void;
  onSave: () => void;
  onReset: () => void;
}

export function RulesPanel({
  values,
  errors,
  onChange,
  onFixedComponentChange,
  onFixedComponentQuantityChange,
  onFixedComponentUnitChange,
  onFixedComponentCostChange,
  onAddFixedComponent,
  onRemoveFixedComponent,
  onSave,
  onReset,
}: RulesPanelProps) {
  return (
    <Card className="rules-panel">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Configuracion</span>
          <h2>Reglas editables de Screen</h2>
          <p className="rules-panel__copy">
            Cambia las reglas de calculo sin tocar el codigo. Los cambios se
            guardan localmente en este navegador.
          </p>
        </div>
      </div>

      <div className="form-grid form-grid--rules">
        <label className="field">
          <span>Extra de alto de corte (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.cutHeightExtraMeters}
            onChange={(event) =>
              onChange('cutHeightExtraMeters', event.target.value)
            }
          />
          {errors.cutHeightExtraMeters ? (
            <small className="field__error">{errors.cutHeightExtraMeters}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Ancho maximo (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.maxWidthMeters}
            onChange={(event) => onChange('maxWidthMeters', event.target.value)}
          />
          {errors.maxWidthMeters ? (
            <small className="field__error">{errors.maxWidthMeters}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Multiplicador de cadena</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.chainMultiplier}
            onChange={(event) => onChange('chainMultiplier', event.target.value)}
          />
          {errors.chainMultiplier ? (
            <small className="field__error">{errors.chainMultiplier}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Rollo pequeno (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.smallRollMeters}
            onChange={(event) => onChange('smallRollMeters', event.target.value)}
          />
          {errors.smallRollMeters ? (
            <small className="field__error">{errors.smallRollMeters}</small>
          ) : null}
        </label>

        <label className="field">
          <span>Rollo grande (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.largeRollMeters}
            onChange={(event) => onChange('largeRollMeters', event.target.value)}
          />
          {errors.largeRollMeters ? (
            <small className="field__error">{errors.largeRollMeters}</small>
          ) : null}
        </label>

      </div>

      <div className="field field--components">
        <div className="rules-panel__components-header">
          <div>
            <span>Componentes fijos</span>
            <p className="rules-panel__hint">
              Edita cada componente por separado. Mantuvimos esta zona mas compacta
              para que no robe espacio visual a la calculadora.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onAddFixedComponent}>
            Agregar
          </Button>
        </div>

        <div className="component-list">
          {values.fixedComponents.map((component, index) => (
            <div key={`component-${index}`} className="component-item">
              <div className="component-item__index">{index + 1}</div>
              <input
                type="number"
                min="1"
                step="1"
                className="component-item__quantity"
                value={component.quantity}
                placeholder="Cant."
                onChange={(event) =>
                  onFixedComponentQuantityChange(index, event.target.value)
                }
              />
              <input
                type="text"
                value={component.name}
                placeholder="Nombre del componente"
                onChange={(event) =>
                  onFixedComponentChange(index, event.target.value)
                }
              />
              <input
                type="text"
                value={component.unit}
                placeholder="Unidad"
                onChange={(event) =>
                  onFixedComponentUnitChange(index, event.target.value)
                }
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={component.cost}
                placeholder="Costo"
                onChange={(event) =>
                  onFixedComponentCostChange(index, event.target.value)
                }
              />
              <Button
                type="button"
                variant="danger"
                onClick={() => onRemoveFixedComponent(index)}
                disabled={values.fixedComponents.length <= 1}
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>

        {errors.fixedComponents ? (
          <small className="field__error">{errors.fixedComponents}</small>
        ) : null}
      </div>

      {errors.general ? <div className="alert alert--error">{errors.general}</div> : null}

      <div className="button-row">
        <Button type="button" onClick={onSave}>
          Guardar reglas
        </Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          Restaurar valores base
        </Button>
      </div>
    </Card>
  );
}
