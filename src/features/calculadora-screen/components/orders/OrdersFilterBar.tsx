import { Button } from '../../../../components/ui/Button';
import type { OrderStatusFilter } from './utils/orderSearch';

interface Props {
  query: string;
  setQuery: (query: string) => void;
  statusFilter: OrderStatusFilter;
  setStatusFilter: (status: OrderStatusFilter) => void;
  onExportSage: () => void;
  exportableSageCount: number;
  isReadOnly: boolean;
}

export function OrdersFilterBar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  onExportSage,
  exportableSageCount,
  isReadOnly
}: Props) {
  return (
    <div className="orders-table-header">
      <div className="orders-table-title">
        <h1>Órdenes de Producción</h1>
      </div>
      <div className="orders-table-actions">
        <div className="orders-search-bar">
          <span className="material-symbols-outlined" style={{ color: 'var(--muted)' }}>search</span>
          <input
            type="text"
            placeholder="Buscar órdenes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="orders-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatusFilter)}
        >
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="ready_for_production">Lista para prod.</option>
          <option value="in_production">En producción</option>
          <option value="materials_checked">Revisada</option>
          <option value="sent_to_sage">Sage</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <Button variant="secondary" onClick={onExportSage} disabled={exportableSageCount === 0 || isReadOnly}>
          Exportar a Sage ({exportableSageCount})
        </Button>
        <Button variant="primary" onClick={() => {
          alert('Para nueva orden, navega a la pestaña de Cotizador e ingresa los datos.');
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 4 }}>add</span>
          Nueva Orden
        </Button>
      </div>
    </div>
  );
}
