import { useMemo, useState, useEffect } from 'react';
import { animate } from 'framer-motion';
import { useCalculatorStore } from '../store/useCalculatorStore';
import { formatNumber, formatDate } from '../../../lib/format';
import { YARD2_PER_M2 } from '../utils';
import './InventoryPanelV2.css';

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
  const inventory = useCalculatorStore((state) => state.productionInventory);
  const movements = useCalculatorStore((state) => state.inventoryMovements);
  const discardInventoryItem = useCalculatorStore((state) => state.discardInventoryItem);

  const [activeTab, setActiveTab] = useState<'telas' | 'lineales' | 'historial'>('telas');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Filter only items that are "scrap" or "offcut" and available
  const availableScraps = useMemo(
    () => inventory.fabrics.filter((item) => item.kind === 'scrap' && item.status === 'available'),
    [inventory.fabrics],
  );

  const tubeOffcuts = useMemo(
    () => inventory.tubes.filter((item) => item.kind === 'offcut' && item.status === 'available'),
    [inventory.tubes],
  );

  const bottomOffcuts = useMemo(
    () => inventory.bottoms.filter((item) => item.kind === 'offcut' && item.status === 'available'),
    [inventory.bottoms],
  );

  // Filter history related to scrap AND date range
  const scrapHistory = useMemo(() => {
    return movements.filter(m => {
      const isScrapAction = 
        m.action === 'create_scrap' || 
        m.action === 'use_scrap' || 
        (m.action === 'discard' && m.itemCode.startsWith('RET')) ||
        (m.action === 'discard' && m.itemCode.startsWith('SOB'));
        
      if (!isScrapAction) return false;

      const movDate = new Date(m.createdAt).getTime();
      
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00`).getTime();
        if (movDate < start) return false;
      }
      
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999`).getTime();
        if (movDate > end) return false;
      }

      return true;
    });
  }, [movements, startDate, endDate]);

  // Metrics
  const totalScrapArea = availableScraps.reduce((sum, item) => sum + item.widthMeters * item.lengthMeters, 0);
  const totalScrapValue = availableScraps.reduce((sum, item) => sum + item.widthMeters * item.lengthMeters * YARD2_PER_M2 * item.costPerYd2, 0);
  const totalTubeMeters = tubeOffcuts.reduce((sum, item) => sum + item.lengthMeters, 0);
  const totalBottomMeters = bottomOffcuts.reduce((sum, item) => sum + item.lengthMeters, 0);

  // Group history by date for calendar-like view
  const historyByDate = useMemo(() => {
    const groups: Record<string, {
      date: string;
      fabricCreatedM2: number;
      linearCreatedM: number;
      fabricUsedM2: number;
      movements: typeof movements;
    }> = {};

    scrapHistory.forEach(m => {
      // Use YYYY-MM-DD for stable grouping, then format for display
      const dateObj = new Date(m.createdAt);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          fabricCreatedM2: 0,
          linearCreatedM: 0,
          fabricUsedM2: 0,
          movements: []
        };
      }

      groups[dateKey].movements.push(m);

      if (m.action === 'create_scrap') {
        if (m.unit === 'm2') groups[dateKey].fabricCreatedM2 += m.quantity;
        if (m.unit === 'm') groups[dateKey].linearCreatedM += m.quantity;
      } else if (m.action === 'use_scrap' && m.unit === 'm2') {
        groups[dateKey].fabricUsedM2 += m.quantity;
      }
    });

    return Object.values(groups).sort((a, b) => new Date(b.movements[0].createdAt).getTime() - new Date(a.movements[0].createdAt).getTime());
  }, [scrapHistory]);

  const handleDiscard = (id: string, category: 'fabric' | 'tube' | 'bottom') => {
    if (window.confirm('¿Dar de baja este sobrante? Se registrará como descarte.')) {
      discardInventoryItem(id, category);
    }
  };

  const getActionBadge = (action: string) => {
    if (action === 'create_scrap') return <span className="iv2-badge iv2-badge--create">Nuevo Retazo</span>;
    if (action === 'use_scrap') return <span className="iv2-badge iv2-badge--use">Reutilizado</span>;
    if (action === 'discard') return <span className="iv2-badge iv2-badge--discard">Dado de Baja</span>;
    return <span className="iv2-badge">{action}</span>;
  };

  return (
    <section className="inventory-v2-page">
      <div className="iv2-summary-grid">
        <div className="iv2-metric-card iv2-metric-card--accent">
          <span className="iv2-metric-eyebrow" style={{ color: 'var(--color-primary-600)' }}>Valor Recuperable (Tela)</span>
          <strong className="iv2-metric-value" style={{ color: 'var(--color-primary-700)' }}>$<AnimatedNumber value={totalScrapValue} /></strong>
          <span className="iv2-metric-subtext">{formatNumber(totalScrapArea)} m2 en {availableScraps.length} retazos útiles</span>
        </div>
        <div className="iv2-metric-card">
          <span className="iv2-metric-eyebrow" style={{ color: '#d97706' }}>Sobrantes de Tubo</span>
          <strong className="iv2-metric-value" style={{ color: '#f59e0b' }}><AnimatedNumber value={totalTubeMeters} /> m</strong>
          <span className="iv2-metric-subtext">{tubeOffcuts.length} piezas reutilizables</span>
        </div>
        <div className="iv2-metric-card">
          <span className="iv2-metric-eyebrow" style={{ color: '#4338ca' }}>Sobrantes de Bottom</span>
          <strong className="iv2-metric-value" style={{ color: '#6366f1' }}><AnimatedNumber value={totalBottomMeters} /> m</strong>
          <span className="iv2-metric-subtext">{bottomOffcuts.length} piezas reutilizables</span>
        </div>
      </div>

      <div className="iv2-tabs">
        <button 
          className={`iv2-tab ${activeTab === 'telas' ? 'iv2-tab--active' : ''}`}
          onClick={() => setActiveTab('telas')}
        >
          Retazos de Tela
        </button>
        <button 
          className={`iv2-tab ${activeTab === 'lineales' ? 'iv2-tab--active' : ''}`}
          onClick={() => setActiveTab('lineales')}
        >
          Sobrantes Lineales
        </button>
        <button 
          className={`iv2-tab ${activeTab === 'historial' ? 'iv2-tab--active' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          Historial de Merma
        </button>
      </div>

      <div className="iv2-content">
        {activeTab === 'telas' && (
          <>
            <div className="iv2-table-header">
              <span>Código / Tela</span>
              <span>Ancho</span>
              <span>Caída</span>
              <span>Área / Valor</span>
              <span>Acciones</span>
            </div>
            <div className="iv2-table-body">
              {availableScraps.length === 0 ? (
                <div className="iv2-empty">No hay retazos de tela disponibles.</div>
              ) : (
                availableScraps.map(fabric => (
                  <div key={fabric.id} className="iv2-table-row">
                    <div className="iv2-cell-main" data-label="Código / Tela">
                      <div>
                        <strong>{fabric.code}</strong><br/>
                        <span>{fabric.family ? `${fabric.family} - ${fabric.color}` : fabric.color}</span>
                      </div>
                    </div>
                    <div className="iv2-cell" data-label="Ancho">{formatNumber(fabric.widthMeters)} m</div>
                    <div className="iv2-cell" data-label="Caída">{formatNumber(fabric.lengthMeters)} m</div>
                    <div className="iv2-cell-main" data-label="Área / Valor">
                      <div>
                        <strong>{formatNumber(fabric.widthMeters * fabric.lengthMeters)} m2</strong><br/>
                        <span>${formatNumber(fabric.widthMeters * fabric.lengthMeters * YARD2_PER_M2 * fabric.costPerYd2)}</span>
                      </div>
                    </div>
                    <div className="iv2-cell" data-label="Acciones">
                      <button className="iv2-btn-discard" onClick={() => handleDiscard(fabric.id, 'fabric')}>
                        Dar de baja
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'lineales' && (
          <>
            <div className="iv2-table-header">
              <span>Código / Tipo</span>
              <span>Largo</span>
              <span>Origen</span>
              <span>Estado</span>
              <span>Acciones</span>
            </div>
            <div className="iv2-table-body">
              {tubeOffcuts.length === 0 && bottomOffcuts.length === 0 ? (
                <div className="iv2-empty">No hay sobrantes lineales disponibles.</div>
              ) : (
                <>
                  {tubeOffcuts.map(tube => (
                    <div key={tube.id} className="iv2-table-row">
                      <div className="iv2-cell-main" data-label="Código / Tipo">
                        <div>
                          <strong>{tube.code}</strong><br/>
                          <span className="iv2-badge iv2-badge--tube" style={{width: 'fit-content'}}>Tubo</span>
                        </div>
                      </div>
                      <div className="iv2-cell" data-label="Largo"><strong>{formatNumber(tube.lengthMeters)} m</strong></div>
                      <div className="iv2-cell" data-label="Origen">Corte de Producción</div>
                      <div className="iv2-cell" data-label="Estado" style={{color: '#10b981'}}>Disponible</div>
                      <div className="iv2-cell" data-label="Acciones">
                        <button className="iv2-btn-discard" onClick={() => handleDiscard(tube.id, 'tube')}>
                          Dar de baja
                        </button>
                      </div>
                    </div>
                  ))}
                  {bottomOffcuts.map(bottom => (
                    <div key={bottom.id} className="iv2-table-row">
                      <div className="iv2-cell-main" data-label="Código / Tipo">
                        <div>
                          <strong>{bottom.code}</strong><br/>
                          <span className="iv2-badge iv2-badge--bottom" style={{width: 'fit-content'}}>Bottom Rail</span>
                        </div>
                      </div>
                      <div className="iv2-cell" data-label="Largo"><strong>{formatNumber(bottom.lengthMeters)} m</strong></div>
                      <div className="iv2-cell" data-label="Origen">Corte de Producción</div>
                      <div className="iv2-cell" data-label="Estado" style={{color: '#10b981'}}>Disponible</div>
                      <div className="iv2-cell" data-label="Acciones">
                        <button className="iv2-btn-discard" onClick={() => handleDiscard(bottom.id, 'bottom')}>
                          Dar de baja
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {activeTab === 'historial' && (
          <div className="iv2-history-timeline">
            <div className="iv2-history-filters">
              <div className="iv2-filter-group">
                <label>Desde:</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="iv2-date-input"
                />
              </div>
              <div className="iv2-filter-group">
                <label>Hasta:</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="iv2-date-input"
                />
              </div>
              {(startDate || endDate) && (
                <button 
                  className="iv2-btn-clear-filters"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                >
                  Limpiar
                </button>
              )}
            </div>
            
            {historyByDate.length === 0 ? (
              <div className="iv2-empty">No hay historial de movimientos de merma.</div>
            ) : (
              historyByDate.map(dayGroup => (
                <div key={dayGroup.date} className="iv2-history-day">
                  <div className="iv2-history-day-header">
                    <h3 className="iv2-history-date" style={{textTransform: 'capitalize'}}>{dayGroup.date}</h3>
                    <div className="iv2-history-day-summary">
                      {dayGroup.fabricCreatedM2 > 0 && (
                        <span className="iv2-badge iv2-badge--fabric">Generó {formatNumber(dayGroup.fabricCreatedM2)} m2 Tela</span>
                      )}
                      {dayGroup.linearCreatedM > 0 && (
                        <span className="iv2-badge iv2-badge--tube">Generó {formatNumber(dayGroup.linearCreatedM)} m Lineales</span>
                      )}
                      {dayGroup.fabricUsedM2 > 0 && (
                        <span className="iv2-badge iv2-badge--use">Reutilizó {formatNumber(dayGroup.fabricUsedM2)} m2 Tela</span>
                      )}
                    </div>
                  </div>
                  <div className="iv2-history-day-body">
                    {(() => {
                      const fabricMovements = dayGroup.movements.filter(m => m.category === 'fabric');
                      const linearMovements = dayGroup.movements.filter(m => m.category === 'tube' || m.category === 'bottom');

                      const renderTable = (movs: typeof dayGroup.movements) => (
                        <>
                          <div className="iv2-table-header iv2-table-header--history">
                            <span>Hora</span>
                            <span>Ítem</span>
                            <span>Acción</span>
                            <span>Cantidad</span>
                            <span>Notas / Orden</span>
                          </div>
                          {movs.map(mov => {
                            const time = new Date(mov.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <div key={mov.id} className="iv2-table-row iv2-table-row--history">
                                <div className="iv2-cell-main" data-label="Hora">
                                  <div>
                                    <strong>{time}</strong>
                                  </div>
                                </div>
                                <div className="iv2-cell-main" data-label="Ítem">
                                  <div>
                                    <strong>{mov.itemCode}</strong><br/>
                                    <span>{mov.itemLabel}</span>
                                  </div>
                                </div>
                                <div className="iv2-cell" data-label="Acción">
                                  {getActionBadge(mov.action)}
                                </div>
                                <div className="iv2-cell" data-label="Cantidad">
                                  <strong>{formatNumber(mov.quantity)} {mov.unit}</strong>
                                </div>
                                <div className="iv2-cell-main" data-label="Notas / Orden">
                                  <div>
                                    <strong>{mov.orderNumber || 'Limpieza / Ajuste'}</strong><br/>
                                    {mov.notes && <span style={{fontSize: '0.7rem'}}>{mov.notes}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      );

                      return (
                        <>
                          {fabricMovements.length > 0 && (
                            <div className="iv2-history-subcategory">
                              <h4 className="iv2-history-subcategory-title">Telas</h4>
                              {renderTable(fabricMovements)}
                            </div>
                          )}
                          {linearMovements.length > 0 && (
                            <div className="iv2-history-subcategory">
                              <h4 className="iv2-history-subcategory-title">Tubos y Bottoms</h4>
                              {renderTable(linearMovements)}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
