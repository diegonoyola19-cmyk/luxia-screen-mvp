import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'produccion' | 'bodega' | 'consulta';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
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
  
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  initialize: () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_active')
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

  const handleSession = async (session: Session | null) => {
    console.log("[Auth] session", session);
    
    if (!session?.user) {
      set({ user: null, session: null, role: null, isActive: true, loading: false });
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
          error: 'Esta cuenta está desactivada. Contacta al administrador.'
        });
        supabase.auth.signOut().catch(() => {});
        return;
      }

      set({
        user: session.user,
        session: session,
        role: profile.role,
        isActive: profile.isActive,
        loading: false,
        error: null
      });
    } catch (err) {
      console.error("[Auth] initialize failed", err);
      set({ 
        user: null,
        session: null,
        role: null,
        loading: false, 
        error: 'No se pudo conectar con Supabase. Verifica conexión o estado del proyecto.' 
      });
    }
  };

  let initCalled = false;

  return {
    user: null,
    session: null,
    role: null,
    isActive: true,
    loading: true,
    error: null,

    clearError: () => set({ error: null }),

    signIn: async (email, password) => {
      set({ loading: true, error: null });
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
        set({
          user: null,
          session: null,
          role: null,
          isActive: true,
          loading: false,
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
