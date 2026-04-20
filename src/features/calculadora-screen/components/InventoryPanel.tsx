import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type {
  InventoryMovement,
  ProductionInventory,
} from '../../../domain/curtains/types';
import { formatDate, formatNumber } from '../../../lib/format';
import { getSuggestedScreenRollCosts } from '../../../lib/priceCatalog';

interface InventoryPanelProps {
  inventory: ProductionInventory;
  movements: InventoryMovement[];
  onSaveRollCosts: (costsByWidth: Record<string, number>) => void;
}

function isAvailable(status: string) {
  return status === 'available';
}

export function InventoryPanel({
  inventory,
  movements,
  onSaveRollCosts,
}: InventoryPanelProps) {
  const availableRolls = useMemo(
    () =>
      inventory.fabrics.filter(
        (item) => item.kind === 'roll' && isAvailable(item.status),
      ),
    [inventory.fabrics],
  );
  const availableScraps = useMemo(
    () =>
      inventory.fabrics.filter(
        (item) => item.kind === 'scrap' && isAvailable(item.status),
      ),
    [inventory.fabrics],
  );
  const tubeBars = useMemo(
    () => inventory.tubes.filter((item) => item.kind === 'bar' && isAvailable(item.status)),
    [inventory.tubes],
  );
  const tubeOffcuts = useMemo(
    () =>
      inventory.tubes.filter(
        (item) => item.kind === 'offcut' && isAvailable(item.status),
      ),
    [inventory.tubes],
  );
  const bottomBars = useMemo(
    () =>
      inventory.bottoms.filter((item) => item.kind === 'bar' && isAvailable(item.status)),
    [inventory.bottoms],
  );
  const bottomOffcuts = useMemo(
    () =>
      inventory.bottoms.filter(
        (item) => item.kind === 'offcut' && isAvailable(item.status),
      ),
    [inventory.bottoms],
  );
  const lastMovement = movements[0] ?? null;
  const [draftCostsByWidth, setDraftCostsByWidth] = useState<Record<string, string>>({});
  const catalogRollSuggestions = useMemo(() => getSuggestedScreenRollCosts(), []);

  const totalScrapArea = availableScraps.reduce(
    (sum, item) => sum + item.widthMeters * item.lengthMeters,
    0,
  );
  const totalTubeOffcutMeters = tubeOffcuts.reduce((sum, item) => sum + item.lengthMeters, 0);
  const totalBottomOffcutMeters = bottomOffcuts.reduce(
    (sum, item) => sum + item.lengthMeters,
    0,
  );
  const rollCostProfiles = useMemo(() => {
    const groups = new Map<
      string,
      { widthMeters: number; costPerYd2: number; rolls: number }
    >();

    availableRolls.forEach((roll) => {
      const key = roll.widthMeters.toFixed(2);
      const existing = groups.get(key);

      if (existing) {
        existing.rolls += 1;
        return;
      }

      groups.set(key, {
        widthMeters: roll.widthMeters,
        costPerYd2: roll.costPerYd2,
        rolls: 1,
      });
    });

    return [...groups.values()].sort((left, right) => left.widthMeters - right.widthMeters);
  }, [availableRolls]);
  const suggestedCostByWidth = useMemo(
    () =>
      Object.fromEntries(
        catalogRollSuggestions.map((profile) => [
          profile.widthMeters.toFixed(2),
          profile,
        ]),
      ),
    [catalogRollSuggestions],
  );

  useEffect(() => {
    setDraftCostsByWidth(buildDraftCostsByWidth(rollCostProfiles));
  }, [rollCostProfiles]);

  const hasUnsavedChanges = rollCostProfiles.some((profile) => {
    const key = profile.widthMeters.toFixed(2);
    return (draftCostsByWidth[key] ?? profile.costPerYd2.toFixed(2)) !== profile.costPerYd2.toFixed(2);
  });

  const handleDraftCostChange = (widthKey: string, value: string) => {
    setDraftCostsByWidth((current) => ({
      ...current,
      [widthKey]: value,
    }));
  };

  const handleSaveRollCosts = () => {
    const nextCosts = rollCostProfiles.reduce<Record<string, number>>((accumulator, profile) => {
      const key = profile.widthMeters.toFixed(2);
      const parsedValue = Number(draftCostsByWidth[key]);

      accumulator[key] =
        Number.isNaN(parsedValue) || parsedValue < 0 ? profile.costPerYd2 : parsedValue;

      return accumulator;
    }, {});

    onSaveRollCosts(nextCosts);
  };

  const handleApplyCatalogCosts = () => {
    setDraftCostsByWidth(
      Object.fromEntries(
        rollCostProfiles.map((profile) => {
          const key = profile.widthMeters.toFixed(2);
          const suggestion = suggestedCostByWidth[key];

          return [key, (suggestion?.suggestedCostPerYd2 ?? profile.costPerYd2).toFixed(2)];
        }),
      ),
    );
  };

  return (
    <section className="inventory-page">
      <Card className="inventory-card">
        <div className="inventory-pricing">
          <div className="inventory-pricing__header">
            <div className="inventory-pricing__intro">
              <span className="section-heading__eyebrow">Bodega</span>
              <h2>Bodega de produccion</h2>
              <p className="rules-panel__copy">
                Centraliza aqui el costo por yarda cuadrada de cada ancho de rollo. Al
                guardar, estos valores alimentan los costos del resto del sistema.
              </p>
            </div>
            <div className="inventory-pricing__header-side">
              <div className="inventory-pricing__status">
                <span>Estado</span>
                <strong>{hasUnsavedChanges ? 'Cambios pendientes' : 'Costos al dia'}</strong>
                <small>
                  {rollCostProfiles.length} perfil{rollCostProfiles.length === 1 ? '' : 'es'} de
                  costo activos
                </small>
              </div>

              <div className="inventory-pricing__actions">
                <Button
                  type="button"
                  onClick={handleSaveRollCosts}
                  disabled={rollCostProfiles.length === 0 || !hasUnsavedChanges}
                >
                  Guardar costos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleApplyCatalogCosts}
                  disabled={catalogRollSuggestions.length === 0}
                >
                  Aplicar base de precios
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDraftCostsByWidth(buildDraftCostsByWidth(rollCostProfiles))
                  }
                  disabled={!hasUnsavedChanges}
                >
                  Descartar cambios
                </Button>
              </div>
            </div>
          </div>

          <div className="inventory-pricing__layout">
            {rollCostProfiles.length === 0 ? (
              <p className="history-panel__empty">No hay rollos disponibles para configurar costos.</p>
            ) : (
              <div className="inventory-pricing__grid">
                {rollCostProfiles.map((profile) => {
                  const widthKey = profile.widthMeters.toFixed(2);

                  return (
                    <article key={widthKey} className="inventory-pricing-card">
                      <div className="inventory-pricing-card__top">
                        <span className="inventory-pricing-card__eyebrow">Perfil de costo</span>
                        <strong>Rollo {formatNumber(profile.widthMeters)} m</strong>
                        <p>{profile.rolls} rollo(s) disponibles usan este valor base.</p>
                      </div>

                      <label className="inventory-pricing-card__field">
                        <span>Costo por yarda cuadrada</span>
                        <div className="inventory-pricing-card__input-wrap">
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftCostsByWidth[widthKey] ?? profile.costPerYd2.toFixed(2)}
                            onChange={(event) =>
                              handleDraftCostChange(widthKey, event.target.value)
                            }
                          />
                        </div>
                      </label>

                      <div className="inventory-pricing-card__meta">
                        <div>
                          <span>Fuente</span>
                          <strong>Bodega</strong>
                        </div>
                        <div>
                          <span>Ancho activo</span>
                          <strong>{formatNumber(profile.widthMeters)} m</strong>
                        </div>
                      </div>

                      {suggestedCostByWidth[widthKey] ? (
                        <div className="inventory-pricing-card__meta">
                          <div>
                            <span>Sugerido por catalogo</span>
                            <strong>
                              ${formatNumber(suggestedCostByWidth[widthKey].suggestedCostPerYd2)}
                            </strong>
                          </div>
                          <div>
                            <span>Items fuente</span>
                            <strong>{suggestedCostByWidth[widthKey].sourceItems}</strong>
                          </div>
                        </div>
                      ) : (
                        <p className="rules-panel__copy">
                          No encontramos un precio sugerido para este ancho en la base importada.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="summary-grid summary-grid--compact inventory-summary-grid">
              <div className="summary-card summary-card--accent">
                <span>Rollos</span>
                <strong>{availableRolls.length}</strong>
              </div>
              <div className="summary-card summary-card--accent">
                <span>Retazos</span>
                <strong>{availableScraps.length}</strong>
                <small>{formatNumber(totalScrapArea)} m2</small>
              </div>
              <div className="summary-card">
                <span>Merma tubo</span>
                <strong>{tubeOffcuts.length}</strong>
                <small>{formatNumber(totalTubeOffcutMeters)} m</small>
              </div>
              <div className="summary-card">
                <span>Merma bottom</span>
                <strong>{bottomOffcuts.length}</strong>
                <small>{formatNumber(totalBottomOffcutMeters)} m</small>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="inventory-sections">
        <details className="inventory-section" open>
          <summary className="inventory-section__summary">
            <div>
              <span className="section-heading__eyebrow">Tela</span>
              <h3>Rollos</h3>
            </div>
            <strong>{availableRolls.length} disponibles</strong>
          </summary>
          <div className="inventory-table">
            {availableRolls.length === 0 ? (
              <p className="history-panel__empty">No hay rollos disponibles.</p>
            ) : (
              availableRolls.map((fabric) => (
                <article key={fabric.id} className="inventory-row">
                  <div className="inventory-row__main">
                    <strong>{fabric.code}</strong>
                    <span>{fabric.family ? `${fabric.family} - ${fabric.color}` : fabric.color}</span>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Ancho</span>
                    <strong>{formatNumber(fabric.widthMeters)} m</strong>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Disponible</span>
                    <strong>{formatNumber(fabric.lengthMeters)} m</strong>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Costo yd2</span>
                    <strong>${formatNumber(fabric.costPerYd2)}</strong>
                  </div>
                </article>
              ))
            )}
          </div>
        </details>

        <details className="inventory-section">
          <summary className="inventory-section__summary">
            <div>
              <span className="section-heading__eyebrow">Tela</span>
              <h3>Retazos</h3>
            </div>
            <strong>{availableScraps.length} disponibles</strong>
          </summary>
          <div className="inventory-table">
            {availableScraps.length === 0 ? (
              <p className="history-panel__empty">No hay retazos disponibles.</p>
            ) : (
              availableScraps.map((fabric) => (
                <article key={fabric.id} className="inventory-row">
                  <div className="inventory-row__main">
                    <strong>{fabric.code}</strong>
                    <span>{fabric.family ? `${fabric.family} - ${fabric.color}` : fabric.color}</span>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Medida</span>
                    <strong>
                      {formatNumber(fabric.widthMeters)} x {formatNumber(fabric.lengthMeters)} m
                    </strong>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Area</span>
                    <strong>{formatNumber(fabric.widthMeters * fabric.lengthMeters)} m2</strong>
                  </div>
                  <div className="inventory-row__meta">
                    <span>Costo yd2</span>
                    <strong>${formatNumber(fabric.costPerYd2)}</strong>
                  </div>
                </article>
              ))
            )}
          </div>
        </details>

        <details className="inventory-section">
          <summary className="inventory-section__summary">
            <div>
              <span className="section-heading__eyebrow">Lineales</span>
              <h3>Tubo</h3>
            </div>
            <strong>{tubeBars.length} barras / {tubeOffcuts.length} sobrantes</strong>
          </summary>
          <div className="inventory-table">
            {tubeBars.map((item) => (
              <article key={item.id} className="inventory-row">
                <div className="inventory-row__main">
                  <strong>{item.code}</strong>
                  <span>Barra completa</span>
                </div>
                <div className="inventory-row__meta">
                  <span>Largo</span>
                  <strong>{formatNumber(item.lengthMeters)} m</strong>
                </div>
                <div className="inventory-row__meta">
                  <span>Estado</span>
                  <strong>Disponible</strong>
                </div>
              </article>
            ))}
            {tubeOffcuts.map((item) => (
              <article key={item.id} className="inventory-row inventory-row--offcut">
                <div className="inventory-row__main">
                  <strong>{item.code}</strong>
                  <span>Merma reutilizable</span>
                </div>
                <div className="inventory-row__meta">
                  <span>Largo</span>
                  <strong>{formatNumber(item.lengthMeters)} m</strong>
                </div>
                <div className="inventory-row__meta">
                  <span>Tipo</span>
                  <strong>Sobrante</strong>
                </div>
              </article>
            ))}
            {tubeBars.length === 0 && tubeOffcuts.length === 0 ? (
              <p className="history-panel__empty">No hay tubo disponible.</p>
            ) : null}
          </div>
        </details>

        <details className="inventory-section">
          <summary className="inventory-section__summary">
            <div>
              <span className="section-heading__eyebrow">Lineales</span>
              <h3>Bottom</h3>
            </div>
            <strong>{bottomBars.length} barras / {bottomOffcuts.length} sobrantes</strong>
          </summary>
          <div className="inventory-table">
            {bottomBars.map((item) => (
              <article key={item.id} className="inventory-row">
                <div className="inventory-row__main">
                  <strong>{item.code}</strong>
                  <span>Barra completa</span>
                </div>
                <div className="inventory-row__meta">
                  <span>Largo</span>
                  <strong>{formatNumber(item.lengthMeters)} m</strong>
                </div>
                <div className="inventory-row__meta">
                  <span>Estado</span>
                  <strong>Disponible</strong>
                </div>
              </article>
            ))}
            {bottomOffcuts.map((item) => (
              <article key={item.id} className="inventory-row inventory-row--offcut">
                <div className="inventory-row__main">
                  <strong>{item.code}</strong>
                  <span>Merma reutilizable</span>
                </div>
                <div className="inventory-row__meta">
                  <span>Largo</span>
                  <strong>{formatNumber(item.lengthMeters)} m</strong>
                </div>
                <div className="inventory-row__meta">
                  <span>Tipo</span>
                  <strong>Sobrante</strong>
                </div>
              </article>
            ))}
            {bottomBars.length === 0 && bottomOffcuts.length === 0 ? (
              <p className="history-panel__empty">No hay bottom disponible.</p>
            ) : null}
          </div>
        </details>

        <div className="inventory-page__grid inventory-page__grid--aside">
          <Card className="inventory-card">
            <span className="section-heading__eyebrow">Control</span>
            <h3>Ultimo movimiento</h3>
            {lastMovement ? (
              <div className="inventory-last-movement">
                <strong>{lastMovement.itemLabel}</strong>
                <span>{lastMovement.orderNumber || 'Ajuste interno'}</span>
                <p>
                  {lastMovement.action} - {formatNumber(lastMovement.quantity)} {lastMovement.unit}
                </p>
                <small>{formatDate(lastMovement.createdAt)}</small>
              </div>
            ) : (
              <p className="history-panel__empty">Aun no hay movimientos registrados.</p>
            )}
          </Card>

          <details className="inventory-section inventory-section--card">
            <summary className="inventory-section__summary">
              <div>
                <span className="section-heading__eyebrow">Control</span>
                <h3>Componentes</h3>
              </div>
              <strong>{inventory.components.length} items</strong>
            </summary>
            <div className="component-summary__list component-summary__list--compact">
              {inventory.components.map((component) => (
                <article key={component.id} className="component-summary__item">
                  <span>{component.name}</span>
                  <strong>{formatNumber(component.quantity, 0)}</strong>
                </article>
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function buildDraftCostsByWidth(
  profiles: Array<{ widthMeters: number; costPerYd2: number }>,
) {
  return Object.fromEntries(
    profiles.map((profile) => [
      profile.widthMeters.toFixed(2),
      profile.costPerYd2.toFixed(2),
    ]),
  );
}
