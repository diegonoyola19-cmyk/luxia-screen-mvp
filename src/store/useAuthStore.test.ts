import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, type UserRole } from './useAuthStore';

const supabaseMock = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: supabaseMock,
}));

const baseState = {
  user: null,
  session: null,
  role: null,
  isActive: true,
  loading: false,
  error: null,
  permissions: [],
  permissionsLoading: false,
  permissionsError: null,
};

function setRole(role: UserRole, permissions: string[] = []) {
  useAuthStore.setState({
    ...baseState,
    role,
    permissions,
  });
}

describe('useAuthStore permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(baseState);
  });

  it('uses dynamic permissions when they are loaded', () => {
    setRole('consulta', ['users.view']);

    expect(useAuthStore.getState().hasPermission('users.view')).toBe(true);
    expect(useAuthStore.getState().hasPermission('production.view')).toBe(false);
  });

  it('falls back to admin role permissions', () => {
    setRole('admin');

    expect(useAuthStore.getState().hasPermission('users.disable_user')).toBe(true);
    expect(useAuthStore.getState().hasPermission('settings.edit_rules')).toBe(true);
  });

  it('falls back to produccion role permissions', () => {
    setRole('produccion');

    expect(useAuthStore.getState().hasPermission('production.create_order')).toBe(true);
    expect(useAuthStore.getState().hasPermission('orders.generate_pdf')).toBe(true);
    expect(useAuthStore.getState().hasPermission('inventory.export')).toBe(false);
  });

  it('falls back to bodega role permissions', () => {
    setRole('bodega');

    expect(useAuthStore.getState().hasPermission('inventory.create_scrap')).toBe(true);
    expect(useAuthStore.getState().hasPermission('inventory.export')).toBe(true);
    expect(useAuthStore.getState().hasPermission('orders.view')).toBe(false);
  });

  it('falls back to consulta role permissions', () => {
    setRole('consulta');

    expect(useAuthStore.getState().hasPermission('production.view')).toBe(true);
    expect(useAuthStore.getState().hasPermission('inventory.view')).toBe(true);
    expect(useAuthStore.getState().hasPermission('orders.generate_pdf')).toBe(true);
    expect(useAuthStore.getState().hasPermission('orders.export_sage')).toBe(false);
  });

  it('checks whether any permission is available', () => {
    setRole('bodega');

    expect(
      useAuthStore.getState().hasAnyPermission(['orders.view', 'inventory.export'])
    ).toBe(true);
    expect(
      useAuthStore.getState().hasAnyPermission(['orders.view', 'users.view'])
    ).toBe(false);
  });

  it('does not break login when dynamic permissions fail', async () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'diego.hernandez@vertilux.com',
      },
    };

    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { session },
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              role: 'produccion',
              role_id: 'role-1',
              is_active: true,
            },
            error: null,
          }),
        };
      }

      if (table === 'role_permissions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'permission query failed' },
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await useAuthStore
      .getState()
      .signIn('diego.hernandez@vertilux.com', 'password');

    expect(result.success).toBe(true);
    expect(useAuthStore.getState().user).toEqual(session.user);
    expect(useAuthStore.getState().role).toBe('produccion');
    expect(useAuthStore.getState().permissions).toEqual([]);
    expect(useAuthStore.getState().permissionsError).toBe('permission query failed');
    expect(useAuthStore.getState().hasPermission('production.create_order')).toBe(true);
  });
});
