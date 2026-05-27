import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuthStore, type UserRole } from '../../../store/useAuthStore';
import { Card } from '../../../components/ui/Card';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export function UsersPanel() {
  const { user: currentUser, role } = useAuthStore();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Estado del Modal de Creación
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('consulta');
  const [isCreating, setIsCreating] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setProfiles(data || []);
    } catch (err: any) {
      console.error('DEV ERROR DETAILS:', {
        message: err.message || err,
        code: err.code || err.status || 'N/A',
        details: err.details || 'N/A',
        currentUserId: currentUser?.id,
        currentRole: role
      });
      setError('No se pudo cargar usuarios. Verifica conexión o estado de Supabase.');
      toast.error('Error al conectar con la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleRoleChange = async (userId: string, targetEmail: string, newRole: UserRole) => {
    if (userId === currentUser?.id) {
      toast.error('No puedes cambiar tu propio rol administrador.');
      return;
    }

    setUpdatingId(userId);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) throw updateError;

      setProfiles(prev =>
        prev.map(p => (p.id === userId ? { ...p, role: newRole } : p))
      );
      toast.success(`Rol de ${targetEmail} actualizado a ${newRole}.`);
    } catch (err: any) {
      console.error('Error updating role:', err);
      toast.error('No se pudo actualizar el rol en la base de datos.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = async (userId: string, targetEmail: string, currentStatus: boolean) => {
    if (userId === currentUser?.id) {
      toast.error('No puedes desactivar tu propia cuenta de administrador.');
      return;
    }

    const nextStatus = !currentStatus;
    setUpdatingId(userId);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) throw updateError;

      setProfiles(prev =>
        prev.map(p => (p.id === userId ? { ...p, is_active: nextStatus } : p))
      );
      toast.success(
        `Usuario ${targetEmail} ha sido ${nextStatus ? 'activado' : 'desactivado'}.`
      );
    } catch (err: any) {
      console.error('Error toggling status:', err);
      toast.error('No se pudo actualizar el estado en la base de datos.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail || !createPassword || !createRole) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }
    if (createPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: createEmail.trim(), password: createPassword, role: createRole }
      });

      if (error) {
        console.error('Invoke Error:', error);
        throw new Error('Error al contactar con el servicio de creación.');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Usuario creado exitosamente.');
      setIsCreateModalOpen(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('consulta');
      fetchProfiles();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(err.message || 'Error al crear el usuario.');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <Card className="rules-panel">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '16px' }}>
          <div className="login-spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--primary)' }}></div>
          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Cargando usuarios...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rules-panel">
        <div className="alert alert--error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', margin: '0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '24px', marginRight: '10px' }}>error</span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{error}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
          <button className="button button--secondary button--sm" onClick={fetchProfiles}>
            🔄 Reintentar conexión
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rules-panel">
      <div className="results-header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '24px' }}>
        <div>
          <span className="section-heading__eyebrow">Seguridad y Permisos</span>
          <h2>Control de Usuarios y Roles</h2>
          <p className="rules-panel__copy" style={{ margin: '6px 0 0' }}>
            Visualiza quién tiene acceso a la plataforma, modifica sus roles o inhabilita sus cuentas según sea necesario.
          </p>
        </div>
        <div style={{ alignSelf: 'center', display: 'flex', gap: '10px' }}>
          <button className="button button--secondary button--sm" onClick={fetchProfiles} disabled={updatingId !== null || isCreating}>
            🔄 Refrescar
          </button>
          {role === 'admin' && (
            <button className="button button--primary button--sm" onClick={() => setIsCreateModalOpen(true)} disabled={updatingId !== null || isCreating}>
              ➕ Crear Usuario
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className="pv2-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="pv2-thead-row">
              <th className="pv2-th" style={{ textAlign: 'left', padding: '12px' }}>Usuario / Correo</th>
              <th className="pv2-th" style={{ textAlign: 'left', padding: '12px' }}>Rol Asignado</th>
              <th className="pv2-th" style={{ textAlign: 'left', padding: '12px' }}>Fecha de Registro</th>
              <th className="pv2-th" style={{ textAlign: 'center', padding: '12px' }}>Acceso Activo</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="pv2-td" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                  No hay usuarios registrados en el sistema.
                </td>
              </tr>
            ) : (
              profiles.map(profile => {
                const isSelf = profile.id === currentUser?.id;
                
                return (
                  <tr key={profile.id} className="pv2-thead-row" style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="pv2-td" style={{ padding: '16px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong style={{ color: 'var(--text)' }}>{profile.email}</strong>
                        {isSelf && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                            (Sesión Actual - Protegido)
                          </span>
                        )}
                      </div>
                    </td>
                    
                    <td className="pv2-td" style={{ padding: '16px 12px' }}>
                      <select
                        className="pv2-select"
                        style={{ 
                          width: '160px', 
                          padding: '6px 10px', 
                          fontSize: '0.85rem', 
                          opacity: isSelf ? 0.6 : 1,
                          cursor: isSelf ? 'not-allowed' : 'pointer'
                        }}
                        value={profile.role}
                        onChange={(e) => handleRoleChange(profile.id, profile.email, e.target.value as UserRole)}
                        disabled={isSelf || updatingId !== null}
                      >
                        <option value="admin">Administrador</option>
                        <option value="produccion">Producción</option>
                        <option value="bodega">Bodega</option>
                        <option value="consulta">Consulta (Solo Lectura)</option>
                      </select>
                    </td>

                    <td className="pv2-td" style={{ padding: '16px 12px', color: 'var(--muted)' }}>
                      {new Date(profile.created_at).toLocaleDateString()} {new Date(profile.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="pv2-td" style={{ padding: '16px 12px', textAlign: 'center' }}>
                      <label className="switch-container" style={{ display: 'inline-flex', alignItems: 'center', cursor: isSelf ? 'not-allowed' : 'pointer', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={profile.is_active}
                          onChange={() => handleStatusToggle(profile.id, profile.email, profile.is_active)}
                          disabled={isSelf || updatingId !== null}
                          style={{ 
                            width: '18px', 
                            height: '18px', 
                            accentColor: 'var(--primary)',
                            cursor: isSelf ? 'not-allowed' : 'pointer'
                          }}
                        />
                        <span style={{ 
                          fontSize: '0.78rem', 
                          fontWeight: 700, 
                          color: profile.is_active ? 'var(--success, #22C55E)' : 'var(--danger, #ffb4ab)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                          opacity: isSelf ? 0.6 : 1
                        }}>
                          {profile.is_active ? 'Activo' : 'Suspendido'}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '24px', padding: '14px', borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: '0.8rem', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>info</span>
        <span>
          <strong>Nota de Seguridad:</strong> Las modificaciones en este panel actúan directamente sobre los permisos y estados en tiempo real. Un usuario suspendido perderá el acceso inmediatamente.
        </span>
      </div>

      {isCreateModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', border: '1px solid var(--line)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text)' }}>Crear Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--muted)' }}>Correo Electrónico</label>
                <input 
                  type="email" 
                  className="pv2-input" 
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={createEmail} 
                  onChange={e => setCreateEmail(e.target.value)} 
                  required 
                  disabled={isCreating}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--muted)' }}>Contraseña (min 8 caracteres)</label>
                <input 
                  type="password" 
                  className="pv2-input" 
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={createPassword} 
                  onChange={e => setCreatePassword(e.target.value)} 
                  required 
                  minLength={8}
                  disabled={isCreating}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--muted)' }}>Rol Inicial</label>
                <select 
                  className="pv2-select" 
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={createRole} 
                  onChange={e => setCreateRole(e.target.value as UserRole)}
                  disabled={isCreating}
                >
                  <option value="admin">Administrador</option>
                  <option value="produccion">Producción</option>
                  <option value="bodega">Bodega</option>
                  <option value="consulta">Consulta (Solo Lectura)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="button button--secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>
                  Cancelar
                </button>
                <button type="submit" className="button button--primary" disabled={isCreating}>
                  {isCreating ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
