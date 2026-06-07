import { useMemo, useState, useEffect } from 'react';
import { animate } from 'framer-motion';
import { toast } from 'sonner';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { formatNumber, formatDate } from '../../../lib/format';
import { YARD2_PER_M2 } from '../utils';
import { componentCatalogBySku } from '../../../domain/inventory/componentCatalog';
import fabricCatalogData from '../../../data/luxia-roller-catalog.json';
import { useGlobalInventoryStore } from '../../../store/useGlobalInventoryStore';
import { selectGlobalFabricsForBodega, selectGlobalLinearsForBodega } from '../../../lib/inventoryGlobalSelectors';
import { getInventoryMigrationStatus } from '../../../lib/inventoryMigration';
import './InventoryPanelV2.css';

function toFT(meters: number): string {
  return (meters * 3.28084).toFixed(2);
}

const getFabricSku = (family?: string, color?: string, openness?: string) => {
  const found = fabricCatalogData.items.find(i => 
    i.family === family && i.color === color && i.openness === openness
  );
  return found?.itemCode || 'No registrado';
};

const getFabricImageUrl = (family?: string, color?: string, openness?: string) => {
  const found = fabricCatalogData.items.find(i => 
    i.family === family && i.color === color && i.openness === openness
  );
  return found?.imageUrl || null;
};

const getApproximateColor = (colorName?: string | null): string | null => {
  if (!colorName) return null;
  const name = colorName.toLowerCase();
  
  if (name.includes('white') || name.includes('blanco') || name.includes('hielo')) return '#f3f1ea';
  if (name.includes('ebony') || name.includes('black') || name.includes('negro') || name.includes('pearl')) return '#1f2024';
  if (name.includes('smoke') || name.includes('grey') || name.includes('gray') || name.includes('gris')) return '#8e9096';
  if (name.includes('stone') || name.includes('light grey')) return '#b5b8bb';
  if (name.includes('beige') || name.includes('bisque') || name.includes('linen') || name.includes('fawn')) return '#d8c7a8';
  if (name.includes('chocolate') || name.includes('brown') || name.includes('marrón') || name.includes('cafe')) return '#5a3825';
  if (name.includes('taupe')) return '#9b9287';
  if (name.includes('sand') || name.includes('arena')) return '#e6d5c3';
  if (name.includes('silver') || name.includes('plata')) return '#cccccc';
  if (name.includes('charcoal') || name.includes('carbon')) return '#36454f';
  if (name.includes('bronze') || name.includes('bronce')) return '#cd7f32';
  
  return null;
};

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(displayValue, value, {
      duration: 0.6,
      onUpdate: (v) => setDisplayValue(v),
    });
    return controls.stop;
  }, [value]);

  return <>{formatNumber(displayValue)}</>;
}

export function InventoryPanelV2() {
  const globalItems = useGlobalInventoryStore((state) => state.items);
  const syncStatus = useGlobalInventoryStore((state) => state.syncStatus);
  const syncError = useGlobalInventoryStore((state) => state.lastError);
  
  const migrationStatus = getInventoryMigrationStatus();

  const { role } = useAuthStore();
  const isReadOnly = role === 'consulta';

  const [activeTab, setActiveTab] = useState<'telas' | 'lineales'>('telas');
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [discardingItem, setDiscardingItem] = useState<any>(null);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    code: '',
    family: '',
    sku: '',
    color: '',
    widthMeters: '',
    lengthMeters: '',
    orderNumber: 'Registro manual',
    notes: ''
  });

  useEffect(() => {
    if (!discardingItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDiscardingItem(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [discardingItem]);

  // Clear selected item on tab change
  useEffect(() => {
    setSelectedItem(null);
    setSearchQuery('');
    setFamilyFilter('');
  }, [activeTab]);

  // Data from Global Store
  const availableScraps = useMemo(() => selectGlobalFabricsForBodega(globalItems), [globalItems]);
  const linearOffcuts = useMemo(() => selectGlobalLinearsForBodega(globalItems), [globalItems]);

  if (import.meta.env.DEV) {
    console.log("[Bodega] globalItems", globalItems);
  }

  const tubeOffcutsCount = useMemo(() => linearOffcuts.filter(l => l.kind === 'tube').length, [linearOffcuts]);
  const bottomOffcutsCount = useMemo(() => linearOffcuts.filter(l => l.kind === 'bottomrail').length, [linearOffcuts]);

  // Helper to get descriptive name
  const getDisplayName = (f: {family?: string, openness?: string}) => {
    if (!f.family) return '';
    if (f.openness && f.openness !== 'N/A' && f.openness !== 'Standard' && f.openness !== f.family) {
      return `${f.family} ${f.openness}`;
    }
    return f.family;
  };

  // Filtering
  const uniqueFamilies = useMemo(() => {
    const families = new Set(availableScraps.map(f => getDisplayName(f)).filter(Boolean) as string[]);
    return Array.from(families).sort();
  }, [availableScraps]);

  const filteredScraps = useMemo(() => {
    let result = availableScraps;
    
    if (familyFilter) {
      result = result.filter(f => getDisplayName(f) === familyFilter);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) => f.code.toLowerCase().includes(q) || 
               (f.family && f.family.toLowerCase().includes(q)) || 
               (f.color && f.color.toLowerCase().includes(q)) ||
               getFabricSku(f.family, f.color, f.openness).toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [availableScraps, searchQuery, familyFilter]);

  const filteredLinears = useMemo(() => {
    if (!searchQuery) return linearOffcuts;
    const q = searchQuery.toLowerCase();
    return linearOffcuts.filter(
      (l) => l.code.toLowerCase().includes(q) || 
             (l.color && l.color.toLowerCase().includes(q))
    );
  }, [linearOffcuts, searchQuery]);

  const { user } = useAuthStore();
  const enqueueOperation = useGlobalInventoryStore((state) => state.enqueueOperation);

  const handleDiscard = (id: string, category: 'fabric' | 'tube' | 'bottom') => {
    if (isReadOnly) return toast.error('No tienes permisos para modificar el inventario');

    const itemToDiscard = globalItems.find(i => i.id === id);
    if (!itemToDiscard) {
      toast.error('Ítem no encontrado en inventario global.');
      setDiscardingItem(null);
      return;
    }

    import('../../../lib/inventoryGlobalActions').then(({ createGlobalDiscardPayload }) => {
      const { updatedStatus, movement } = createGlobalDiscardPayload(itemToDiscard, user?.id, 'Descartado manualmente desde Bodega');
      
      enqueueOperation({ type: 'update_status', itemId: id, payload: { status: updatedStatus } });
      enqueueOperation({ type: 'create_movement', payload: movement, itemId: id });
      
      if (selectedItem?.id === id) setSelectedItem(null);
      setDiscardingItem(null);
      toast.success('Baja encolada correctamente. Se sincronizará pronto.');
    });
  };

  const toFT = (meters: number) => (meters * 3.28084).toFixed(2);

  const handleExport = () => {
    import('../../../lib/exportInventoryExcel').then(module => {
      module.exportInventoryToExcel(filteredScraps, filteredLinears);
      toast.success('Excel descargado.');
    }).catch(err => {
      console.error(err);
      toast.error('Error al generar Excel.');
    });
  };

  const handleRefresh = () => {
    setSelectedItem(null);
    setSearchQuery('');
    setFamilyFilter('');
    toast.success('Bodega actualizada');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return toast.error('No tienes permisos para modificar el inventario');

    const w = parseFloat(manualForm.widthMeters);
    const l = parseFloat(manualForm.lengthMeters);
    if (!manualForm.color.trim()) return toast.error('El color o descripción es requerido.');
    if (isNaN(w) || w <= 0) return toast.error('El ancho debe ser mayor a 0.');
    if (isNaN(l) || l <= 0) return toast.error('El alto debe ser mayor a 0.');

    const generatedCode = manualForm.code.trim() || `RET-MAN-${new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14)}`;

    import('../../../lib/inventoryGlobalActions').then(({ createGlobalScrapPayload }) => {
      const { item, movement } = createGlobalScrapPayload({
        code: generatedCode,
        family: manualForm.family,
        color: manualForm.color,
        widthMeters: w,
        lengthMeters: l,
        notes: manualForm.notes,
        orderNumber: manualForm.orderNumber,
        userId: user?.id
      });

      enqueueOperation({ type: 'upsert_item', payload: item });
      enqueueOperation({ type: 'create_movement', payload: movement, itemId: item.id });

      setIsManualModalOpen(false);
      setManualForm({
        code: '', family: '', sku: '', color: '', widthMeters: '', lengthMeters: '', orderNumber: 'Registro manual', notes: ''
      });
      toast.success('Retazo registrado globalmente.');
      setActiveTab('telas');
    });
  };

  return (
    <section className="inventory-v2-page">
      {/* HEADER */}
      <div className="iv2-header">
        <div className="iv2-header-title">
          <h2>Bodega <span style={{fontSize: '0.6em', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle', marginLeft: '8px'}}>GLOBAL</span></h2>
          <p>Consulta retazos de tela y sobrantes lineales en la base de datos centralizada Supabase.</p>
        </div>
        <div className="iv2-header-actions">
          <button className="iv2-btn-secondary" onClick={() => setIsManualModalOpen(true)} disabled={isReadOnly}>
            + Registrar retazo manual
          </button>
          <button className="iv2-btn-secondary" onClick={handleExport}>
            <span className="material-symbols-outlined" style={{fontSize: 18}}>download</span> Exportar lista
          </button>
          <button className="iv2-btn-secondary iv2-btn-icon" onClick={handleRefresh} title="Actualizar datos visuales">
            <span className="material-symbols-outlined" style={{fontSize: 20}}>refresh</span>
          </button>
        </div>
      </div>

      {migrationStatus.status !== 'completed' && (
        <div className="alert alert--warning" style={{ margin: '0 2rem 1rem 2rem' }}>
          ⚠️ <strong>Atención:</strong> Aún hay datos locales sin migrar. Dirígete a <em>Configuración</em> para empujar tu bodega local hacia la nube global.
        </div>
      )}

      {syncError && (
        <div className="alert alert--error" style={{ margin: '0 2rem 1rem 2rem' }}>
          ❌ <strong>Error de sincronización:</strong> {syncError}
        </div>
      )}

      {/* KPIS */}
      <div className="iv2-summary-grid">
        <div className="iv2-metric-card">
          <span className="iv2-metric-eyebrow">RETAZOS DE TELA DISPONIBLES</span>
          <strong className="iv2-metric-value"><AnimatedNumber value={availableScraps.length} /> <span style={{fontSize:'1.2rem', fontWeight:400}}>retazos</span></strong>
        </div>
        <div className="iv2-metric-card">
          <span className="iv2-metric-eyebrow">SOBRANTES DE TUBO DISPONIBLES</span>
          <strong className="iv2-metric-value"><AnimatedNumber value={tubeOffcutsCount} /> <span style={{fontSize:'1.2rem', fontWeight:400}}>pz</span></strong>
        </div>
        <div className="iv2-metric-card">
          <span className="iv2-metric-eyebrow">SOBRANTES DE BOTTOMRAIL</span>
          <strong className="iv2-metric-value"><AnimatedNumber value={bottomOffcutsCount} /> <span style={{fontSize:'1.2rem', fontWeight:400}}>pz</span></strong>
        </div>
      </div>

      <div className="iv2-workspace">
        <div className="iv2-main-area">
          {/* TABS */}
          <div className="iv2-tabs-simple">
            <button 
              className={`iv2-tab-simple ${activeTab === 'telas' ? 'iv2-tab-simple--active' : ''}`}
              onClick={() => setActiveTab('telas')}
            >
              Retazos de Tela
            </button>
            <button 
              className={`iv2-tab-simple ${activeTab === 'lineales' ? 'iv2-tab-simple--active' : ''}`}
              onClick={() => setActiveTab('lineales')}
            >
              Sobrantes Lineales
            </button>
          </div>

          <div className="iv2-filters">
            <div className="iv2-search-bar">
              <span className="material-symbols-outlined">search</span>
              <input 
                type="text" 
                placeholder="Buscar por código, SKU o tela..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {activeTab === 'telas' && (
              <select 
                className="iv2-btn-placeholder" 
                style={{cursor: 'pointer', opacity: 1, appearance: 'auto', outline: 'none', minWidth: '150px'}}
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
              >
                <option value="">Todas las telas</option>
                {uniqueFamilies.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
            <button className="iv2-btn-placeholder" title="Próximamente" disabled>Estado</button>
          </div>

          <div className="iv2-table-container">
            {activeTab === 'telas' && (
              <>
                <div className="iv2-table-header">
                  <span>Código</span>
                  <span>Tela / SKU</span>
                  <span>Descripción / Color</span>
                  <span>Medida</span>
                  <span>Área</span>
                  <span>Gen. Por Orden</span>
                  <span>Fecha Gen.</span>
                  <span>Estado</span>
                </div>
                <div className="iv2-table-body">
                  {filteredScraps.length === 0 ? (
                    <div className="iv2-empty">No se encontraron retazos de tela.</div>
                  ) : (
                    filteredScraps.map(fabric => (
                      <div 
                        key={fabric.id} 
                        className={`iv2-table-row ${selectedItem?.id === fabric.id ? 'iv2-table-row--selected' : ''}`}
                        onClick={() => setSelectedItem({...fabric, itemType: 'Tela'})}
                      >
                        <div className="iv2-cell" data-label="Código"><strong style={{color: 'var(--color-primary)'}}>{fabric.code}</strong></div>
                        <div className="iv2-cell-main" data-label="Tela / SKU">
                          <div>
                            <strong>{fabric.family || 'Desconocida'}</strong><br/>
                            <span style={{fontSize: '0.75rem', color: 'var(--color-text-muted)'}}>{getFabricSku(fabric.family, fabric.color, fabric.openness)}</span>
                          </div>
                        </div>
                        <div className="iv2-cell" data-label="Color">
                          {getApproximateColor(fabric.color) ? (
                            <span className="color-swatch" style={{ backgroundColor: getApproximateColor(fabric.color)! }} />
                          ) : null}
                          {fabric.color || '-'}
                        </div>
                        <div className="iv2-cell" data-label="Medida">{formatNumber(fabric.widthMeters)}m x {formatNumber(fabric.lengthMeters)}m</div>
                        <div className="iv2-cell" data-label="Área">{formatNumber(fabric.widthMeters * fabric.lengthMeters)} m²</div>
                        <div className="iv2-cell" data-label="Gen. Por Orden">{(fabric as any).orderNumber || 'Corte de Prod.'}</div>
                        <div className="iv2-cell" data-label="Fecha Gen.">{new Date(fabric.createdAt).toLocaleDateString()}</div>
                        <div className="iv2-cell" data-label="Estado"><span className="iv2-badge iv2-badge--available">Disponible</span></div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeTab === 'lineales' && (
              <>
                <div className="iv2-table-header iv2-table-header--linear">
                  <span>Código</span>
                  <span>Tipo</span>
                  <span>SKU / Descripción</span>
                  <span>Largo Disponible</span>
                  <span>Gen. Por Orden</span>
                  <span>Fecha Gen.</span>
                  <span>Estado</span>
                </div>
                <div className="iv2-table-body">
                  {filteredLinears.length === 0 ? (
                    <div className="iv2-empty">No se encontraron sobrantes lineales.</div>
                  ) : (
                    filteredLinears.map(linear => (
                      <div 
                        key={linear.id} 
                        className={`iv2-table-row iv2-table-row--linear ${selectedItem?.id === linear.id ? 'iv2-table-row--selected' : ''}`}
                        onClick={() => setSelectedItem(linear)}
                      >
                        <div className="iv2-cell" data-label="Código"><strong style={{color: 'var(--color-primary)'}}>{linear.code}</strong></div>
                        <div className="iv2-cell" data-label="Tipo">
                          <span className={`iv2-badge ${linear.itemType === 'Tubo' ? 'iv2-badge--tube' : 'iv2-badge--bottom'}`}>
                            {linear.itemType}
                          </span>
                        </div>
                        <div className="iv2-cell" data-label="SKU / Desc.">{linear.color || 'Estándar'}</div>
                        <div className="iv2-cell" data-label="Largo Disponible">
                          <strong>{toFT(linear.remainingLengthM)} FT</strong> <span style={{color: 'var(--color-text-muted)'}}>/ {formatNumber(linear.remainingLengthM)} m</span>
                        </div>
                        <div className="iv2-cell" data-label="Gen. Por Orden">{linear.sourceOrderNumber}</div>
                        <div className="iv2-cell" data-label="Fecha Gen.">{new Date(linear.createdAt).toLocaleDateString()}</div>
                        <div className="iv2-cell" data-label="Estado"><span className="iv2-badge iv2-badge--available">Disponible</span></div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* DETAILS PANEL */}
        {/* DETAILS PANEL */}
        <div className="iv2-details-panel">
          {!selectedItem ? (
            <div className="iv2-details-empty">
              <span className="material-symbols-outlined">inventory_2</span>
              <p>Selecciona un retazo o sobrante para ver sus detalles.</p>
            </div>
          ) : (
            <>
              <div className="iv2-details-header">
                <h3>Detalle de Item</h3>
                <button className="iv2-btn-close" onClick={() => setSelectedItem(null)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="iv2-details-body">
                {selectedItem.itemType === 'Tela' ? (
                  (selectedItem.imageUrl || getFabricImageUrl(selectedItem.family, selectedItem.color, selectedItem.openness)) ? (
                    <div className="iv2-detail-preview iv2-detail-preview--image" style={{ border: 'none' }}>
                      <img 
                        src={selectedItem.imageUrl || getFabricImageUrl(selectedItem.family, selectedItem.color, selectedItem.openness)!} 
                        alt={selectedItem.color || selectedItem.family || 'Material'} 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ) : getApproximateColor(selectedItem.color) ? (
                    <div className="iv2-detail-preview iv2-detail-preview--swatch" style={{ backgroundColor: getApproximateColor(selectedItem.color)! }}>
                    </div>
                  ) : (
                    <div className="iv2-detail-preview iv2-detail-preview--empty">
                      <span className="material-symbols-outlined" style={{fontSize: 32, opacity: 0.7}}>texture</span>
                      <span className="iv2-detail-preview__label" style={{opacity: 0.7}}>Sin imagen</span>
                    </div>
                  )
                ) : (
                  <div className="iv2-detail-preview iv2-detail-preview--empty">
                    <span className="material-symbols-outlined" style={{fontSize: 48, opacity: 0.7}}>{selectedItem.itemType === 'Tubo' ? 'panorama_horizontal' : 'horizontal_rule'}</span>
                    <span className="iv2-detail-preview__label" style={{opacity: 0.7}}>{selectedItem.itemType === 'Tubo' ? 'Sobrante lineal' : 'Sobrante lineal'}</span>
                  </div>
                )}

                <div className="iv2-details-group">
                  <span className="iv2-details-label">ID BODEGA</span>
                  <strong className="iv2-details-title" style={{color: 'var(--color-primary)'}}>{selectedItem.code}</strong>
                </div>

                {selectedItem.itemType === 'Tela' ? (
                  <>
                    <div className="iv2-details-grid">
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">TELA / SKU</span>
                        <span>
                          {selectedItem.family || 'Desconocida'}<br/>
                          <span style={{fontSize: '0.75rem', color: 'var(--color-text-muted)'}}>{getFabricSku(selectedItem.family, selectedItem.color, selectedItem.openness)}</span>
                        </span>
                      </div>
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">COLOR / DESC.</span>
                        <span>{selectedItem.color || '-'}</span>
                      </div>
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">ANCHO</span>
                        <span>{formatNumber(selectedItem.widthMeters)} mts</span>
                      </div>
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">ALTO (CAÍDA)</span>
                        <span>{formatNumber(selectedItem.lengthMeters)} mts</span>
                      </div>
                    </div>
                    <div className="iv2-details-group" style={{marginTop: '1rem'}}>
                      <span className="iv2-details-label">ÁREA TOTAL</span>
                      <strong>{formatNumber(selectedItem.widthMeters * selectedItem.lengthMeters)} m²</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="iv2-details-grid">
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">TIPO</span>
                        <span>{selectedItem.itemType}</span>
                      </div>
                      <div className="iv2-details-col">
                        <span className="iv2-details-label">SKU / DESC.</span>
                        <span>{selectedItem.color || 'Estándar'}</span>
                      </div>
                    </div>
                    <div className="iv2-details-group" style={{marginTop: '1rem'}}>
                      <span className="iv2-details-label">LARGO DISPONIBLE</span>
                      <strong style={{fontSize: '1.2rem'}}>{toFT(selectedItem.remainingLengthM)} FT</strong> 
                      <span style={{color: 'var(--color-text-muted)'}}> / {formatNumber(selectedItem.remainingLengthM)} m</span>
                    </div>
                  </>
                )}

                <hr className="iv2-details-divider" />

                <div className="iv2-details-group">
                  <span className="iv2-details-label">NOTAS DE ORIGEN</span>
                  <p style={{fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.4, margin:0}}>
                    Generado a partir de la orden <strong>{selectedItem.itemType === 'Tela' ? (selectedItem as any).orderNumber || 'de producción general' : selectedItem.sourceOrderNumber}</strong> el {new Date(selectedItem.createdAt).toLocaleDateString()}.
                    Corte remanente disponible en bodega.
                  </p>
                </div>

              </div>

              <div className="iv2-details-actions">
                <button 
                  className="iv2-btn-danger" 
                  style={{width: '100%', justifyContent: 'center', opacity: isReadOnly ? 0.5 : 1}}
                  onClick={() => setDiscardingItem(selectedItem)}
                  disabled={isReadOnly}
                >
                  {isReadOnly ? 'Dar de baja (🔒)' : 'Dar de baja'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {discardingItem && (
        <div 
          className="orders-delete-modal-overlay" 
          role="dialog" 
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDiscardingItem(null);
          }}
        >
          <div className="orders-delete-modal">
            <div className="orders-delete-modal__header">
              <div className="orders-delete-modal__title-area">
                <div className="orders-delete-modal__icon">
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-danger, #d93025)' }}>delete_forever</span>
                </div>
                <div className="orders-delete-modal__texts">
                  <h3>¿Dar de baja {discardingItem.itemType === 'Tela' ? 'retazo' : 'sobrante'} {discardingItem.code}?</h3>
                  <p>Esta acción marcará el item como descartado y dejará de estar disponible para reutilización.</p>
                </div>
              </div>
              <button className="orders-delete-modal__close" onClick={() => setDiscardingItem(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="orders-delete-modal__body">
              <p>No modificará órdenes ya generadas ni archivos exportados.</p>
              
              <div className="orders-delete-modal__warning" style={{ background: 'var(--surface-soft)', borderColor: 'var(--line)' }}>
                <div className="orders-delete-modal__warning-texts" style={{ width: '100%' }}>
                  {discardingItem.itemType === 'Tela' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>TELA / SKU</span>
                        <strong style={{ fontSize: '0.9rem' }}>{discardingItem.family || 'Desconocida'}</strong><br/>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{getFabricSku(discardingItem.family, discardingItem.color, discardingItem.openness)}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>MEDIDA Y ÁREA</span>
                        <strong style={{ fontSize: '0.9rem' }}>{formatNumber(discardingItem.widthMeters)}m x {formatNumber(discardingItem.lengthMeters)}m</strong><br/>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{formatNumber(discardingItem.widthMeters * discardingItem.lengthMeters)} m²</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>SKU / DESC.</span>
                        <strong style={{ fontSize: '0.9rem' }}>{discardingItem.color || 'Estándar'}</strong><br/>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{discardingItem.itemType}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>LARGO DISPONIBLE</span>
                        <strong style={{ fontSize: '0.9rem' }}>{toFT(discardingItem.remainingLengthM)} FT</strong><br/>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{formatNumber(discardingItem.remainingLengthM)} m</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="orders-delete-modal__footer">
              <button 
                type="button" 
                className="iv2-btn-placeholder"
                style={{ opacity: 1, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)' }}
                onClick={() => setDiscardingItem(null)}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="iv2-btn-danger"
                onClick={() => handleDiscard(discardingItem.id, discardingItem.itemType === 'Tela' ? 'fabric' : (discardingItem.itemType === 'Tubo' ? 'tube' : 'bottom'))}
                disabled={isReadOnly}
              >
                Dar de baja
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div 
          className="orders-delete-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsManualModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsManualModalOpen(false);
          }}
        >
          <div className="orders-delete-modal" style={{ maxWidth: '640px', width: '90%', padding: '0', overflow: 'hidden' }}>
            <div className="orders-delete-modal__header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div className="orders-delete-modal__title-area">
                <div className="orders-delete-modal__icon" style={{ background: 'var(--surface-dim)', color: 'var(--text)' }}>
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <div className="orders-delete-modal__texts">
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Registrar retazo manual</h3>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>Ingresa los detalles para registrar un retazo físico en Bodega.</p>
                </div>
              </div>
              <button className="orders-delete-modal__close" onClick={() => setIsManualModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleManualSubmit}>
              <div className="orders-delete-modal__body" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Código</span>
                    <input 
                      type="text" 
                      value={manualForm.code} 
                      onChange={e => setManualForm({...manualForm, code: e.target.value})} 
                      placeholder="Se generará automáticamente si queda vacío" 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Familia / Línea</span>
                    <input 
                      type="text" 
                      value={manualForm.family} 
                      onChange={e => setManualForm({...manualForm, family: e.target.value})} 
                      placeholder="Ej. Screen, Rollux..." 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>SKU (Opcional)</span>
                    <input 
                      type="text" 
                      value={manualForm.sku} 
                      onChange={e => setManualForm({...manualForm, sku: e.target.value})} 
                      placeholder="Ej. 0-111-..." 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Color / Descripción *</span>
                    <input 
                      type="text" 
                      value={manualForm.color} 
                      onChange={e => setManualForm({...manualForm, color: e.target.value})} 
                      required 
                      placeholder="Requerido" 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                    {!manualForm.color.trim() && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger, #d93025)', marginTop: '2px' }}>Este campo es obligatorio.</span>
                    )}
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Ancho (m) *</span>
                    <input 
                      type="number" 
                      step="0.001" 
                      value={manualForm.widthMeters} 
                      onChange={e => setManualForm({...manualForm, widthMeters: e.target.value})} 
                      required 
                      placeholder="0.00" 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                    {(Number(manualForm.widthMeters) <= 0 || isNaN(Number(manualForm.widthMeters))) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger, #d93025)', marginTop: '2px' }}>El ancho debe ser mayor a 0.</span>
                    )}
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Alto (m) *</span>
                    <input 
                      type="number" 
                      step="0.001" 
                      value={manualForm.lengthMeters} 
                      onChange={e => setManualForm({...manualForm, lengthMeters: e.target.value})} 
                      required 
                      placeholder="0.00" 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                    {(Number(manualForm.lengthMeters) <= 0 || isNaN(Number(manualForm.lengthMeters))) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger, #d93025)', marginTop: '2px' }}>El alto debe ser mayor a 0.</span>
                    )}
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Orden Origen</span>
                    <input 
                      type="text" 
                      value={manualForm.orderNumber} 
                      onChange={e => setManualForm({...manualForm, orderNumber: e.target.value})} 
                      placeholder="Registro manual" 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                  </label>
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Notas</span>
                    <input 
                      type="text" 
                      value={manualForm.notes} 
                      onChange={e => setManualForm({...manualForm, notes: e.target.value})} 
                      placeholder="Observaciones extra..." 
                      className="iv2-input" 
                      style={{ height: '40px' }}
                    />
                  </label>
                </div>
              </div>

              <div className="orders-delete-modal__footer" style={{ borderTop: '1px solid var(--line)', flexDirection: 'column', alignItems: 'stretch' }}>
                {(!manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0) && (
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'right' }}>
                    Completa color/descripción, ancho y alto para guardar.
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button 
                    type="button" 
                    className="iv2-btn-placeholder" 
                    style={{ opacity: 1, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)' }} 
                    onClick={() => setIsManualModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="iv2-btn-secondary" 
                    style={{ 
                      background: isReadOnly ? 'var(--line-strong)' : ((!manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0) ? 'var(--line-strong)' : 'var(--color-primary)'), 
                      color: isReadOnly ? 'var(--muted)' : ((!manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0) ? 'var(--muted)' : 'white'), 
                      border: 'none',
                      cursor: isReadOnly ? 'not-allowed' : ((!manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0) ? 'not-allowed' : 'pointer')
                    }}
                    disabled={isReadOnly || !manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0}
                    title={isReadOnly ? "No tienes permisos de escritura" : ((!manualForm.color.trim() || Number(manualForm.widthMeters) <= 0 || Number(manualForm.lengthMeters) <= 0) ? "Faltan campos obligatorios" : "")}
                  >
                    Guardar retazo
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
