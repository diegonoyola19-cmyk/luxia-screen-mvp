import { Card } from '../../../components/ui/Card';
import type { CalculationResult, WasteReuseMatch } from '../../../domain/curtains/types';
import { formatNumber } from '../../../lib/format';

interface ResultsPanelProps {
  result: CalculationResult | null;
  wasteMatches: WasteReuseMatch[];
  marginMeters: number;
  selectedWastePieceId: string | null;
  onSelectWastePiece: (id: string | null) => void;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ResultsPanel({
  result,
  wasteMatches,
  marginMeters,
  selectedWastePieceId,
  onSelectWastePiece,
}: ResultsPanelProps) {
  if (!result) {
    return (
      <Card className="results-panel results-panel--empty results-panel--compact">
        <span className="section-heading__eyebrow">Resultado</span>
        <h2>Calcula una medida</h2>
      </Card>
    );
  }

  const usingWaste = Boolean(selectedWastePieceId);

  return (
    <Card className="results-panel results-panel--compact">
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Resultado</span>
          <h2>{usingWaste ? 'Usar retazo' : 'Usar rollo nuevo'}</h2>
        </div>
        <div className="badge">{usingWaste ? 'Retazo' : 'Rollo'}</div>
      </div>

      <div className="mini-metrics-grid">
        <MiniMetric label="Rollo" value={`${formatNumber(result.recommendedRollWidthMeters)} m`} />
        <MiniMetric label="Corte" value={`${formatNumber(result.cutLengthMeters)} m`} />
        <MiniMetric label="Tela nueva" value={`${formatNumber(result.fabricDownloadedM2)} m2`} />
        <MiniMetric label="Sobrante" value={`${formatNumber(result.wasteM2)} m2`} />
      </div>

      {wasteMatches.length > 0 ? (
        <section className="scrap-picker scrap-picker--compact">
          <div className="scrap-picker__header">
            <div>
              <span className="section-heading__eyebrow">Retazos</span>
              <h3>Selecciona uno</h3>
            </div>
            <span className="scrap-picker__count">{wasteMatches.length}</span>
          </div>

          <div className="scrap-chip-list">
            <button
              type="button"
              className={[
                'scrap-chip',
                !usingWaste ? 'scrap-chip--active' : '',
              ].join(' ')}
              onClick={() => onSelectWastePiece(null)}
            >
              Rollo nuevo
            </button>
            {wasteMatches.slice(0, 3).map((match) => (
              <button
                key={match.wastePiece.id}
                type="button"
                className={[
                  'scrap-chip',
                  selectedWastePieceId === match.wastePiece.id ? 'scrap-chip--active' : '',
                ].join(' ')}
                onClick={() =>
                  onSelectWastePiece(
                    selectedWastePieceId === match.wastePiece.id
                      ? null
                      : match.wastePiece.id,
                  )
                }
                title={`Retazo ${formatNumber(match.wastePiece.widthMeters)} x ${formatNumber(match.wastePiece.heightMeters)} m. Margen base ${formatNumber(marginMeters)} m.`}
              >
                {formatNumber(match.wastePiece.widthMeters)} x{' '}
                {formatNumber(match.wastePiece.heightMeters)} m
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <details className="technical-panel">
        <summary>Ver detalle tecnico</summary>
        <div className="mini-metrics-grid">
          <MiniMetric label="yd2" value={`${formatNumber(result.fabricDownloadedYd2)} yd2`} />
          <MiniMetric label="Tubo" value={`${formatNumber(result.tubeFeet)} pies`} />
          <MiniMetric label="Bottom" value={`${formatNumber(result.bottomRailFeet)} pies`} />
          <MiniMetric label="Cadena" value={`${formatNumber(result.chainFeet)} pies`} />
          <MiniMetric
            label="Retazo"
            value={`${formatNumber(result.wastePieceWidthMeters)} x ${formatNumber(result.wastePieceHeightMeters)} m`}
          />
          <MiniMetric label="% merma" value={`${formatNumber(result.wastePercentage)} %`} />
        </div>
      </details>
    </Card>
  );
}
