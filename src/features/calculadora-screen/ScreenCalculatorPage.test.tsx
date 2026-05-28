import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenCalculatorPage } from './ScreenCalculatorPage';
import { useCalculatorStore } from './store/useCalculatorStore';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('./store/useCalculatorStore', () => ({
  useCalculatorStore: vi.fn(),
}));

vi.mock('./components/ProductionModuleV2', () => ({
  ProductionModuleV2: () => <div>Production view</div>,
}));

vi.mock('./components/InventoryPanelV2', () => ({
  InventoryPanelV2: () => <div>Inventory view</div>,
}));

vi.mock('./components/SavedOrdersPanel', () => ({
  SavedOrdersPanel: () => <div>Orders view</div>,
}));

vi.mock('./components/RulesPanel', () => ({
  RulesPanel: () => <div>Settings view</div>,
}));

vi.mock('./components/UsersPanel', () => ({
  UsersPanel: () => <div>Users view</div>,
}));

const setActiveView = vi.fn();
const setTheme = vi.fn();

let calculatorState = {
  activeView: 'production-v2',
  setActiveView,
  theme: 'dark',
  setTheme,
};

function setAuthPermissions(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: 'diego.hernandez@vertilux.com',
    } as any,
    session: null,
    role: 'consulta',
    isActive: true,
    loading: false,
    error: null,
    permissions,
    permissionsLoading: false,
    permissionsError: null,
  });
}

describe('ScreenCalculatorPage RBAC navigation', () => {
  beforeEach(() => {
    setActiveView.mockClear();
    setTheme.mockClear();
    calculatorState = {
      activeView: 'production-v2',
      setActiveView,
      theme: 'dark',
      setTheme,
    };
    vi.mocked(useCalculatorStore).mockImplementation((selector: any) => selector(calculatorState));
    setAuthPermissions([]);
  });

  it('shows tabs according to dynamic permissions', () => {
    setAuthPermissions(['production.view', 'orders.view']);

    render(<ScreenCalculatorPage />);

    expect(screen.getByRole('button', { name: 'Producción' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bodega' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Configuracion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('redirects to the first permitted tab when active view is not allowed', async () => {
    calculatorState.activeView = 'orders';
    setAuthPermissions(['inventory.view']);

    render(<ScreenCalculatorPage />);

    await waitFor(() => {
      expect(setActiveView).toHaveBeenCalledWith('inventory');
    });
  });

  it('shows an empty permissions state when no views are allowed', () => {
    setAuthPermissions(['users.create_user']);

    render(<ScreenCalculatorPage />);

    expect(screen.getByText('Sin permisos asignados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Producción' })).not.toBeInTheDocument();
  });
});
