import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InventoryMigrationPanel } from '../InventoryMigrationPanel';
import * as migrationLib from '../../../../lib/inventoryMigration';
import { useAuthStore } from '../../../../store/useAuthStore';

vi.mock('../../../../lib/inventoryMigration', () => ({
  getInventoryMigrationStatus: vi.fn(),
  readLocalProductionInventorySnapshot: vi.fn(),
  runInventoryMigration: vi.fn(),
}));

vi.mock('../../../../store/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('InventoryMigrationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock permissions
    (useAuthStore as any).mockReturnValue({
      hasPermission: (perm: string) => perm === 'inventory.import',
    });

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Mock default stats
    (migrationLib.readLocalProductionInventorySnapshot as any).mockReturnValue({
      inventory: { fabrics: [{ id: '1' }], tubes: [], bottoms: [], components: [] },
      movements: [{ id: 'm1' }]
    });

    (migrationLib.getInventoryMigrationStatus as any).mockReturnValue({ status: 'pending' });
  });

  it('no renderiza si no tiene permisos', () => {
    (useAuthStore as any).mockReturnValue({
      hasPermission: () => false,
    });
    const { container } = render(<InventoryMigrationPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza resumen de stats locales', () => {
    render(<InventoryMigrationPanel />);
    expect(screen.getByTestId('stat-fabrics').textContent).toContain('1');
    expect(screen.getByTestId('stat-tubes').textContent).toContain('0');
    expect(screen.getByTestId('stat-movements').textContent).toContain('1');
  });

  it('boton deshabilitado si ya fue completado', () => {
    (migrationLib.getInventoryMigrationStatus as any).mockReturnValue({ 
      status: 'completed', 
      completedAt: Date.now() 
    });
    
    render(<InventoryMigrationPanel />);
    
    expect(screen.getByTestId('migration-success')).toBeInTheDocument();
    expect(screen.getByTestId('btn-migrate')).toBeDisabled();
  });

  it('boton deshabilitado si no hay datos', () => {
    (migrationLib.readLocalProductionInventorySnapshot as any).mockReturnValue({
      inventory: { fabrics: [], tubes: [], bottoms: [], components: [] },
      movements: []
    });
    
    render(<InventoryMigrationPanel />);
    expect(screen.getByTestId('btn-migrate')).toBeDisabled();
  });

  it('ejecuta migracion al confirmar y actualiza estado', async () => {
    (migrationLib.runInventoryMigration as any).mockResolvedValueOnce(undefined);
    
    // Simula que cambia a completed despues de run
    let callCount = 0;
    (migrationLib.getInventoryMigrationStatus as any).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? { status: 'pending' } : { status: 'completed', itemsMigrated: 1, movementsMigrated: 1, completedAt: Date.now() };
    });

    render(<InventoryMigrationPanel />);
    
    const btn = screen.getByTestId('btn-migrate');
    fireEvent.click(btn);
    
    expect(window.confirm).toHaveBeenCalled();
    expect(migrationLib.runInventoryMigration).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId('migration-success')).toBeInTheDocument();
    });
  });

  it('muestra error si falla la migracion', async () => {
    (migrationLib.runInventoryMigration as any).mockRejectedValueOnce(new Error('Permiso denegado RLS'));
    
    render(<InventoryMigrationPanel />);
    
    const btn = screen.getByTestId('btn-migrate');
    fireEvent.click(btn);
    
    await waitFor(() => {
      expect(screen.getByTestId('migration-error')).toBeInTheDocument();
      expect(screen.getByTestId('migration-error').textContent).toContain('Permiso denegado RLS');
    });
  });
});
