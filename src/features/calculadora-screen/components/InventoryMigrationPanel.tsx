import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/useAuthStore';
import { 
  getInventoryMigrationStatus, 
  readLocalProductionInventorySnapshot, 
  runInventoryMigration, 
  MigrationStatus 
} from '../../../lib/inventoryMigration';

export function InventoryMigrationPanel() {
  const { hasPermission } = useAuthStore();
  const [status, setStatus] = useState<MigrationStatus>({ status: 'pending' });
  const [localStats, setLocalStats] = useState({ fabrics: 0, tubes: 0, bottoms: 0, components: 0, movements: 0 });
  const [isMigrating, setIsMigrating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canImport = hasPermission('inventory.import');

  useEffect(() => {
    setStatus(getInventoryMigrationStatus());
    const { inventory, movements } = readLocalProductionInventorySnapshot();
    setLocalStats({
      fabrics: inventory.fabrics?.length || 0,
      tubes: inventory.tubes?.length || 0,
      bottoms: inventory.bottoms?.length || 0,
      components: inventory.components?.length || 0,
      movements: movements?.length || 0
    });
  }, []);

  const handleMigrate = async () => {
    if (!canImport) return;
    if (status.status === 'completed') return;

    const total = localStats.fabrics + localStats.tubes + localStats.bottoms + localStats.components + localStats.movements;
    if (total === 0) return;

    if (!window.confirm('¿Seguro que quieres migrar todo el inventario local a Supabase? Esta acción no borrará los datos locales todavía.')) return;

    setIsMigrating(true);
    setErrorMsg(null);
    try {
      await runInventoryMigration();
      setStatus(getInventoryMigrationStatus());
    } catch (err: any) {
      setErrorMsg(err.message || 'Error desconocido');
      setStatus(getInventoryMigrationStatus());
    } finally {
      setIsMigrating(false);
    }
  };

  const totalItems = localStats.fabrics + localStats.tubes + localStats.bottoms + localStats.components;

  if (!canImport) return null;

  return (
    <Card className="rules-panel" style={{ marginTop: '20px' }}>
      <div className="results-header">
        <div>
          <span className="section-heading__eyebrow">Migración a Supabase (Fase 5B)</span>
          <h2>Migrar Bodega Local</h2>
          <p className="rules-panel__copy">
            Herramienta técnica para mover el inventario guardado en este navegador hacia la base de datos global.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '16px', background: 'var(--surface-sunken)', borderRadius: '8px' }}>
        <h4 style={{ marginBottom: '12px' }}>Datos locales detectados:</h4>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
          <li data-testid="stat-fabrics"><strong>Telas:</strong> {localStats.fabrics}</li>
          <li data-testid="stat-tubes"><strong>Tubos:</strong> {localStats.tubes}</li>
          <li data-testid="stat-bottoms"><strong>Bases:</strong> {localStats.bottoms}</li>
          <li data-testid="stat-components"><strong>Componentes:</strong> {localStats.components}</li>
          <li data-testid="stat-movements"><strong>Movimientos:</strong> {localStats.movements}</li>
        </ul>
      </div>

      <div style={{ marginTop: '20px' }}>
        {status.status === 'completed' ? (
          <div className="alert alert--success" data-testid="migration-success">
            ✅ Migración completada el {new Date(status.completedAt || 0).toLocaleString()}. 
            Se migraron {status.itemsMigrated} items y {status.movementsMigrated} movimientos.
          </div>
        ) : status.status === 'failed' || errorMsg ? (
          <div className="alert alert--error" data-testid="migration-error">
            ❌ Error en migración: {errorMsg || status.error}
          </div>
        ) : null}
      </div>

      <div className="button-row" style={{ marginTop: '20px' }}>
        <Button 
          type="button" 
          onClick={handleMigrate} 
          disabled={isMigrating || status.status === 'completed' || (totalItems + localStats.movements === 0)}
          data-testid="btn-migrate"
        >
          {isMigrating ? 'Migrando...' : 'Migrar a Supabase'}
        </Button>
      </div>
    </Card>
  );
}
