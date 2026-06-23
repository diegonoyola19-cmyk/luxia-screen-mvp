import { useMemo, useState, useEffect } from 'react';
import { animate } from 'framer-motion';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/useAuthStore';
import { formatNumber } from '../../../lib/format';
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
  const { items: globalItems, enqueueOperation, upsertItemLocally } = useGlobalInventoryStore();
  const syncError = useGlobalInventoryStore((state) => state.lastError);
  const migrationStatus = getInventoryMigrationStatus();

  const { role, user } = useAuthStore();
  const isReadOnly = role === 'consulta';

  const [activeTab, setActiveTab] = useState<'fabric' | 'linear'>('fabric');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('available');
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals state
  const [detailItem, setDetailItem] = useState<any>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
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

  const [isSyncingApi, setIsSyncingApi] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('last_api_sync_time');
    return saved ? Number(saved) : null;
  });

  const handleSyncApi = async (silent = false) => {
    if (isReadOnly) {
      if (!silent) toast.error('No tienes permisos');
      return;
    }
    setIsSyncingApi(true);
    let toastId;
    if (!silent) toastId = toast.loading('Sincronizando catálogo de telas con Bodega...');
    try {
      const { syncApiCatalogToSupabase } = await import('../../../logic/syncApiCatalogToSupabase');
      const count = await syncApiCatalogToSupabase();
      
      const now = Date.now();
      localStorage.setItem('last_api_sync_time', now.toString());
      setLastSyncTime(now);
      
      if (!silent) toast.success(`Sincronización completa (${count} ítems empujados).`, { id: toastId });
      window.dispatchEvent(new Event('sync-inventory'));
    } catch (err: any) {
      if (!silent) toast.error(`Error de sincronización: ${err.message}`, { id: toastId });
      console.error(err);
    } finally {
      setIsSyncingApi(false);
    }
  };

  // Auto-sync once per day automatically on mount
  useEffect(() => {
    if (!isReadOnly && (!lastSyncTime || Date.now() - lastSyncTime > 24 * 60 * 60 * 1000)) {
      handleSyncApi(true);
    }
  }, []);

  // Clear selection on tab change
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailItem(null);
        setIsConfirmModalOpen(false);
        setIsManualModalOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Data from Global Store
  const availableScraps = useMemo(() => selectGlobalFabricsForBodega(globalItems), [globalItems]);
  const linearOffcuts = useMemo(() => selectGlobalLinearsForBodega(globalItems), [globalItems]);

  const tubeOffcutsCount = useMemo(() => linearOffcuts.filter(l => l.kind === 'tube').length, [linearOffcuts]);
  const bottomOffcutsCount = useMemo(() => linearOffcuts.filter(l => l.kind === 'bottom').length, [linearOffcuts]);

  // Helper to get descriptive name
  const getDisplayName = (f: {family?: string, openness?: string}) => {
    if (!f.family) return '';
    if (f.openness && f.openness !== 'N/A' && f.openness !== 'Standard' && f.openness !== f.family) {
      return `${f.family} ${f.openness}`;
    }
    return f.family;
  };

  const filteredScraps = useMemo(() => {
    let result = availableScraps;
    
    if (statusFilter !== 'all') {
      result = result.filter(f => f.status === statusFilter);
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
  }, [availableScraps, searchQuery, statusFilter]);

  const filteredLinears = useMemo(() => {
    let result = linearOffcuts;

    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) => l.code.toLowerCase().includes(q) || 
               (l.color && l.color.toLowerCase().includes(q))
      );
    }
    return result;
  }, [linearOffcuts, searchQuery, statusFilter]);

  // Checkbox logic
  const currentItems = activeTab === 'fabric' ? filteredScraps : filteredLinears;
  
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(currentItems.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const isAllSelected = currentItems.length > 0 && selectedIds.length === currentItems.length;
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected;

  const performDiscard = (item: any) => {
    return import('../../../lib/inventoryGlobalActions').then(({ createGlobalDiscardPayload }) => {
      const { updatedStatus, movement } = createGlobalDiscardPayload(item, user?.id, 'Descartado manualmente desde Bodega');
      enqueueOperation({ type: 'update_status', itemId: item.id, payload: { status: updatedStatus } });
      enqueueOperation({ type: 'create_movement', payload: movement, itemId: item.id });
      upsertItemLocally({ ...item, status: updatedStatus });
    });
  };

  const handleBulkDiscardConfirm = () => {
    if (isReadOnly) return toast.error('No tienes permisos para modificar el inventario');

    const itemsToDiscard = globalItems.filter(i => selectedIds.includes(i.id));
    if (itemsToDiscard.length === 0) return;

    Promise.all(itemsToDiscard.map(item => performDiscard(item))).then(() => {
      toast.success(`${itemsToDiscard.length} registros dados de baja.`);
      setSelectedIds([]);
      setIsConfirmModalOpen(false);
    });
  };

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
    setSelectedIds([]);
    setSearchQuery('');
    setStatusFilter('available');
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
      setActiveTab('fabric');
    });
  };

  const renderPill = (record: any) => {
    const kind = record.kind || (record.family ? 'fabric' : 'linear');
    if (kind === 'tube') return <span className="pill pill-tube">Tubo</span>;
    if (kind === 'bottom') return <span className="pill pill-bottom">Bottomrail</span>;
    return <span className="pill pill-fabric">Tela</span>;
  };

  const renderStatus = (status: string) => {
    if (status === 'available') return <span className="pill pill-success">Disponible</span>;
    if (status === 'discarded') return <span className="pill pill-discarded">Descartado</span>;
    return <span className="pill pill-discarded">{status}</span>;
  };

  return (
    <section className="page">
      <div className="page-header">
        <div className="InventoryPanelV2__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="InventoryPanelV2__title">
            <h2>Bodega <span>GLOBAL</span></h2>
            <p>Consulta retazos de tela y sobrantes lineales en la base de datos centralizada Supabase.</p>
          </div>
          <div className="InventoryPanelV2__actions" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isReadOnly && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleSyncApi(false)}
                  disabled={isSyncingApi}
                  title="Sincroniza los rollos oficiales de Vertilux hacia la Bodega local para que puedan ser consumidos"
                >
                  <span className={`material-symbols-outlined ${isSyncingApi ? 'spin' : ''}`} style={{ fontSize: 18 }}>
                    sync
                  </span>
                  {isSyncingApi ? 'Sincronizando...' : 'Sincronizar API'}
                </button>
                <span style={{ 
                  position: 'absolute', 
                  top: 'calc(100% + 4px)', 
                  right: 0, 
                  whiteSpace: 'nowrap',
                  fontSize: '11px', 
                  color: 'var(--text-tertiary)', 
                  fontWeight: 500 
                }}>
                  {lastSyncTime ? `Última sincr: ${new Date(lastSyncTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'No sincronizado'}
                </span>
              </div>
            )}
            {!isReadOnly && (
              <button className="btn btn-primary" onClick={() => setIsManualModalOpen(true)}>
                + Registrar manual
              </button>
            )}
            <button className="btn" type="button" onClick={handleExport}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Exportar lista
            </button>
            <button className="btn btn-ghost" type="button" title="Refrescar" onClick={handleRefresh}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>refresh</span>
            </button>
          </div>
        </div>
      </div>

      {migrationStatus.status !== 'completed' && (
        <div className="alert">
          <span className="material-symbols-outlined" style={{color: 'var(--color-warning)'}}>warning</span>
          <span><strong>Atención:</strong> Aún hay datos locales sin migrar. Dirígete a Configuración para empujar tu bodega local hacia la nube global.</span>
        </div>
      )}

      {syncError && (
        <div className="alert" style={{ borderColor: 'rgba(220, 38, 38, 0.28)', borderLeftColor: 'var(--color-danger)', background: 'rgba(220, 38, 38, 0.05)' }}>
          <span className="material-symbols-outlined" style={{color: 'var(--color-danger)'}}>error</span>
          <span><strong>Error de sincronización:</strong> {syncError}</span>
        </div>
      )}

      <div className="metrics" aria-label="Resumen de bodega">
        <article className="metric-card">
          <div className="metric-label">Retazos de tela disponibles</div>
          <div><span className="metric-value"><AnimatedNumber value={availableScraps.length} /></span><span className="metric-unit">retazos</span></div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Sobrantes de tubo disponibles</div>
          <div><span className="metric-value"><AnimatedNumber value={tubeOffcutsCount} /></span><span className="metric-unit">pz</span></div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Sobrantes de bottomrail</div>
          <div><span className="metric-value"><AnimatedNumber value={bottomOffcutsCount} /></span><span className="metric-unit">pz</span></div>
        </article>
      </div>

      <section className="inventory-card">
        <div className="tabs-toolbar">
          <div className="tabs" role="tablist">
            <button 
              className={`tab ${activeTab === 'fabric' ? 'active' : ''}`} 
              type="button" 
              onClick={() => setActiveTab('fabric')}
            >
              Retazos de Tela <span className="count-pill">{availableScraps.length}</span>
            </button>
            <button 
              className={`tab ${activeTab === 'linear' ? 'active' : ''}`} 
              type="button" 
              onClick={() => setActiveTab('linear')}
            >
              Sobrantes Lineales <span className="count-pill">{linearOffcuts.length}</span>
            </button>
          </div>
        </div>

        <div className="toolbar">
          <input 
            className="search" 
            placeholder="Buscar por código, SKU, color o descripción..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select 
            className="select" 
            aria-label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="available">Disponible</option>
            <option value="discarded">Descartado</option>
            <option value="all">Todos los estados</option>
          </select>
        </div>

        <div className={`bulk-bar ${selectedIds.length > 0 ? 'visible' : ''}`}>
          <strong><span>{selectedIds.length}</span> seleccionados</strong>
          <div className="bulk-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setSelectedIds([])}>Cancelar selección</button>
            <button className="btn btn-danger" type="button" onClick={() => setIsConfirmModalOpen(true)}>Dar de baja seleccionados</button>
          </div>
        </div>

        <div className="table-shell">
          <div className="table-scroll">
            <table className="inventory-table" aria-label="Inventario de bodega">
              <colgroup>
                <col style={{ width: '48px', minWidth: '48px' }} />
                <col style={{ width: '150px', minWidth: '150px' }} />
                <col style={{ width: '120px', minWidth: '120px' }} />
                <col style={{ width: '300px', minWidth: '300px' }} />
                <col style={{ width: '150px', minWidth: '150px' }} />
                <col style={{ width: '160px', minWidth: '160px' }} />
                <col style={{ width: '130px', minWidth: '130px' }} />
                <col style={{ width: '130px', minWidth: '130px' }} />
                <col style={{ width: '112px', minWidth: '112px' }} />
              </colgroup>
              <thead style={{ display: 'table-header-group' }}>
                <tr style={{ display: 'table-row' }}>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>
                    <input 
                      type="checkbox" 
                      aria-label="Seleccionar todos los visibles" 
                      checked={isAllSelected}
                      ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Código</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Tipo</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Descripción</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Medida</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Origen</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Fecha</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Estado</th>
                  <th style={{ display: 'table-cell', position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-dim, #f4f5f7)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div className="empty-state">No se encontraron registros para esta vista.</div>
                    </td>
                  </tr>
                ) : (
                  currentItems.map(item => {
                    const itemAsAny = item as any;
                    const isTela = activeTab === 'fabric';
                    const descripcion = isTela ? `${itemAsAny.family || ''} - ${itemAsAny.color || ''}`.replace(/^- | -$/g, '') : (itemAsAny.description || itemAsAny.family || itemAsAny.color || 'Sobrante Lineal');
                    const medida = isTela ? `${formatNumber(itemAsAny.widthMeters)}m x ${formatNumber(itemAsAny.lengthMeters)}m` : `${toFT(itemAsAny.remainingLengthM)} FT / ${formatNumber(itemAsAny.remainingLengthM)}m`;
                    const origen = isTela ? (itemAsAny.orderNumber || 'Corte de Prod.') : (itemAsAny.sourceOrderNumber || 'Corte de Prod.');
                    const isSelected = selectedIds.includes(item.id);

                    return (
                      <tr key={item.id} className={isSelected ? 'selected' : ''}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => handleSelectRow(item.id, e)}
                            aria-label={`Seleccionar ${item.code}`} 
                          />
                        </td>
                        <td className="code" title={item.code}>{item.code}</td>
                        <td title={item.kind}>{renderPill(item)}</td>
                        <td title={descripcion}>{descripcion}</td>
                        <td title={medida}>{medida}</td>
                        <td title={origen}>{origen}</td>
                        <td title={item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td title={item.status}>{renderStatus(item.status)}</td>
                        <td>
                          <div className="row-actions">
                            <button 
                              className="icon-btn" 
                              type="button" 
                              title="Ver detalle" 
                              aria-label="Ver detalle"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setDetailItem({
                                  ...item, 
                                  _medida: medida, 
                                  _descripcion: descripcion, 
                                  _origen: origen,
                                  _isTela: isTela,
                                  _family: itemAsAny.family,
                                  _color: itemAsAny.color,
                                  _openness: itemAsAny.openness,
                                  _width: itemAsAny.widthMeters,
                                  _length: itemAsAny.lengthMeters,
                                  _remainingLength: itemAsAny.remainingLengthM,
                                  _order: itemAsAny.orderNumber || itemAsAny.sourceOrderNumber,
                                  _sku: isTela ? getFabricSku(itemAsAny.family, itemAsAny.color, itemAsAny.openness) : undefined
                                }); 
                              }}
                            >
                              <span className="material-symbols-outlined">visibility</span>
                            </button>
                            <button 
                              className="icon-btn" 
                              type="button" 
                              title="Dar de baja" 
                              aria-label="Dar de baja"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedIds([item.id]); 
                                setIsConfirmModalOpen(true); 
                              }}
                            >
                              <span className="material-symbols-outlined" style={{color: 'var(--color-danger)'}}>delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* DETAIL MODAL */}
      {detailItem && (
        <div className="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="detailTitle" onClick={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 id="detailTitle" style={{margin:0, fontSize:'20px'}}>Detalle del registro</h2>
              <p style={{margin:'4px 0 0', color:'var(--color-text-muted)', fontSize:'14px', fontWeight:600}}>{detailItem.code}</p>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h3>Resumen</h3>
                <div className="detail-grid">
                  <span>Código</span><strong>{detailItem.code}</strong>
                  <span>Tipo</span><strong>{detailItem._isTela ? 'Retazo de tela' : (detailItem.kind === 'tube' ? 'Sobrante de Tubo' : 'Sobrante de Bottomrail')}</strong>
                  <span>Estado</span><strong>{renderStatus(detailItem.status)}</strong>
                  <span>Fecha gen.</span><strong>{detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleDateString() : '—'}</strong>
                </div>
              </div>

              <div className="detail-section">
                <h3>Material</h3>
                <div className="detail-grid">
                  {detailItem._descripcion !== detailItem.code && (
                    <><span>Descripción</span><strong>{detailItem._descripcion}</strong></>
                  )}
                  {detailItem._color && (
                    <><span>Color / Tono</span><strong>{detailItem._color}</strong></>
                  )}
                  {detailItem._sku && detailItem._sku !== 'No registrado' && (
                    <><span>SKU original</span><strong>{detailItem._sku}</strong></>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h3>Medidas</h3>
                <div className="detail-grid">
                  {detailItem._isTela ? (
                    <>
                      {detailItem._width > 0 && <><span>Ancho</span><strong>{formatNumber(detailItem._width)} m</strong></>}
                      {detailItem._length > 0 && <><span>Largo</span><strong>{formatNumber(detailItem._length)} m</strong></>}
                      {(detailItem._width > 0 && detailItem._length > 0) && (
                        <><span>Área</span><strong>{formatNumber(detailItem._width * detailItem._length)} m²</strong></>
                      )}
                    </>
                  ) : (
                    <>
                      {detailItem._remainingLength > 0 && <><span>Longitud</span><strong>{toFT(detailItem._remainingLength)} FT / {formatNumber(detailItem._remainingLength)} m</strong></>}
                    </>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h3>Origen</h3>
                <div className="detail-grid">
                  <span>Generado por</span><strong>{detailItem._origen}</strong>
                  {detailItem._order && detailItem._order !== 'Corte de Prod.' && detailItem._origen !== detailItem._order && (
                    <><span>Orden</span><strong>{detailItem._order}</strong></>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" onClick={() => setDetailItem(null)}>Cerrar</button>
              <button className="btn btn-danger" type="button" onClick={() => {
                setSelectedIds([detailItem.id]);
                setDetailItem(null);
                setIsConfirmModalOpen(true);
              }}>Dar de baja</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DISCARD MODAL */}
      {isConfirmModalOpen && (
        <div className="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" onClick={(e) => { if (e.target === e.currentTarget) setIsConfirmModalOpen(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 id="confirmTitle" style={{margin:0, fontSize:'20px'}}>Confirmar baja</h2>
            </div>
            <div className="modal-body">
              <p style={{margin:0}}>
                ¿Dar de baja {selectedIds.length === 1 ? 'el registro seleccionado' : `los ${selectedIds.length} registros seleccionados`}? Esta acción lo(s) marcará como descartado(s) y no lo(s) eliminará físicamente.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" onClick={() => setIsConfirmModalOpen(false)}>Cancelar</button>
              <button className="btn btn-danger" type="button" onClick={handleBulkDiscardConfirm} disabled={isReadOnly}>Confirmar baja</button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL RECORD MODAL (Re-styled) */}
      {isManualModalOpen && (
        <div className="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="manualTitle" onClick={(e) => { if (e.target === e.currentTarget) setIsManualModalOpen(false); }}>
          <div className="modal" style={{maxWidth: '640px'}}>
            <div className="modal-header">
              <h2 id="manualTitle" style={{margin:0, fontSize:'20px'}}>Registrar retazo manual</h2>
              <p style={{margin:'4px 0 0', color:'var(--color-text-muted)', fontSize:'14px'}}>Ingresa los detalles para registrar un retazo físico en Bodega.</p>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Código</span>
                    <input type="text" className="search" value={manualForm.code} onChange={e => setManualForm({...manualForm, code: e.target.value})} placeholder="Autogenerado si está vacío" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Familia / Línea</span>
                    <input type="text" className="search" value={manualForm.family} onChange={e => setManualForm({...manualForm, family: e.target.value})} placeholder="Ej. Screen, Rollux..." />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Color / Descripción *</span>
                    <input type="text" className="search" value={manualForm.color} onChange={e => setManualForm({...manualForm, color: e.target.value})} placeholder="Color o descripción" required />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Ancho (Mts) *</span>
                    <input type="number" step="0.01" className="search" value={manualForm.widthMeters} onChange={e => setManualForm({...manualForm, widthMeters: e.target.value})} placeholder="Ej. 1.5" required />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Alto (Mts) *</span>
                    <input type="number" step="0.01" className="search" value={manualForm.lengthMeters} onChange={e => setManualForm({...manualForm, lengthMeters: e.target.value})} placeholder="Ej. 2.0" required />
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsManualModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar retazo</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
}
