import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/useAuthStore';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import './UserActivityPanel.css';

interface UserProfileOption {
  id: string;
  email: string;
}

interface ActivityEvent {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  event_type: string;
  event_label: string;
  metadata: Record<string, unknown>;
  entity_type?: string;
  entity_id?: string;
  created_at: string;
}

interface UserActivityPanelProps {
  profiles: UserProfileOption[];
}

const EVENT_LABELS: Record<string, string> = {
  'user.created': 'Usuario creado',
  'user.activated': 'Usuario activado',
  'user.deactivated': 'Usuario desactivado',
  'user.role_changed': 'Cambio de rol',
  'role.permissions_changed': 'Permisos de rol actualizados',
  'admin.error': 'Error administrativo',
  'user.login': 'Inicio de sesión',
  'order.deleted': 'Orden eliminada',
};

export function UserActivityPanel({ profiles }: UserActivityPanelProps) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [eventType, setEventType] = useState('');

  const canViewActivity = hasPermission('users.view') || hasPermission('users.edit_roles');

  const eventTypeOptions = useMemo(() => {
    const knownTypes = Object.keys(EVENT_LABELS);
    const seenTypes = [...new Set(events.map((event) => event.event_type))];
    return [...new Set([...knownTypes, ...seenTypes])];
  }, [events]);

  const loadActivity = async () => {
    if (!canViewActivity) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-list-user-activity', {
        body: {
          targetUserId: targetUserId || undefined,
          eventType: eventType || undefined,
          limit: 50,
        },
      });

      if (invokeError) {
        const context = (invokeError as any).context;
        console.error('List user activity invoke error:', {
          name: invokeError.name,
          message: invokeError.message,
          status: context?.status,
          statusText: context?.statusText,
          context,
        });
        throw new Error('No se pudo contactar el servicio de actividad.');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setEvents(data?.events || []);
    } catch (err: any) {
      console.error('Error loading user activity:', err);
      setError(err.message || 'No se pudo cargar la actividad administrativa.');
      toast.error('No se pudo cargar la actividad administrativa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();

    if (canViewActivity) {
      const channel = supabase.channel('admin_user_activity')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'user_activity_log' },
          (payload) => {
            const newEvent = payload.new as ActivityEvent;
            
            if (targetUserId && newEvent.target_user_id !== targetUserId && newEvent.actor_user_id !== targetUserId) {
              return;
            }
            if (eventType && newEvent.event_type !== eventType) {
              return;
            }

            setEvents(prev => {
              if (prev.some(e => e.id === newEvent.id)) return prev;
              return [newEvent, ...prev];
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [targetUserId, eventType, canViewActivity]);

  if (!canViewActivity) {
    return (
      <Card className="rules-panel user-activity-panel">
        <div className="alert alert--neutral" style={{ margin: 0 }}>
          No tienes permisos para ver actividad administrativa.
        </div>
      </Card>
    );
  }

  return (
    <Card className="user-activity-panel">
      <div className="user-activity-header">
        <div>
          <span className="section-heading__eyebrow">Auditoría</span>
          <h2>Actividad administrativa</h2>
          <p>Consulta cambios de usuarios, roles y permisos registrados por Luxia.</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadActivity} disabled={loading}>
          Refrescar
        </Button>
      </div>

      <div className="user-activity-filters">
        <label>
          <span>Usuario</span>
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="">Todos los usuarios</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Evento</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
            <option value="">Todos los eventos</option>
            {eventTypeOptions.map((type) => (
              <option key={type} value={type}>
                {formatEventType(type)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div className="user-activity-state">Cargando actividad...</div>}

      {!loading && error && (
        <div className="alert alert--error user-activity-state">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="alert alert--neutral user-activity-state">
          Todavía no hay actividad administrativa registrada.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="user-activity-timeline">
          {events.map((event) => (
            <article key={event.id} className="user-activity-event">
              <time>{formatDate(event.created_at)}</time>
              <h3>{formatEventType(event.event_type, event.event_label)}</h3>
              <p>{describeEvent(event)}</p>
              <small>
                Hecho por {event.actor_email || 'Sistema'}
              </small>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function formatEventType(type: string, fallback?: string) {
  return EVENT_LABELS[type] || fallback || type;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function describeEvent(event: ActivityEvent) {
  if (event.event_type === 'user.login') {
    return 'El usuario ha iniciado sesión.';
  }

  if (event.event_type === 'order.deleted') {
    const orderNum = event.metadata?.orderNumber;
    const clientRef = event.metadata?.clientReference;
    return `Orden eliminada: ${orderNum || 'N/A'}${clientRef ? ` (${clientRef})` : ''}.`;
  }

  const target = event.target_email || 'Sin usuario afectado';

  if (event.event_type === 'user.role_changed') {
    return `${target}: rol ${(event.metadata?.previousRole as string) || 'anterior'} -> ${(event.metadata?.nextRole as string) || 'nuevo'}.`;
  }

  if (event.event_type === 'role.permissions_changed') {
    return `Rol ${(event.metadata?.roleName as string) || 'seleccionado'} actualizado con ${event.metadata?.permissionCount ?? 0} permisos.`;
  }

  return target;
}
