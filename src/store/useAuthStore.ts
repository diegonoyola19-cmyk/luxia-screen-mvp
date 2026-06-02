import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'produccion' | 'bodega' | 'consulta';

const FALLBACK_PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  admin: ['*'],
  produccion: [
    'production.view',
    'production.create_order',
    'production.add_to_batch',
    'orders.view',
    'orders.generate_pdf',
  ],
  bodega: [
    'inventory.view',
    'inventory.create_scrap',
    'inventory.discard_scrap',
    'inventory.export',
  ],
  consulta: [
    'production.view',
    'inventory.view',
    'orders.view',
    'orders.generate_pdf',
  ],
};

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  role_id?: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  isActive: boolean;
  loading: boolean;
  error: string | null;
  permissions: string[];
  permissionsLoading: boolean;
  permissionsError: string | null;
  
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  initialize: () => () => void;
  clearError: () => void;
  refreshPermissions: () => Promise<void>;
  hasPermission: (permissionId: string) => boolean;
  hasAnyPermission: (permissionIds: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, role_id, is_active')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile from Supabase:', error);
        throw error;
      }

      if (data) {
        console.log("[Auth] profile", data);
        return {
          role: data.role as UserRole,
          roleId: data.role_id as string | null,
          isActive: data.is_active ?? true,
          exists: true
        };
      }

      console.log("[Auth] profile", null);
      return { role: null, isActive: false, exists: false };
    } catch (err) {
      console.error('Exception fetching profile:', err);
      throw err;
    }
  };

  const fetchPermissions = async (roleId?: string | null) => {
    if (!roleId) {
      return { permissions: [], error: null };
    }

    try {
      set({ permissionsLoading: true, permissionsError: null });

      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);

      if (error) {
        throw error;
      }

      const permissions = (data || [])
        .map((row: { permission_id?: string | null }) => row.permission_id)
        .filter((permissionId): permissionId is string => Boolean(permissionId));

      return { permissions, error: null };
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('[Auth] dynamic permissions failed, using role fallback', err);
      }

      return {
        permissions: [],
        error: err?.message || 'No se pudieron cargar los permisos dinamicos.',
      };
    } finally {
      set({ permissionsLoading: false });
    }
  };

  const handleSession = async (session: Session | null) => {
    console.log("[Auth] session", session);
    
    if (!session?.user) {
      set({
        user: null,
        session: null,
        role: null,
        isActive: true,
        loading: false,
        permissions: [],
        permissionsLoading: false,
        permissionsError: null,
      });
      return;
    }

    try {
      const profile = await fetchProfile(session.user.id);
      
      if (!profile.exists) {
        set({
          user: null,
          session: null,
          role: null,
          isActive: false,
          loading: false,
          permissions: [],
          permissionsLoading: false,
          permissionsError: null,
          error: 'Tu usuario no tiene perfil asignado. Contacta al administrador.'
        });
        // Desvincular de manera no bloqueante
        supabase.auth.signOut().catch(() => {});
        return;
      }

      if (!profile.isActive) {
        set({
          user: null,
          session: null,
          role: null,
          isActive: false,
          loading: false,
          permissions: [],
          permissionsLoading: false,
          permissionsError: null,
          error: 'Esta cuenta está desactivada. Contacta al administrador.'
        });
        supabase.auth.signOut().catch(() => {});
        return;
      }

      const permissionsResult = await fetchPermissions(profile.roleId);

      set({
        user: session.user,
        session: session,
        role: profile.role,
        isActive: profile.isActive,
        permissions: permissionsResult.permissions,
        permissionsError: permissionsResult.error,
        loading: false,
        error: null
      });

      if (globalAuthChannel) {
        supabase.removeChannel(globalAuthChannel);
      }

      globalAuthChannel = supabase.channel(`auth_updates_${session.user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
          (payload) => {
            const newProfile = payload.new;
            if (newProfile.is_active === false) {
              get().signOut();
            } else {
              const currentRole = get().role;
              // refresh if role changed
              if (newProfile.role !== currentRole) {
                get().refreshPermissions();
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'role_permissions', filter: `role_id=eq.${profile.roleId}` },
          () => {
            if (refreshDebounceTimeout) clearTimeout(refreshDebounceTimeout);
            refreshDebounceTimeout = setTimeout(() => {
              get().refreshPermissions();
            }, 500);
          }
        )
        .subscribe();
    } catch (err) {
      console.error("[Auth] initialize failed", err);
      set({ 
        user: null,
        session: null,
        role: null,
        loading: false, 
        permissions: [],
        permissionsLoading: false,
        permissionsError: null,
        error: 'No se pudo conectar con Supabase. Verifica conexión o estado del proyecto.' 
      });
    }
  };

  let initCalled = false;
  let globalAuthChannel: ReturnType<typeof supabase.channel> | null = null;
  let refreshDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  return {
    user: null,
    session: null,
    role: null,
    isActive: true,
    loading: true,
    error: null,
    permissions: [],
    permissionsLoading: false,
    permissionsError: null,

    clearError: () => set({ error: null }),

    refreshPermissions: async () => {
      const { user } = get();
      if (!user) {
        set({ permissions: [], permissionsError: null, permissionsLoading: false });
        return;
      }

      const profile = await fetchProfile(user.id);
      if (!profile.exists || !profile.isActive) {
        set({ permissions: [], permissionsError: null, permissionsLoading: false });
        return;
      }

      const permissionsResult = await fetchPermissions(profile.roleId);
      set({
        role: profile.role,
        isActive: profile.isActive,
        permissions: permissionsResult.permissions,
        permissionsError: permissionsResult.error,
      });
    },

    hasPermission: (permissionId) => {
      const { permissions, role } = get();

      if (permissions.length > 0) {
        return permissions.includes(permissionId);
      }

      if (!role) {
        return false;
      }

      const fallbackPermissions = FALLBACK_PERMISSIONS_BY_ROLE[role] || [];
      return fallbackPermissions.includes('*') || fallbackPermissions.includes(permissionId);
    },

    hasAnyPermission: (permissionIds) => {
      const { hasPermission } = get();
      return permissionIds.some((permissionId) => hasPermission(permissionId));
    },

    signIn: async (email, password) => {
      set({ loading: true, error: null, permissionsError: null });
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          set({ loading: false, error: error.message });
          return { success: false, error: error.message };
        }

        if (data?.session) {
           await handleSession(data.session);
           const state = get();
           if (state.error) {
             return { success: false, error: state.error };
           }
           return { success: true };
        }

        set({ loading: false });
        return { success: false, error: 'Error inesperado al iniciar sesión.' };
      } catch (err: any) {
        set({ loading: false, error: 'No se pudo conectar con Supabase. Verifica conexión o estado del proyecto.' });
        return { success: false, error: 'No se pudo conectar con Supabase. Verifica conexión o estado del proyecto.' };
      }
    },

    signOut: async () => {
      set({ loading: true });
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Error signing out:', err);
      } finally {
        if (globalAuthChannel) {
          supabase.removeChannel(globalAuthChannel);
          globalAuthChannel = null;
        }
        set({
          user: null,
          session: null,
          role: null,
          isActive: true,
          loading: false,
          permissions: [],
          permissionsLoading: false,
          permissionsError: null,
          error: null
        });
      }
    },

    initialize: () => {
      if (initCalled) return () => {};
      initCalled = true;
      
      set({ loading: true });

      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) throw error;
        handleSession(session);
      }).catch(err => {
        console.error("[Auth] initialize failed", err);
        set({ 
          loading: false, 
          permissions: [],
          permissionsLoading: false,
          permissionsError: null,
          error: 'No se pudo conectar con Supabase. Verifica conexión o estado del proyecto.' 
        });
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          // Ignoramos INITIAL_SESSION aquí para no duplicar el trabajo de getSession()
          if (event !== 'INITIAL_SESSION') {
             handleSession(session);
          }
        }
      );

      return () => {
        subscription.unsubscribe();
        initCalled = false;
      };
    }
  };
});
