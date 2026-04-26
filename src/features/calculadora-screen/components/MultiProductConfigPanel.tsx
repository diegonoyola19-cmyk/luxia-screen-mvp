import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { CurtainType, BaseRuleConfig } from '../../../domain/curtains/types';
import { CURTAIN_OPTIONS } from '../../../domain/curtains/constants';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { ItemAutocomplete } from './ItemAutocomplete';
import { CatalogItem } from '../../../lib/itemCatalog';

function PreviewBadge({ itemCode, imageUrl }: { itemCode: string, imageUrl?: string | null }) {
  const [showPreview, setShowPreview] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div 
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <span style={{ 
        fontSize: '11px', 
        color: '#059669', 
        backgroundColor: '#ecfdf5', 
        padding: '2px 6px', 
        borderRadius: '4px', 
        border: '1px solid #d1fae5', 
        whiteSpace: 'nowrap',
        cursor: imageUrl ? 'help' : 'default'
      }}>
        {itemCode}
      </span>
      {showPreview && imageUrl && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 5px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          backgroundColor: 'white',
          padding: '4px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb',
          width: '140px',
          height: '140px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {!hasError ? (
            <img 
              src={imageUrl} 
              alt={itemCode} 
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '4px', objectFit: 'contain' }} 
              onError={() => setHasError(true)}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
              Sin imagen<br/>disponible
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MultiProductConfigPanel() {
  const store = useCalculatorStore();
  const activeTab = store.activeConfigTab;
  const config = store.multiConfig[activeTab];

  const handleTabChange = (tab: CurtainType) => {
    store.setActiveConfigTab(tab);
  };

  const onRuleComponentSelect = (role: 'tube' | 'bottom' | 'chain', item: CatalogItem | null) => {
    if (item) {
      store.updateRuleComponent(activeTab, role, item.itemCode, item.description, item.unit, item.avgCost, item.imageUrl);
    } else {
      store.updateRuleComponent(activeTab, role, '', '', 'u', 0, null);
    }
  };

  const onFixedComponentSelect = (index: number, item: CatalogItem | null) => {
    if (item) {
      store.updateFixedComponent(activeTab, index, 'itemCode', item.itemCode);
      store.updateFixedComponent(activeTab, index, 'name', item.description);
      store.updateFixedComponent(activeTab, index, 'unit', item.unit);
      store.updateFixedComponent(activeTab, index, 'cost', item.avgCost);
      store.updateFixedComponent(activeTab, index, 'imageUrl', item.imageUrl);
    } else {
      store.updateFixedComponent(activeTab, index, 'itemCode', '');
      store.updateFixedComponent(activeTab, index, 'name', '');
      store.updateFixedComponent(activeTab, index, 'unit', 'u');
      store.updateFixedComponent(activeTab, index, 'cost', 0);
      store.updateFixedComponent(activeTab, index, 'imageUrl', null);
    }
  };

  return (
    <Card className="rules-panel">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Configuracion</span>
          <h2>Modelos y Componentes</h2>
          <p className="rules-panel__copy">
            Configura las reglas y asigna items desde la base de SAGE para cada tipo de cortina.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
        {CURTAIN_OPTIONS.filter(opt => opt.value !== 'screen').map((option) => (
          <button
            key={option.value}
            type="button"
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: activeTab === option.value ? '#3b82f6' : '#f3f4f6',
              color: activeTab === option.value ? 'white' : 'black',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            onClick={() => handleTabChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="form-grid form-grid--rules">
        <label className="field">
          <span>Extra de alto de corte (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.cutHeightExtraMeters}
            onChange={(e) => store.updateBaseRule(activeTab, 'cutHeightExtraMeters', parseFloat(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span>Ancho maximo (m)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.maxWidthMeters}
            onChange={(e) => store.updateBaseRule(activeTab, 'maxWidthMeters', parseFloat(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span>Multiplicador de cadena</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.chainMultiplier}
            onChange={(e) => store.updateBaseRule(activeTab, 'chainMultiplier', parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="field field--components" style={{ marginTop: '30px' }}>
        <h3>Componentes con Regla</h3>
        <p className="rules-panel__hint">Busca el item en SAGE para el Tubo, Bottom y Cadena.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ width: '100px', fontWeight: 'bold' }}>Tubo:</span>
            <div style={{ flex: 1 }}>
              <ItemAutocomplete 
                value={config.ruleComponents.tube?.itemCode || ''} 
                initialName={config.ruleComponents.tube?.name}
                onSelect={(item) => onRuleComponentSelect('tube', item)} 
              />
            </div>
            {config.ruleComponents.tube?.itemCode && (
              <PreviewBadge itemCode={config.ruleComponents.tube.itemCode} imageUrl={config.ruleComponents.tube.imageUrl} />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ width: '100px', fontWeight: 'bold' }}>Bottom:</span>
            <div style={{ flex: 1 }}>
              <ItemAutocomplete 
                value={config.ruleComponents.bottom?.itemCode || ''} 
                initialName={config.ruleComponents.bottom?.name}
                onSelect={(item) => onRuleComponentSelect('bottom', item)} 
              />
            </div>
            {config.ruleComponents.bottom?.itemCode && (
              <PreviewBadge itemCode={config.ruleComponents.bottom.itemCode} imageUrl={config.ruleComponents.bottom.imageUrl} />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ width: '100px', fontWeight: 'bold' }}>Cadena:</span>
            <div style={{ flex: 1 }}>
              <ItemAutocomplete 
                value={config.ruleComponents.chain?.itemCode || ''} 
                initialName={config.ruleComponents.chain?.name}
                onSelect={(item) => onRuleComponentSelect('chain', item)} 
              />
            </div>
            {config.ruleComponents.chain?.itemCode && (
              <PreviewBadge itemCode={config.ruleComponents.chain.itemCode} imageUrl={config.ruleComponents.chain.imageUrl} />
            )}
          </div>

        </div>
      </div>

      <div className="field field--components" style={{ marginTop: '30px' }}>
        <div className="rules-panel__components-header">
          <div>
            <h3>Componentes Fijos</h3>
            <p className="rules-panel__hint">Busca items en SAGE que se agregan por cantidad fija.</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => store.addFixedComponent(activeTab)}>
            Agregar
          </Button>
        </div>

        <div className="component-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {config.fixedComponents.map((component, index) => (
            <div key={`fixed-${index}`} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                style={{ width: '80px' }}
                value={component.quantity}
                onChange={(e) => store.updateFixedComponent(activeTab, index, 'quantity', parseInt(e.target.value) || 1)}
              />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <ItemAutocomplete 
                    value={component.itemCode || ''}
                    initialName={component.name}
                    onSelect={(item) => onFixedComponentSelect(index, item)}
                  />
                </div>
                {component.itemCode && (
                  <PreviewBadge itemCode={component.itemCode} imageUrl={component.imageUrl} />
                )}
              </div>
              <Button type="button" variant="danger" onClick={() => store.removeFixedComponent(activeTab, index)}>
                X
              </Button>
            </div>
          ))}
          {config.fixedComponents.length === 0 && <p>No hay componentes fijos asignados.</p>}
        </div>
      </div>
    </Card>
  );
}
