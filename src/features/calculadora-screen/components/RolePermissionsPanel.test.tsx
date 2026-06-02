import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolePermissionsPanel } from './RolePermissionsPanel';
import { useAuthStore } from '../../../store/useAuthStore';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  functions: {
    invoke: vi.fn(),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const roles = [
  { id: 'role-produccion', name: 'produccion', description: 'Producción', is_system: true },
  { id: 'role-admin', name: 'admin', description: 'Administrador', is_system: true },
];

const permissions = [
  {
    id: 'production.view',
    module: 'production',
    action: 'view',
    label: 'Ver producción',
    description: 'Acceso al módulo de producción',
  },
  {
    id: 'production.create_order',
    module: 'production',
    action: 'create_order',
    label: 'Crear orden',
    description: 'Crear órdenes de producción',
  },
  {
    id: 'orders.view',
    module: 'orders',
    action: 'view',
    label: 'Ver órdenes',
    description: 'Acceso al módulo de órdenes',
  },
  {
    id: 'users.view',
    module: 'users',
    action: 'view',
    label: 'Ver usuarios',
    description: 'Acceso al panel de usuarios',
  },
  {
    id: 'users.edit_roles',
    module: 'users',
    action: 'edit_roles',
    label: 'Editar roles',
    description: 'Administrar permisos de roles',
  },
];

const fullAdminPermissions = [
  'users.view',
  'users.create_user',
  'users.edit_roles',
  'users.disable_user',
  'production.view',
  'inventory.view',
  'orders.view',
  'settings.view',
];

let rolePermissions = [
  { role_id: 'role-produccion', permission_id: 'production.view' },
  { role_id: 'role-admin', permission_id: 'users.view' },
  { role_id: 'role-admin', permission_id: 'users.edit_roles' },
  { role_id: 'role-admin', permission_id: 'production.view' },
  { role_id: 'role-admin', permission_id: 'orders.view' },
];

function setAuthState() {
  useAuthStore.setState({
    user: {
      id: 'current-user',
      email: 'admin@luxia.test',
    } as any,
    session: null,
    role: 'admin',
    isActive: true,
    loading: false,
    error: null,
    permissions: ['users.edit_roles'],
    permissionsLoading: false,
    permissionsError: null,
    refreshPermissions: vi.fn().mockResolvedValue(undefined),
  });
}

function mockRolePermissionQueries() {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'roles') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: roles, error: null }),
        }),
      };
    }

    if (table === 'permissions') {
      const query = {
        order: vi.fn(),
      };
      query.order.mockImplementation(() => {
        if (query.order.mock.calls.length === 1) return query;
        return Promise.resolve({ data: permissions, error: null });
      });
      return {
        select: vi.fn().mockReturnValue(query),
      };
    }

    if (table === 'role_permissions') {
      return {
        select: vi.fn().mockResolvedValue({ data: rolePermissions, error: null }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('RolePermissionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rolePermissions = [
      { role_id: 'role-produccion', permission_id: 'production.view' },
      { role_id: 'role-admin', permission_id: 'users.view' },
      { role_id: 'role-admin', permission_id: 'users.edit_roles' },
      { role_id: 'role-admin', permission_id: 'production.view' },
      { role_id: 'role-admin', permission_id: 'orders.view' },
    ];
    setAuthState();
    mockRolePermissionQueries();
    supabaseMock.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('loads roles and groups permissions by module', async () => {
    render(<RolePermissionsPanel />);

    expect(await screen.findByRole('heading', { name: /Roles y permisos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Producción.*1 permisos activos/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Producción' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Órdenes' })).toBeInTheDocument();
    expect(screen.getByText('Ver producción')).toBeInTheDocument();
  });

  it('shows permission counts for each role', async () => {
    render(<RolePermissionsPanel />);

    expect(await screen.findByRole('button', { name: /Producción.*1 permisos activos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Administrador.*4 permisos activos/i })).toBeInTheDocument();
  });

  it('updates local selection when a permission is checked', async () => {
    render(<RolePermissionsPanel />);

    const createOrder = await screen.findByLabelText(/Crear órdenes de producción/i);
    expect(createOrder).not.toBeChecked();

    fireEvent.click(createOrder);

    expect(createOrder).toBeChecked();
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeEnabled();
  });

  it('reverts pending changes when cancel is clicked', async () => {
    render(<RolePermissionsPanel />);

    const createOrder = await screen.findByLabelText(/Crear órdenes de producción/i);
    fireEvent.click(createOrder);
    expect(createOrder).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Cancelar\/Revertir/i }));

    expect(createOrder).not.toBeChecked();
  });

  it('saves changes through admin-update-role-permissions', async () => {
    render(<RolePermissionsPanel />);

    fireEvent.click(await screen.findByLabelText(/Crear órdenes de producción/i));
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('admin-update-role-permissions', {
        body: {
          roleId: 'role-produccion',
          permissionIds: ['production.create_order', 'production.view'],
          confirmSensitiveChange: false,
        },
      });
    });
  });

  it('blocks saving an invalid admin permission set', async () => {
    rolePermissions = fullAdminPermissions
      .filter((permissionId) => permissionId !== 'settings.view')
      .map((permissionId) => ({ role_id: 'role-admin', permission_id: permissionId }));
    mockRolePermissionQueries();

    render(<RolePermissionsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /Administrador/i }));

    expect(screen.getByText(/El rol admin debe conservar permisos críticos/i)).toBeInTheDocument();
    expect(screen.getByText(/El rol admin conserva permisos críticos obligatorios/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });
});
