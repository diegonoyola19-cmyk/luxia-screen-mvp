import { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/useAuthStore';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import './RolePermissionsPanel.css';

interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean | null;
}

interface PermissionRecord {
  id: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
}

interface RolePermissionRecord {
  role_id: string;
  permission_id: string;
}

const MODULE_ORDER = ['production', 'inventory', 'orders', 'settings', 'users'];

const MODULE_LABELS: Record<string, string> = {
  production: 'Producción',
  inventory: 'Bodega',
  orders: 'Órdenes',
  settings: 'Configuración',
  users: 'Usuarios',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  produccion: 'Producción',
  bodega: 'Bodega',
  consulta: 'Consulta',
};

const PERMISSION_COPY: Record<string, { title: string; description: string }> = {
  'production.view': {
    title: 'Ver producción',
    description: 'Acceso al módulo de producción y su estado general.',
  },
  'production.create_order': {
    title: 'Crear órdenes de producción',
    description: 'Permite registrar nuevas órdenes desde producción.',
  },
  'production.add_to_batch': {
    title: 'Agregar a lote',
    description: 'Permite enviar órdenes a lotes de trabajo.',
  },
  'inventory.view': {
    title: 'Ver bodega',
    description: 'Acceso al inventario y materiales disponibles.',
  },
  'inventory.create_scrap': {
    title: 'Registrar sobrante',
    description: 'Permite crear registros de material sobrante.',
  },
  'inventory.discard_scrap': {
    title: 'Descartar sobrante',
    description: 'Permite marcar material sobrante como descartado.',
  },
  'inventory.export': {
    title: 'Exportar bodega',
    description: 'Permite descargar información de inventario.',
  },
  'orders.view': {
    title: 'Ver órdenes',
    description: 'Acceso al historial y detalle de órdenes guardadas.',
  },
  'orders.generate_pdf': {
    title: 'Generar PDF',
    description: 'Permite crear documentos PDF de órdenes.',
  },
  'orders.export_sage': {
    title: 'Exportar a Sage',
    description: 'Permite preparar información para Sage.',
  },
  'orders.delete': {
    title: 'Eliminar órdenes',
    description: 'Permite borrar órdenes guardadas.',
  },
  'settings.view': {
    title: 'Ver configuración',
    description: 'Acceso al módulo de configuración.',
  },
  'settings.edit_rules': {
    title: 'Editar reglas',
    description: 'Permite modificar reglas operativas configurables.',
  },
  'users.view': {
    title: 'Ver usuarios',
    description: 'Acceso al panel de usuarios.',
  },
  'users.create_user': {
    title: 'Crear usuarios',
    description: 'Permite crear cuentas nuevas desde Luxia.',
  },
  'users.edit_roles': {
    title: 'Administrar roles',
    description: 'Permite editar roles y permisos.',
  },
  'users.disable_user': {
    title: 'Activar o suspender usuarios',
    description: 'Permite cambiar el estado de acceso de usuarios.',
  },
};

export const ADMIN_CRITICAL_PERMISSIONS = [
  'users.view',
  'users.create_user',
  'users.edit_roles',
  'users.disable_user',
  'production.view',
  'inventory.view',
  'orders.view',
  'settings.view',
];

export function RolePermissionsPanel() {
  const role = useAuthStore((state) => state.role);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const refreshPermissions = useAuthStore((state) => state.refreshPermissions);

  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [initialPermissionIds, setInitialPermissionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isSavingRef = useRef(false);
  useEffect(() => {
    isSavingRef.current = saving;
  }, [saving]);

  const canEditRoles = hasPermission('users.edit_roles');
  const selectedRole = roles.find((item) => item.id === selectedRoleId) || null;
  const hasChanges = !sameSet(selectedPermissionIds, initialPermissionIds);
  const adminMissingCriticalPermissions =
    selectedRole?.name === 'admin'
      ? ADMIN_CRITICAL_PERMISSIONS.filter((permissionId) => !selectedPermissionIds.has(permissionId))
      : [];

  const permissionsByModule = useMemo(() => {
    const grouped = new Map<string, PermissionRecord[]>();
    for (const permission of permissions) {
      if (!grouped.has(permission.module)) grouped.set(permission.module, []);
      grouped.get(permission.module)?.push(permission);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => moduleRank(a) - moduleRank(b) || a.localeCompare(b))
      .map(([module, items]) => ({
        module,
        permissions: items.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [permissions]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [rolesResult, permissionsResult, rolePermissionsResult] = await Promise.all([
        supabase.from('roles').select('id, name, description, is_system').order('name'),
        supabase.from('permissions').select('id, module, action, label, description').order('module').order('action'),
        supabase.from('role_permissions').select('role_id, permission_id'),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (permissionsResult.error) throw permissionsResult.error;
      if (rolePermissionsResult.error) throw rolePermissionsResult.error;

      const nextRoles = rolesResult.data || [];
      const nextRolePermissions = rolePermissionsResult.data || [];
      const nextSelectedRoleId = selectedRoleId || nextRoles[0]?.id || null;

      setRoles(nextRoles);
      setPermissions(permissionsResult.data || []);
      setRolePermissions(nextRolePermissions);
      setSelectedRoleId(nextSelectedRoleId);
      syncRoleSelection(nextSelectedRoleId, nextRolePermissions);
    } catch (err: any) {
      console.error('Error loading role permissions:', err);
      setError(err.message || 'No se pudieron cargar roles y permisos.');
      toast.error('No se pudieron cargar roles y permisos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canEditRoles) {
      loadData();

      let debounceTimeout: ReturnType<typeof setTimeout>;
      const channel = supabase.channel('admin_role_permissions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'role_permissions' },
          () => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
              if (!isSavingRef.current) {
                loadData();
              }
            }, 800);
          }
        )
        .subscribe();

      return () => {
        clearTimeout(debounceTimeout);
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [canEditRoles]);

  const syncRoleSelection = (roleId: string | null, source = rolePermissions) => {
    const nextPermissionIds = new Set(
      source.filter((item) => item.role_id === roleId).map((item) => item.permission_id)
    );
    setSelectedPermissionIds(nextPermissionIds);
    setInitialPermissionIds(new Set(nextPermissionIds));
  };

  const handleRoleSelect = (roleId: string) => {
    setSelectedRoleId(roleId);
    syncRoleSelection(roleId);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const handleCancel = () => {
    setSelectedPermissionIds(new Set(initialPermissionIds));
  };

  const handleSave = async (confirmSensitiveChange = false) => {
    if (!selectedRoleId || !selectedRole) return;

    if (adminMissingCriticalPermissions.length > 0) {
      toast.error('El rol admin no puede perder permisos críticos.');
      return;
    }

    const removesOwnRoleEditorPermission =
      selectedRole.name === role &&
      initialPermissionIds.has('users.edit_roles') &&
      !selectedPermissionIds.has('users.edit_roles');

    if (removesOwnRoleEditorPermission && !confirmSensitiveChange) {
      const confirmed = window.confirm(
        'Este cambio puede quitarte el permiso para administrar roles. ¿Quieres continuar?'
      );
      if (!confirmed) return;
      return handleSave(true);
    }

    setSaving(true);
    try {
      const nextPermissionIds = [...selectedPermissionIds].sort();
      const { data, error: invokeError } = await supabase.functions.invoke('admin-update-role-permissions', {
        body: {
          roleId: selectedRoleId,
          permissionIds: nextPermissionIds,
          confirmSensitiveChange,
        },
      });

      if (invokeError) {
        const context = (invokeError as any).context;
        console.error('Update role permissions invoke error:', {
          name: invokeError.name,
          message: invokeError.message,
          status: context?.status,
          statusText: context?.statusText,
          context,
        });
        throw new Error('No se pudo contactar el servicio de permisos.');
      }

      if (data?.error) {
        if (data.requiresConfirmation && !confirmSensitiveChange) {
          const confirmed = window.confirm(data.error);
          if (!confirmed) return;
          return handleSave(true);
        }
        throw new Error(data.error);
      }

      const nextRolePermissions = [
        ...rolePermissions.filter((item) => item.role_id !== selectedRoleId),
        ...nextPermissionIds.map((permissionId) => ({ role_id: selectedRoleId, permission_id: permissionId })),
      ];
      setRolePermissions(nextRolePermissions);
      setInitialPermissionIds(new Set(nextPermissionIds));
      setSelectedPermissionIds(new Set(nextPermissionIds));

      if (selectedRole.name === role) {
        await refreshPermissions();
      }

      toast.success('Permisos actualizados correctamente.');
    } catch (err: any) {
      console.error('Error saving role permissions:', err);
      toast.error(err.message || 'No se pudieron guardar los permisos.');
    } finally {
      setSaving(false);
    }
  };

  if (!canEditRoles) {
    return (
      <Card className="rules-panel role-permissions-panel">
        <div className="alert alert--neutral" style={{ margin: 0 }}>
          No tienes permisos para administrar roles.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="rules-panel role-permissions-panel">
        <div className="role-permissions-loading">
          Cargando roles y permisos...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rules-panel role-permissions-panel">
        <div className="alert alert--error" style={{ margin: 0 }}>{error}</div>
        <div className="role-permissions-error-actions">
          <Button type="button" variant="secondary" onClick={loadData}>
            Reintentar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rules-panel role-permissions-panel">
      <div className="role-permissions-header">
        <div>
          <span className="section-heading__eyebrow">RBAC Dinámico</span>
          <h2>Roles y permisos</h2>
          <p className="role-permissions-subtitle">
            Administra de forma clara qué puede ver y hacer cada rol dentro de Luxia.
          </p>
        </div>
        {hasChanges && (
          <span className="role-permissions-chip">
            Cambios pendientes
          </span>
        )}
      </div>

      <div className="role-permissions-layout">
        <aside className="role-permissions-roles" aria-label="Roles disponibles">
          <div className="role-permissions-roles__header">
            <span>Roles</span>
            <small>{roles.length} disponibles</small>
          </div>
          {roles.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'role-card-button',
                item.id === selectedRoleId ? 'role-card-button--active' : '',
              ].join(' ')}
              onClick={() => handleRoleSelect(item.id)}
              disabled={saving}
            >
              <span className="role-card-button__label">{formatRoleName(item.name)}</span>
              <span className="role-card-button__description">
                {item.description || 'Rol configurado en Luxia.'}
              </span>
              <span className="role-card-button__count">
                {countPermissionsForRole(item.id)} permisos activos
              </span>
            </button>
          ))}
        </aside>

        <section className="role-permissions-detail">
          {selectedRole ? (
            <>
              <div className="role-permissions-selected">
                <div>
                  <span className="role-permissions-selected__eyebrow">Rol seleccionado</span>
                  <h3>{formatRoleName(selectedRole.name)}</h3>
                  <p>
                  {selectedRole.description || 'Sin descripción.'}
                  </p>
                </div>
                <span className="role-permissions-selected__count">
                  {selectedPermissionIds.size} permisos activos
                </span>
              </div>

              {selectedRole.name === 'admin' && (
                <div className="role-permissions-admin-note">
                  El rol admin conserva permisos críticos obligatorios.
                </div>
              )}

              {adminMissingCriticalPermissions.length > 0 && (
                <div className="alert alert--error role-permissions-critical-alert">
                  El rol admin debe conservar permisos críticos: {adminMissingCriticalPermissions.join(', ')}.
                </div>
              )}

              <div className="permission-module-grid">
                {permissionsByModule.map((group) => (
                  <section key={group.module} className="permission-module-card">
                    <div className="permission-module-card__header">
                      <h4>{formatModuleName(group.module)}</h4>
                      <span>{countSelectedPermissions(group.permissions)} / {group.permissions.length}</span>
                    </div>
                    <div className="permission-list">
                      {group.permissions.map((permission) => {
                        const checked = selectedPermissionIds.has(permission.id);
                        const isLockedAdminPermission =
                          selectedRole.name === 'admin' && ADMIN_CRITICAL_PERMISSIONS.includes(permission.id);
                        const copy = getPermissionCopy(permission);
                        return (
                          <label
                            key={permission.id}
                            className={[
                              'permission-row',
                              checked ? 'permission-row--checked' : '',
                              isLockedAdminPermission ? 'permission-row--locked' : '',
                              saving ? 'permission-row--saving' : '',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving || isLockedAdminPermission}
                              onChange={() => handlePermissionToggle(permission.id)}
                            />
                            <span className="permission-row__copy">
                              <strong>{copy.title}</strong>
                              <small>
                                {copy.description}
                              </small>
                            </span>
                            {isLockedAdminPermission && (
                              <span className="permission-row__lock">Protegido</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="permission-actions">
                <span className="permission-actions__status">
                  {hasChanges ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.'}
                </span>
                <div className="permission-actions__buttons">
                <Button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={!hasChanges || saving || adminMissingCriticalPermissions.length > 0}
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancel} disabled={!hasChanges || saving}>
                  Cancelar/Revertir
                </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="alert alert--neutral" style={{ margin: 0 }}>
              No hay roles disponibles.
            </div>
          )}
        </section>
      </div>
    </Card>
  );

  function countPermissionsForRole(roleId: string) {
    return rolePermissions.filter((item) => item.role_id === roleId).length;
  }

  function countSelectedPermissions(items: PermissionRecord[]) {
    return items.filter((permission) => selectedPermissionIds.has(permission.id)).length;
  }
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function moduleRank(module: string) {
  const index = MODULE_ORDER.indexOf(module);
  return index === -1 ? MODULE_ORDER.length : index;
}

function formatModuleName(module: string) {
  return MODULE_LABELS[module] || module;
}

function formatRoleName(roleName: string) {
  return ROLE_LABELS[roleName] || roleName;
}

function getPermissionCopy(permission: PermissionRecord) {
  return {
    title: PERMISSION_COPY[permission.id]?.title || permission.label || permission.id,
    description: PERMISSION_COPY[permission.id]?.description || permission.description || permission.id,
  };
}
