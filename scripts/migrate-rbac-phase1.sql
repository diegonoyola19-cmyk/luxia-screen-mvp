-- =============================================================================
-- FASE 1: RBAC dinamico base
-- =============================================================================
-- Objetivo:
-- - Preparar tablas de roles y permisos dinamicos.
-- - Mantener public.profiles.role como fuente principal actual.
-- - No cambiar login, frontend, navegacion ni Edge Functions.
-- - Ser idempotente para poder ejecutarse mas de una vez.
--
-- Requisito previo:
-- - public.profiles debe existir y conservar la columna role actual.
-- =============================================================================

-- 1. Catalogo de permisos disponibles.
CREATE TABLE IF NOT EXISTS public.permissions (
  id text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  description text
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura a todos los autenticados" ON public.permissions;
DROP POLICY IF EXISTS "permissions_select_authenticated" ON public.permissions;
CREATE POLICY "permissions_select_authenticated"
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Catalogo de roles dinamicos.
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura a todos los autenticados" ON public.roles;
DROP POLICY IF EXISTS "roles_select_authenticated" ON public.roles;
CREATE POLICY "roles_select_authenticated"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Relacion muchos-a-muchos entre roles y permisos.
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id text REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura a todos los autenticados" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_select_authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions_select_authenticated"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Enlace opcional desde profiles hacia roles dinamicos.
-- public.profiles.role se mantiene intacto como fuente principal actual.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);

-- 5. Semilla de permisos base.
INSERT INTO public.permissions (id, module, action, label, description) VALUES
  ('production.view', 'production', 'view', 'Ver Produccion', 'Ver modulo de produccion'),
  ('production.create_order', 'production', 'create_order', 'Crear Ordenes', 'Calcular y crear ordenes'),
  ('production.add_to_batch', 'production', 'add_to_batch', 'Agregar a Lote', 'Agregar ordenes a lotes'),
  ('inventory.view', 'inventory', 'view', 'Ver Bodega', 'Ver inventario de bodega'),
  ('inventory.create_scrap', 'inventory', 'create_scrap', 'Registrar Retazo', 'Crear retazo manual'),
  ('inventory.discard_scrap', 'inventory', 'discard_scrap', 'Dar de baja sobrante', 'Dar de baja sobrantes'),
  ('inventory.export', 'inventory', 'export', 'Exportar Lista', 'Exportar inventario a Excel'),
  ('orders.view', 'orders', 'view', 'Ver Ordenes', 'Ver historial de ordenes'),
  ('orders.generate_pdf', 'orders', 'generate_pdf', 'Generar PDF', 'Generar PDFs y etiquetas'),
  ('orders.export_sage', 'orders', 'export_sage', 'Exportar a Sage', 'Exportar a Sage'),
  ('orders.delete', 'orders', 'delete', 'Eliminar Orden', 'Eliminar ordenes del historial'),
  ('settings.view', 'settings', 'view', 'Ver Configuracion', 'Ver configuracion del sistema'),
  ('settings.edit_rules', 'settings', 'edit_rules', 'Editar Reglas', 'Editar reglas JSON y tolerancias'),
  ('users.view', 'users', 'view', 'Ver Usuarios', 'Ver panel de usuarios'),
  ('users.create_user', 'users', 'create_user', 'Crear Usuario', 'Crear nuevos usuarios'),
  ('users.edit_roles', 'users', 'edit_roles', 'Editar Roles', 'Crear, editar y asignar roles'),
  ('users.disable_user', 'users', 'disable_user', 'Desactivar Usuarios', 'Activar o desactivar usuarios')
ON CONFLICT (id) DO NOTHING;

-- 6. Semilla de roles base equivalentes a los roles fijos actuales.
INSERT INTO public.roles (name, description, is_system) VALUES
  ('admin', 'Administrador del sistema con acceso total', true),
  ('produccion', 'Personal de planta y manufactura', true),
  ('bodega', 'Personal encargado de retazos e inventario', true),
  ('consulta', 'Usuario de solo lectura general', true)
ON CONFLICT (name) DO NOTHING;

-- 7. Permisos del rol admin: todos.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- 8. Permisos del rol produccion.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'produccion'
  AND p.id IN (
    'production.view',
    'production.create_order',
    'production.add_to_batch',
    'orders.view',
    'orders.generate_pdf'
  )
ON CONFLICT DO NOTHING;

-- 9. Permisos del rol bodega.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'bodega'
  AND p.id IN (
    'inventory.view',
    'inventory.create_scrap',
    'inventory.discard_scrap',
    'inventory.export'
  )
ON CONFLICT DO NOTHING;

-- 10. Permisos del rol consulta.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'consulta'
  AND p.id IN (
    'production.view',
    'inventory.view',
    'orders.view',
    'orders.generate_pdf'
  )
ON CONFLICT DO NOTHING;

-- 11. Migracion no destructiva de perfiles actuales.
-- Solo rellena role_id cuando esta vacio y existe un rol dinamico con el mismo name.
UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE p.role::text = r.name
  AND p.role_id IS NULL;
