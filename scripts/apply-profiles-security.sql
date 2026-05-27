-- ==========================================
-- SCRIPT DE SEGURIDAD PARA LA TABLA PROFILES
-- ==========================================
-- Luxia Screen MVP - Gestión de Usuarios y Roles Segura
-- 
-- Este script define la seguridad RLS para la tabla public.profiles:
--  1. Evita recursión infinita en las políticas de seguridad mediante la función SECURITY DEFINER `is_admin`.
--  2. Permite a los usuarios consultar su propio perfil o a los administradores consultar todos los perfiles.
--  3. Permite únicamente a los administradores modificar roles y estados (is_active).
--  4. Asegura la cuenta inicial de administrador para Diego Hernández.
--  5. No incluye políticas de DELETE ni INSERT de acuerdo al diseño MVP Seguro.

-- -------------------------------------------------------------
-- PASO 1: Asegurar cuenta de administrador inicial (Diego Hernández)
-- -------------------------------------------------------------
-- Si la cuenta ya fue creada por Supabase Auth, este paso elevará
-- su rol a administrador y mantendrá su estado activo.
UPDATE public.profiles
SET 
  role = 'admin',
  is_active = true,
  updated_at = NOW()
WHERE email = 'diego.hernandez@vertilux.com';

-- Confirmar la cuenta de Diego Hernández en la consola SQL de Supabase
SELECT id, email, role, is_active
FROM public.profiles
WHERE email = 'diego.hernandez@vertilux.com';


-- -------------------------------------------------------------
-- PASO 2: Crear la función auxiliar para validación de roles
-- -------------------------------------------------------------
-- Usar SECURITY DEFINER ejecuta la consulta interna con privilegios de superusuario (bypass RLS),
-- evitando bucles de recursión infinita cuando la política de profiles intenta leer profiles.
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean AS $$
DECLARE
    user_role public.profiles.role%TYPE;
    user_active boolean;
BEGIN
    SELECT role, is_active INTO user_role, user_active
    FROM public.profiles
    WHERE id = user_id;
    
    RETURN (user_role = 'admin' AND user_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -------------------------------------------------------------
-- PASO 3: Habilitar Row Level Security (RLS) en la tabla profiles
-- -------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- PASO 4: Eliminar políticas previas para evitar duplicidad
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Allow select for self and admin" ON public.profiles;
DROP POLICY IF EXISTS "Allow update for admin" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;


-- -------------------------------------------------------------
-- PASO 5: Crear políticas finales para SELECT y UPDATE únicamente
-- -------------------------------------------------------------

-- Política de lectura (SELECT)
-- - Cualquier usuario autenticado puede leer su propio perfil.
-- - El usuario administrador puede leer todos los perfiles.
CREATE POLICY "Allow select for self and admin"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id 
        OR public.is_admin(auth.uid())
    );

-- Política de actualización (UPDATE)
-- - Únicamente los usuarios administradores activos pueden modificar perfiles (incluyendo rol y estado).
-- - Los usuarios normales no pueden actualizar su perfil, garantizando consistencia y control.
CREATE POLICY "Allow update for admin"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin(auth.uid())
    )
    WITH CHECK (
        public.is_admin(auth.uid())
    );

-- Nota: No se crean políticas para DELETE ni INSERT ya que la creación se maneja por triggers de Auth
-- y Luxia no contempla la eliminación física de perfiles de usuario.
