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
          {
            id: 'event-2',
            actor_user_id: 'admin-user',
            actor_email: 'admin@luxia.test',
            target_user_id: null,
            target_email: null,
            event_type: 'order.sent_to_production',
            event_label: 'Orden enviada a producción',
            metadata: { orderNumber: 'ORD-123', clientReference: 'Cliente XYZ', source: 'production_queue' },
            created_at: '2026-05-28T18:05:00.000Z',
          },
          {
            id: 'event-3',
            actor_user_id: 'admin-user',
            actor_email: 'admin@luxia.test',
            target_user_id: null,
            target_email: null,
            event_type: 'order.sent_to_production',
            event_label: 'Orden enviada a producción',
            metadata: {},
            created_at: '2026-05-28T18:10:00.000Z',
          },
          {
            id: 'event-4',
            actor_user_id: 'admin-user',
            actor_email: 'admin@luxia.test',
            target_user_id: null,
            target_email: null,
            event_type: 'order.pdf_generated',
            event_label: 'PDF generado',
            metadata: { orderNumber: 'ORD-124' },
            created_at: '2026-05-28T18:15:00.000Z',
          }
        ],
      },
      error: null,
    });
  });

  it('shows administrative activity events', async () => {
    render(<UserActivityPanel profiles={profiles} />);

    expect(await screen.findByText('Usuario creado')).toBeInTheDocument();
    expect(screen.getAllByText(/operador@luxia.test/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hecho por admin@luxia.test/i).length).toBeGreaterThan(0);
  });

  it('renders order.sent_to_production event correctly', async () => {
    render(<UserActivityPanel profiles={profiles} />);
    
    expect(await screen.findByText('Orden #ORD-123 (Cliente XYZ) enviada a producción desde Cola de Producción.')).toBeInTheDocument();
    expect(screen.getAllByText('Orden enviada a producción')).toHaveLength(3); // 2 events + 1 option
  });

  it('renders order.sent_to_production event with fallback when metadata is missing', async () => {
    render(<UserActivityPanel profiles={profiles} />);
    
    expect(await screen.findByText('Orden enviada a producción.')).toBeInTheDocument();
    expect(screen.getAllByText('Orden enviada a producción')).toHaveLength(3);
  });

  it('renders order.pdf_generated event correctly', async () => {
    render(<UserActivityPanel profiles={profiles} />);
    
    expect(await screen.findByText('PDF de materiales generado para la orden #ORD-124.')).toBeInTheDocument();
    expect(screen.getAllByText('PDF generado')).toHaveLength(2); // 1 event + 1 option
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
