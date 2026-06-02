import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserActivityPanel } from './UserActivityPanel';
import { useAuthStore } from '../../../store/useAuthStore';

const supabaseMock = vi.hoisted(() => ({
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
  },
}));

const profiles = [
  { id: 'user-1', email: 'operador@luxia.test' },
  { id: 'user-2', email: 'admin@luxia.test' },
];

function setAuthPermissions(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'admin-user',
      email: 'admin@luxia.test',
    } as any,
    session: null,
    role: 'admin',
    isActive: true,
    loading: false,
    error: null,
    permissions,
    permissionsLoading: false,
    permissionsError: null,
  });
}

describe('UserActivityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthPermissions(['users.view']);
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        events: [
          {
            id: 'event-1',
            actor_user_id: 'admin-user',
            actor_email: 'admin@luxia.test',
            target_user_id: 'user-1',
            target_email: 'operador@luxia.test',
            event_type: 'user.created',
            event_label: 'Usuario creado',
            metadata: { role: 'consulta' },
            created_at: '2026-05-28T18:00:00.000Z',
          },
        ],
      },
      error: null,
    });
  });

  it('shows administrative activity events', async () => {
    render(<UserActivityPanel profiles={profiles} />);

    expect(await screen.findByText('Usuario creado')).toBeInTheDocument();
    expect(screen.getAllByText(/operador@luxia.test/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Hecho por admin@luxia.test/i)).toBeInTheDocument();
  });

  it('shows empty state when there are no events', async () => {
    supabaseMock.functions.invoke.mockResolvedValue({ data: { events: [] }, error: null });

    render(<UserActivityPanel profiles={profiles} />);

    expect(
      await screen.findByText('Todavía no hay actividad administrativa registrada.')
    ).toBeInTheDocument();
  });

  it('shows error state when loading fails', async () => {
    supabaseMock.functions.invoke.mockResolvedValue({ data: { error: 'No autorizado' }, error: null });

    render(<UserActivityPanel profiles={profiles} />);

    expect(await screen.findByText('No autorizado')).toBeInTheDocument();
  });

  it('passes selected filters to the activity service', async () => {
    render(<UserActivityPanel profiles={profiles} />);

    await screen.findByText('Usuario creado');

    fireEvent.change(screen.getByLabelText(/Usuario/i), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText(/Evento/i), { target: { value: 'user.created' } });

    await waitFor(() => {
      expect(supabaseMock.functions.invoke).toHaveBeenLastCalledWith('admin-list-user-activity', {
        body: {
          targetUserId: 'user-1',
          eventType: 'user.created',
          limit: 50,
        },
      });
    });
  });

  it('blocks users without users.view or users.edit_roles', () => {
    setAuthPermissions(['production.view']);

    render(<UserActivityPanel profiles={profiles} />);

    expect(screen.getByText('No tienes permisos para ver actividad administrativa.')).toBeInTheDocument();
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
  });
});
