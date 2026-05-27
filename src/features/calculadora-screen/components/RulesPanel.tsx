import { useCalculatorStore } from '../store/useCalculatorStore';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { useAuthStore } from '../../../store/useAuthStore';

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
  const { role } = useAuthStore();
  const isReadOnly = role === 'consulta';

  return (
    <div className="config-section" style={{ marginTop: '20px' }}>
      {isReadOnly && (
        <div className="alert alert--neutral" style={{ marginBottom: '20px', fontSize: '0.85rem' }}>
          🔒 <strong>Modo de Solo Lectura:</strong> No tienes permisos para modificar la configuración de las reglas.
        </div>
      )}

      <div className="form-grid form-grid--rules">
        <RuleNumberField
          label="Extra de alto de corte (m)"
          value={values.cutHeightExtraMeters}
          error={errors.cutHeightExtraMeters}
          onChange={(value) => store.handleRuleChange('cutHeightExtraMeters', value)}
          disabled={isReadOnly}
        />
        <RuleNumberField
          label="Ancho maximo (m)"
          value={values.maxWidthMeters}
          error={errors.maxWidthMeters}
          onChange={(value) => store.handleRuleChange('maxWidthMeters', value)}
          disabled={isReadOnly}
        />
        <RuleNumberField
          label="Multiplicador de cadena"
          value={values.chainMultiplier}
          error={errors.chainMultiplier}
          onChange={(value) => store.handleRuleChange('chainMultiplier', value)}
          disabled={isReadOnly}
        />
        <RuleNumberField
          label="Rollo pequeno (m)"
          value={values.smallRollMeters}
          error={errors.smallRollMeters}
          onChange={(value) => store.handleRuleChange('smallRollMeters', value)}
          disabled={isReadOnly}
        />
        <RuleNumberField
          label="Rollo grande (m)"
          value={values.largeRollMeters}
          error={errors.largeRollMeters}
          onChange={(value) => store.handleRuleChange('largeRollMeters', value)}
          disabled={isReadOnly}
        />
      </div>

      {errors.general ? <div className="alert alert--error">{errors.general}</div> : null}

      <div className="button-row" style={{ marginTop: '30px' }}>
        <Button type="button" onClick={store.saveRules} disabled={isReadOnly}>
          Guardar configuracion
        </Button>
        <Button type="button" variant="secondary" onClick={store.resetRules} disabled={isReadOnly}>
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
  disabled,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      {error ? <small className="field__error">{error}</small> : null}
    </label>
  );
}

