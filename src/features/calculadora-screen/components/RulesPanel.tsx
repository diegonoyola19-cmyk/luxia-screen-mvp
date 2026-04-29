import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { COMPONENT_CATEGORY_OPTIONS, TONE_GROUP_OPTIONS } from '../../../domain/curtains/constants';
import type { ComponentCategory, ToneGroup } from '../../../domain/curtains/types';
import {
  getCatalogItemLabel,
  getToneLabel,
  getRecipeItemOptions,
  inferToneGroupFromColor,
  searchCatalogItems,
} from '../../../lib/itemCatalog';
import {
  getRollerFabricColorOptions,
  getRollerFabricFamilies,
  getRollerFabricOpennessOptions,
} from '../../../lib/priceCatalog';
import { useCalculatorStore } from '../store/useCalculatorStore';

type RulesTab = 'calculation' | 'catalog' | 'tones' | 'recipe';

const tabs: Array<{ id: RulesTab; label: string }> = [
  { id: 'calculation', label: 'Calculo' },
  { id: 'catalog', label: 'Catalogo' },
  { id: 'tones', label: 'Tonos' },
  { id: 'recipe', label: 'Receta Screen' },
];

export function RulesPanel() {
  const store = useCalculatorStore();
  const [activeTab, setActiveTab] = useState<RulesTab>('calculation');

  return (
    <Card className="rules-panel">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Configuracion</span>
          <h2>Reglas y recetas de fabricacion</h2>
          <p className="rules-panel__copy">
            Estandariza el calculo, los items del catalogo, los tonos de tela y
            los componentes que usa Screen/Roller.
          </p>
        </div>
      </div>

      <div className="config-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={[
              'config-tab',
              activeTab === tab.id ? 'config-tab--active' : '',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'calculation' ? <CalculationRulesSection /> : null}
      {activeTab === 'catalog' ? <CatalogSection /> : null}
      {activeTab === 'tones' ? <ToneRulesSection /> : null}
      {activeTab === 'recipe' ? <RecipeSection /> : null}
    </Card>
  );
}

function CalculationRulesSection() {
  const store = useCalculatorStore();
  const values = store.ruleFormValues;
  const errors = store.ruleErrors;

  return (
    <div className="config-section">
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

      <div className="field field--components">
        <div className="rules-panel__components-header">
          <div>
            <span>Componentes heredados</span>
            <p className="rules-panel__hint">
              Se mantienen para compatibilidad. La nueva receta Screen usa items
              reales del catalogo.
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
    </div>
  );
}

function CatalogSection() {
  const store = useCalculatorStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ComponentCategory | 'all'>('all');
  const filteredItems = useMemo(
    () => searchCatalogItems(store.catalogItems, query, category, 90),
    [category, query, store.catalogItems],
  );

  return (
    <div className="config-section">
      <div className="config-toolbar">
        <label className="field">
          <span>Buscar item</span>
          <input
            type="text"
            value={query}
            placeholder="Codigo, descripcion o color"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ComponentCategory | 'all')}
          >
            <option value="all">Todas</option>
            {COMPONENT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="config-table">
        {filteredItems.map((item) => (
          <article key={item.itemCode} className="config-row config-row--catalog">
            <div className="config-row__main">
              <strong>{item.itemCode}</strong>
              <span>{item.description}</span>
              <small>
                Sugerido: {item.suggestedCategory} {item.suggestedColor ? `- ${item.suggestedColor}` : ''}
              </small>
            </div>
            <label className="field">
              <span>Categoria</span>
              <select
                value={item.category}
                onChange={(event) =>
                  store.updateCatalogItemCategory(item.itemCode, event.target.value as ComponentCategory)
                }
              >
                {COMPONENT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Color</span>
              <input
                type="text"
                value={item.color ?? ''}
                placeholder="Sin color"
                onChange={(event) => store.updateCatalogItemColor(item.itemCode, event.target.value)}
              />
            </label>
            <label className="field">
              <span>Codigo Sage</span>
              <input
                type="text"
                value={item.sageItemCode}
                onChange={(event) =>
                  store.updateCatalogItemSageCode(item.itemCode, event.target.value)
                }
              />
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function ToneRulesSection() {
  const store = useCalculatorStore();
  const [family, setFamily] = useState(() => getRollerFabricFamilies()[0] ?? '');
  const opennessOptions = useMemo(() => getRollerFabricOpennessOptions(family), [family]);
  const [openness, setOpenness] = useState(() => opennessOptions[0] ?? '');
  const colors = useMemo(
    () => getRollerFabricColorOptions(family, openness),
    [family, openness],
  );

  const handleFamilyChange = (value: string) => {
    const nextOpenness = getRollerFabricOpennessOptions(value)[0] ?? '';
    setFamily(value);
    setOpenness(nextOpenness);
  };

  return (
    <div className="config-section">
      <div className="config-toolbar">
        <label className="field">
          <span>Linea</span>
          <select value={family} onChange={(event) => handleFamilyChange(event.target.value)}>
            {getRollerFabricFamilies().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Apertura</span>
          <select value={openness} onChange={(event) => setOpenness(event.target.value)}>
            {opennessOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="config-table">
        {colors.map((option) => {
          const rule = store.fabricToneRules.find(
            (item) =>
              item.family === option.family &&
              item.openness === option.openness &&
              item.color === option.color,
          );
          const tone = rule?.toneGroup ?? inferToneGroupFromColor(option.color);

          return (
            <article key={option.color} className="config-row config-row--tone">
              <div className="config-row__main">
                <strong>{option.color}</strong>
                <span>{option.family} - {option.openness}</span>
                <small>Inferido: {getToneLabel(inferToneGroupFromColor(option.color))}</small>
              </div>
              <label className="field">
                <span>Grupo de tono</span>
                <select
                  value={tone}
                  onChange={(event) =>
                    store.updateFabricToneRule(
                      option.family,
                      option.openness,
                      option.color,
                      event.target.value as ToneGroup,
                    )
                  }
                >
                  {TONE_GROUP_OPTIONS.map((toneOption) => (
                    <option key={toneOption.value} value={toneOption.value}>
                      {toneOption.label}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const CONDITION_GROUPS = [
  { key: 'always',         label: 'Siempre',         color: '#6b7280' },
  { key: 'manual_only',    label: 'Solo manual',      color: '#0ea5e9' },
  { key: 'motorized_only', label: 'Solo motorizado',  color: '#8b5cf6' },
  { key: 'large_tube_only',label: 'Tubo reforzado',   color: '#f59e0b' },
] as const;

function RecipeSection() {
  const store = useCalculatorStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    store.screenRecipe.components[0]?.id ?? null,
  );

  const selectedComponent = store.screenRecipe.components.find(
    (c) => c.id === selectedId,
  );

  const selectedOptions = selectedComponent
    ? getRecipeItemOptions(store.catalogItems, selectedComponent.category, selectedComponent.label)
    : [];

  // Auto-detect if all 4 tones share the same item (or none assigned yet)
  const toneValues = selectedComponent
    ? TONE_GROUP_OPTIONS.map((t) => selectedComponent.itemByTone[t.value] ?? '')
    : [];
  const allSame = toneValues.every((v) => v === toneValues[0]);
  const [sameForAll, setSameForAll] = useState(allSame);

  // Reset toggle when switching components
  const prevId = selectedComponent?.id;
  const [trackedId, setTrackedId] = useState(prevId);
  if (trackedId !== selectedComponent?.id) {
    setTrackedId(selectedComponent?.id);
    setSameForAll(allSame);
  }

  const sharedValue = sameForAll ? (toneValues[0] ?? '') : '';

  const previewItem = selectedComponent
    ? TONE_GROUP_OPTIONS.map((t) => {
        const code = selectedComponent.itemByTone[t.value];
        return code ? store.catalogItems.find((i) => i.itemCode === code) : undefined;
      }).find((i) => i?.imageUrl)
    : undefined;

  function handleSameForAllChange(itemCode: string) {
    if (!selectedComponent) return;
    TONE_GROUP_OPTIONS.forEach((t) => {
      store.updateRecipeItem(selectedComponent.id, t.value, itemCode);
    });
  }

  return (
    <div className="config-section">
      <div className="recipe-save-bar">
        <span>Guarda los cambios para conservar receta, tonos y catalogo al recargar.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={store.resetRecipe}>
            Restaurar
          </Button>
          <Button type="button" onClick={store.saveRecipeSettings}>
            Guardar reglas
          </Button>
        </div>
      </div>

      <div className="recipe-layout">
        {/* LEFT — Component list */}
        <aside className="recipe-list">
          {CONDITION_GROUPS.map((group) => {
            const components = store.screenRecipe.components.filter(
              (c) => (c.condition ?? 'always') === group.key,
            );
            if (components.length === 0) return null;
            return (
              <div key={group.key} className="recipe-list__group">
                <span className="recipe-list__group-label" style={{ color: group.color }}>
                  {group.label}
                </span>
                {components.map((component) => {
                  const isConfigured = TONE_GROUP_OPTIONS.some(
                    (t) => !!component.itemByTone[t.value],
                  );
                  return (
                    <button
                      key={component.id}
                      type="button"
                      className={[
                        'recipe-list__item',
                        selectedId === component.id ? 'recipe-list__item--active' : '',
                      ].join(' ')}
                      onClick={() => setSelectedId(component.id)}
                    >
                      <span
                        className="recipe-list__status"
                        style={{ background: isConfigured ? '#22c55e' : '#d1d5db' }}
                        title={isConfigured ? 'Configurado' : 'Sin item asignado'}
                      />
                      <span className="recipe-list__name">{component.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* RIGHT — Detail panel */}
        {selectedComponent ? (
          <div className="recipe-detail">
            {/* Header */}
            <div className="recipe-detail__header">
              <div>
                <strong>{selectedComponent.label}</strong>
                {selectedComponent.condition && selectedComponent.condition !== 'always' ? (
                  <span
                    className="recipe-detail__badge"
                    style={{
                      background:
                        CONDITION_GROUPS.find((g) => g.key === selectedComponent.condition)?.color + '20',
                      color:
                        CONDITION_GROUPS.find((g) => g.key === selectedComponent.condition)?.color,
                    }}
                  >
                    {CONDITION_GROUPS.find((g) => g.key === selectedComponent.condition)?.label}
                  </span>
                ) : null}
              </div>
              {previewItem?.imageUrl ? (
                <img
                  className="recipe-detail__preview-img"
                  src={previewItem.imageUrl}
                  alt={previewItem.description}
                  loading="lazy"
                />
              ) : null}
            </div>

            {/* Toggle: same for all tones */}
            <label className="recipe-tone-toggle">
              <div
                className={['recipe-tone-toggle__track', sameForAll ? 'recipe-tone-toggle__track--on' : ''].join(' ')}
                onClick={() => setSameForAll((v) => !v)}
                role="switch"
                aria-checked={sameForAll}
                tabIndex={0}
                onKeyDown={(e) => e.key === ' ' && setSameForAll((v) => !v)}
              >
                <span className="recipe-tone-toggle__thumb" />
              </div>
              <span>Mismo item para todos los tonos</span>
            </label>

            {/* Tone fields */}
            <div className="recipe-detail__tones">
              {sameForAll ? (
                <RecipeItemCombobox
                  label="Item (todos los tonos)"
                  value={sharedValue}
                  items={selectedOptions}
                  onChange={handleSameForAllChange}
                />
              ) : (
                TONE_GROUP_OPTIONS.map((tone) => (
                  <RecipeItemCombobox
                    key={tone.value}
                    label={tone.label}
                    value={selectedComponent.itemByTone[tone.value] ?? ''}
                    items={selectedOptions}
                    onChange={(itemCode) =>
                      store.updateRecipeItem(selectedComponent.id, tone.value, itemCode)
                    }
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="recipe-detail recipe-detail--empty">
            <p>Selecciona un componente de la lista para configurarlo.</p>
          </div>
        )}
      </div>
    </div>
  );
}


const TONE_COLORS: Record<string, string> = {
  white:  '#f8f8f6',
  bronze: '#8b5e3c',
  ivory:  '#d4c5a9',
  grey:   '#9ca3af',
};

function RecipeItemCombobox({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: ReturnType<typeof getRecipeItemOptions>;
  onChange: (itemCode: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedItem = items.find((item) => item.itemCode === value);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    return items
      .filter((item) =>
        [item.itemCode, item.sageItemCode, item.description, item.color ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 20);
  }, [items, query]);

  const isAllTones = label.toLowerCase().includes('todos');
  const toneKey = label.toLowerCase().split('/')[0].trim().split(' ')[0];
  const toneColor = TONE_COLORS[toneKey] ?? '#e5e7eb';
  const isDark = ['bronze'].includes(toneKey);

  return (
    <div className={['recipe-tone-row', isAllTones ? 'recipe-tone-row--all' : ''].join(' ')}>
      {/* Tone chip */}
      {isAllTones ? (
        <div className="recipe-tone-chip recipe-tone-chip--all">
          ◈ Todos los tonos
        </div>
      ) : (
        <div
          className="recipe-tone-chip"
          style={{
            background: toneColor,
            color: isDark ? '#fff' : '#374151',
            border: `1.5px solid ${toneColor === '#f8f8f6' ? '#d1d5db' : toneColor}`,
          }}
        >
          {label}
        </div>
      )}

      {/* Item selector card */}
      <div className="recipe-tone-selector">
        {/* Thumbnail */}
        <div className="recipe-tone-thumb">
          {selectedItem?.imageUrl ? (
            <img src={selectedItem.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="recipe-tone-thumb__empty">—</span>
          )}
        </div>

        {/* Search input + info */}
        <div className="recipe-tone-field" style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            className="recipe-tone-input"
            value={isOpen ? query : (selectedItem ? selectedItem.sageItemCode : '')}
            placeholder="Buscar…"
            onFocus={() => { setQuery(''); setIsOpen(true); }}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          />
          {selectedItem && !isOpen ? (
            <span className="recipe-tone-desc">{selectedItem.description}</span>
          ) : null}

          {isOpen ? (
            <div className="recipe-search__menu recipe-tone-menu">
              <button
                type="button"
                className="recipe-search__option recipe-search__option--empty"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(''); setQuery(''); setIsOpen(false); }}
              >
                Sin item
              </button>
              {filteredItems.length === 0 ? (
                <div className="recipe-search__empty">Sin resultados</div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.itemCode}
                    type="button"
                    className={[
                      'recipe-search__option recipe-search__option--with-img',
                      item.itemCode === value ? 'recipe-search__option--active' : '',
                    ].join(' ')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChange(item.itemCode); setQuery(''); setIsOpen(false); }}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="recipe-option-thumb" loading="lazy" />
                    ) : (
                      <span className="recipe-option-thumb recipe-option-thumb--empty" />
                    )}
                    <div>
                      <strong>{item.sageItemCode}</strong>
                      <span>{item.description}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Clear button */}
        {value ? (
          <button
            type="button"
            className="recipe-tone-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); setQuery(''); }}
            aria-label="Quitar item"
          >
            ×
          </button>
        ) : null}
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
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field__error">{error}</small> : null}
    </label>
  );
}
