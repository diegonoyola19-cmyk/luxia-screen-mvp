-- =============================================================================
-- Habilitar Supabase Realtime para RBAC Dinamico y Auditoria
-- =============================================================================
-- Este script habilita las notificaciones en tiempo real para las tablas
-- principales de administracion, necesarias para la actualizacion automatica
-- de permisos, perfiles y actividad entre laptops.
-- 
-- Es seguro ejecutarlo multiples veces.

DO $$
BEGIN
  -- Verificar y habilitar para public.profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  -- Verificar y habilitar para public.role_permissions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'role_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;
  END IF;

  -- Verificar y habilitar para public.user_activity_log
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_log;
  END IF;
END $$;
