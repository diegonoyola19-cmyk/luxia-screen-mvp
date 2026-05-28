import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionGate } from './PermissionGate';
import { useAuthStore } from '../store/useAuthStore';

const baseState = {
  user: null,
  session: null,
  role: 'consulta' as const,
  isActive: true,
  loading: false,
  error: null,
  permissions: [],
  permissionsLoading: false,
  permissionsError: null,
};

function setPermissions(permissions: string[]) {
  useAuthStore.setState({
    ...baseState,
    permissions,
  });
}

describe('PermissionGate', () => {
  beforeEach(() => {
    setPermissions([]);
  });

  it('renders children when permission is available', () => {
    setPermissions(['users.view']);

    render(
      <PermissionGate permission="users.view">
        <span>Allowed</span>
      </PermissionGate>
    );

    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('hides children when permission is missing', () => {
    setPermissions(['orders.view']);

    render(
      <PermissionGate permission="users.view">
        <span>Allowed</span>
      </PermissionGate>
    );

    expect(screen.queryByText('Allowed')).not.toBeInTheDocument();
  });

  it('renders children when anyOf has at least one available permission', () => {
    setPermissions(['orders.view']);

    render(
      <PermissionGate anyOf={['users.view', 'orders.view']}>
        <span>Any allowed</span>
      </PermissionGate>
    );

    expect(screen.getByText('Any allowed')).toBeInTheDocument();
  });

  it('renders children when allOf permissions are available', () => {
    setPermissions(['users.view', 'users.edit_roles']);

    render(
      <PermissionGate allOf={['users.view', 'users.edit_roles']}>
        <span>All allowed</span>
      </PermissionGate>
    );

    expect(screen.getByText('All allowed')).toBeInTheDocument();
  });

  it('requires every declared condition to pass', () => {
    setPermissions(['users.view', 'users.create_user']);

    render(
      <PermissionGate
        permission="users.view"
        anyOf={['users.create_user', 'orders.view']}
        allOf={['users.edit_roles']}
        fallback={<span>Denied</span>}
      >
        <span>Allowed</span>
      </PermissionGate>
    );

    expect(screen.queryByText('Allowed')).not.toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  it('renders fallback when access is denied', () => {
    setPermissions(['orders.view']);

    render(
      <PermissionGate permission="users.view" fallback={<span>Fallback</span>}>
        <span>Allowed</span>
      </PermissionGate>
    );

    expect(screen.getByText('Fallback')).toBeInTheDocument();
  });
});
