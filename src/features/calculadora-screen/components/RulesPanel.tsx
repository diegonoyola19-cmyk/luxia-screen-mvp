import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type {
  ScreenRuleConfigErrors,
  ScreenRuleConfigFormValues,
} from '../../../domain/curtains/types';

import { useCalculatorStore } from '../store/useCalculatorStore';
export function RulesPanel() {
  const store = useCalculatorStore();
  const values = store.ruleFormValues;
  const errors = store.ruleErrors;
  
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
              store.handleRuleChange('cutHeightExtraMeters', event.target.value)
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
            onChange={(event) => store.handleRuleChange('maxWidthMeters', event.target.value)}
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
            onChange={(event) => store.handleRuleChange('chainMultiplier', event.target.value)}
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
            onChange={(event) => store.handleRuleChange('smallRollMeters', event.target.value)}
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
            onChange={(event) => store.handleRuleChange('largeRollMeters', event.target.value)}
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
          <Button type="button" variant="ghost" onClick={store.handleAddFixedComponent}>
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
                  store.handleFixedComponentQuantityChange(index, event.target.value)
                }
              />
              <input
                type="text"
                value={component.name}
                placeholder="Nombre del componente"
                onChange={(event) =>
                  store.handleFixedComponentChange(index, event.target.value)
                }
              />
              <input
                type="text"
                value={component.unit}
                placeholder="Unidad"
                onChange={(event) =>
                  store.handleFixedComponentUnitChange(index, event.target.value)
                }
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={component.cost}
                placeholder="Costo"
                onChange={(event) =>
                  store.handleFixedComponentCostChange(index, event.target.value)
                }
              />
              <Button
                type="button"
                variant="danger"
                onClick={() => store.handleRemoveFixedComponent(index)}
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
        <Button type="button" onClick={store.saveRules}>
          Guardar reglas
        </Button>
        <Button type="button" variant="secondary" onClick={store.resetRules}>
          Restaurar valores base
        </Button>
      </div>
    </Card>
  );
}
