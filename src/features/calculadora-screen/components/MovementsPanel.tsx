import { useMemo, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import type { InventoryMovement } from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';

interface MovementsPanelProps {
  movements: InventoryMovement[];
}

type MovementFilter =
  | 'all'
  | 'fabric'
  | 'tube'
  | 'bottom'
  | 'component'
  | 'scraps'
  | 'discard';

interface MovementGroup {
  key: string;
  orderNumber: string;
  createdAt: string;
  entries: InventoryMovement[];
}

function getFilterLabel(filter: MovementFilter) {
  switch (filter) {
    case 'fabric':
      return 'Tela';
    case 'tube':
      return 'Tubo';
    case 'bottom':
      return 'Bottom';
    case 'component':
      return 'Componentes';
    case 'scraps':
      return 'Retazos';
    case 'discard':
      return 'Descartes';
    default:
      return 'Todos';
  }
}

function matchesFilter(movement: InventoryMovement, filter: MovementFilter) {
  switch (filter) {
    case 'fabric':
    case 'tube':
    case 'bottom':
    case 'component':
      return movement.category === filter;
    case 'scraps':
      return movement.action === 'create_scrap' || movement.action === 'use_scrap';
    case 'discard':
      return movement.action === 'discard';
    default:
      return true;
  }
}

function toHumanAction(movement: InventoryMovement) {
  const amount = `${formatNumber(movement.quantity)} ${movement.unit}`;

  if (movement.category === 'order' && movement.action === 'create_order') {
    return `Se registro la orden con ${amount}.`;
  }

  if (movement.action === 'consume') {
    switch (movement.category) {
      case 'fabric':
        return `Se consumieron ${amount} de tela.`;
      case 'tube':
        return `Se consumieron ${amount} de tubo.`;
      case 'bottom':
        return `Se consumieron ${amount} de bottom.`;
      case 'component':
        return `Se descontaron ${amount} de ${movement.itemLabel}.`;
      default:
        return `Se consumieron ${amount}.`;
    }
  }

  if (movement.action === 'create_scrap') {
    if (movement.category === 'fabric') {
      return `Se genero un retazo util de ${movement.notes || amount}.`;
    }

    return `Se genero un sobrante reutilizable de ${amount}.`;
  }

  if (movement.action === 'use_scrap') {
    return 'Se utilizo un retazo existente para esta orden.';
  }

  if (movement.action === 'discard') {
    return `Se descarto ${amount} por no ser utilizable.`;
  }

  if (movement.action === 'reserve') {
    return `Se reservo ${amount}.`;
  }

  return `${movement.action} - ${amount}.`;
}

function groupMovements(movements: InventoryMovement[]): MovementGroup[] {
  const groups = new Map<string, MovementGroup>();

  movements.forEach((movement) => {
    const key = movement.orderId ?? movement.id;
    const existing = groups.get(key);

    if (existing) {
      existing.entries.push(movement);
      return;
    }

    groups.set(key, {
      key,
      orderNumber: movement.orderNumber || 'Sin orden',
      createdAt: movement.createdAt,
      entries: [movement],
    });
  });

  return [...groups.values()];
}

function getGroupMetrics(entries: InventoryMovement[]) {
  const fabric = entries
    .filter((entry) => entry.category === 'fabric' && entry.action === 'consume')
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const tube = entries
    .filter((entry) => entry.category === 'tube' && entry.action === 'consume')
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const bottom = entries
    .filter((entry) => entry.category === 'bottom' && entry.action === 'consume')
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const scraps = entries.filter(
    (entry) => entry.action === 'create_scrap' || entry.action === 'use_scrap',
  ).length;

  return { fabric, tube, bottom, scraps };
}

export function MovementsPanel({ movements }: MovementsPanelProps) {
  const [activeFilter, setActiveFilter] = useState<MovementFilter>('all');

  const filteredMovements = useMemo(
    () => movements.filter((movement) => matchesFilter(movement, activeFilter)),
    [activeFilter, movements],
  );

  const groups = useMemo(() => groupMovements(filteredMovements), [filteredMovements]);

  const filterOptions: MovementFilter[] = [
    'all',
    'fabric',
    'tube',
    'bottom',
    'component',
    'scraps',
    'discard',
  ];

  return (
    <Card className="history-panel bitacora-panel">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Bitacora</span>
          <h2>Movimientos de produccion</h2>
        </div>
      </div>

      <div className="bitacora-filters">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            type="button"
            className={[
              'bitacora-filter',
              activeFilter === filter ? 'bitacora-filter--active' : '',
            ].join(' ')}
            onClick={() => setActiveFilter(filter)}
          >
            {getFilterLabel(filter)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="history-panel__empty">
          Aun no hay movimientos para este filtro. Cuando guardes una orden, aqui veras el
          consumo, los sobrantes y los descartes.
        </p>
      ) : (
        <div className="bitacora-groups">
          {groups.map((group) => {
            const metrics = getGroupMetrics(group.entries);

            return (
              <article key={group.key} className="bitacora-group">
                <div className="bitacora-group__header">
                  <div>
                    <strong>{group.orderNumber}</strong>
                    <span>{formatDate(group.createdAt)}</span>
                  </div>
                  <div className="bitacora-group__metrics">
                    {metrics.fabric > 0 ? (
                      <span>{formatNumber(metrics.fabric)} m tela</span>
                    ) : null}
                    {metrics.tube > 0 ? (
                      <span>{formatNumber(metrics.tube)} m tubo</span>
                    ) : null}
                    {metrics.bottom > 0 ? (
                      <span>{formatNumber(metrics.bottom)} m bottom</span>
                    ) : null}
                    {metrics.scraps > 0 ? <span>{metrics.scraps} eventos de retazo</span> : null}
                  </div>
                </div>

                <div className="bitacora-entry-list">
                  {group.entries.map((movement) => (
                    <div key={movement.id} className="bitacora-entry">
                      <div className="bitacora-entry__tag">
                        {movement.category === 'order' ? 'orden' : movement.category}
                      </div>
                      <div className="bitacora-entry__content">
                        <strong>{movement.itemLabel}</strong>
                        <p>{toHumanAction(movement)}</p>
                        {movement.notes ? <span>{movement.notes}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
