import { useCalculatorStore } from '../store/useCalculatorStore';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

export function RulesPanel() {
  return (
    <Card className="rules-panel">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Configuracion</span>
          <h2>Reglas de Tela y Corte</h2>
          <p className="rules-panel__copy">
            Ajusta las mermas, tolerancias y anchos de rollo estándar para el cálculo de consumo de tela.
          </p>
        </div>
      </div>

      <CalculationRulesSection />
    </Card>
  );
}

function CalculationRulesSection() {
  const store = useCalculatorStore();
  const values = store.ruleFormValues;
  const errors = store.ruleErrors;

  return (
    <div className="config-section" style={{ marginTop: '20px' }}>
      <div className="form-grid form-grid--rules">
        <RuleNumberField
          label="Extra de alto de corte (m)"
          value={values.cutHeightExtraMeters}
          error={errors.cutHeightExtraMeters}
          onChange={(value) => store.handleRuleChange('cutHeightExtraMeters', value)}
        />
        <RuleNumberField
          label="Ancho maximo (m)"
          value={values.maxWidthMeters}
          error={errors.maxWidthMeters}
          onChange={(value) => store.handleRuleChange('maxWidthMeters', value)}
        />
        <RuleNumberField
          label="Multiplicador de cadena"
          value={values.chainMultiplier}
          error={errors.chainMultiplier}
          onChange={(value) => store.handleRuleChange('chainMultiplier', value)}
        />
        <RuleNumberField
          label="Rollo pequeno (m)"
          value={values.smallRollMeters}
          error={errors.smallRollMeters}
          onChange={(value) => store.handleRuleChange('smallRollMeters', value)}
        />
        <RuleNumberField
          label="Rollo grande (m)"
          value={values.largeRollMeters}
          error={errors.largeRollMeters}
          onChange={(value) => store.handleRuleChange('largeRollMeters', value)}
        />
      </div>

      {errors.general ? <div className="alert alert--error">{errors.general}</div> : null}

      <div className="button-row" style={{ marginTop: '30px' }}>
        <Button type="button" onClick={store.saveRules}>
          Guardar configuracion
        </Button>
        <Button type="button" variant="secondary" onClick={store.resetRules}>
          Restaurar valores base
        </Button>
      </div>
    </div>
  );
}

function RuleNumberField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field__error">{error}</small> : null}
    </label>
  );
}
