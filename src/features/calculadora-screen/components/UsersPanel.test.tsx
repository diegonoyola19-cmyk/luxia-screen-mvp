import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPanel } from './UsersPanel';
import { useAuthStore } from '../../../store/useAuthStore';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  functions: {
    invoke: vi.fn(),
  },
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

vi.mock('./RolePermissionsPanel', () => ({
  RolePermissionsPanel: () => <div>Panel de roles mock</div>,
}));

const profiles = [
  {
    id: 'other-user',
    email: 'operador@luxia.test',
    role: 'consulta',
    is_active: true,
    created_at: '2026-05-28T12:00:00.000Z',
  },
];

function mockProfilesFetch() {
  supabaseMock.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: profiles,
      error: null,
    }),
  });
}

function setAuthPermissions(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'current-user',
      email: 'admin@luxia.test',
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

describe('UsersPanel RBAC permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfilesFetch();
    setAuthPermissions(['users.view']);
  });

  it('shows create user only with users.create_user', async () => {
    setAuthPermissions(['users.view']);
    const { rerender } = render(<UsersPanel />);

    await screen.findByText('operador@luxia.test');
    expect(screen.queryByRole('button', { name: /Crear Usuario/i })).not.toBeInTheDocument();

    setAuthPermissions(['users.view', 'users.create_user']);
    rerender(<UsersPanel />);

    expect(screen.getByRole('button', { name: /Crear Usuario/i })).toBeInTheDocument();
  });

  it('enables role editing only with users.edit_roles', async () => {
    setAuthPermissions(['users.view']);
    const { rerender } = render(<UsersPanel />);

    const roleSelect = await screen.findByRole('combobox');
    expect(roleSelect).toBeDisabled();

    setAuthPermissions(['users.view', 'users.edit_roles']);
    rerender(<UsersPanel />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).not.toBeDisabled();
    });
  });

  it('enables user status toggle only with users.disable_user', async () => {
    setAuthPermissions(['users.view']);
    const { rerender } = render(<UsersPanel />);

    const statusToggle = await screen.findByRole('checkbox');
    expect(statusToggle).toBeDisabled();

    setAuthPermissions(['users.view', 'users.disable_user']);
    rerender(<UsersPanel />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });
  });

  it('shows Roles y permisos tab only with users.edit_roles', async () => {
    setAuthPermissions(['users.view']);
    const { rerender } = render(<UsersPanel />);

    await screen.findByText('operador@luxia.test');
    expect(screen.queryByRole('button', { name: /Roles y permisos/i })).not.toBeInTheDocument();

    setAuthPermissions(['users.view', 'users.edit_roles']);
    rerender(<UsersPanel />);

    const rolesTab = await screen.findByRole('button', { name: /Roles y permisos/i });
    expect(rolesTab).toBeInTheDocument();

    fireEvent.click(rolesTab);
    expect(screen.getByText('Panel de roles mock')).toBeInTheDocument();
  });

});
