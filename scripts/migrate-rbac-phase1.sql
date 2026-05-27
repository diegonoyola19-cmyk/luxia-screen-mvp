-- ==============================================================================
-- FASE 1: Migración a RBAC Dinámico (Tablas y Semilla)
-- Este script es 100% seguro y reversible. No altera el login ni UI actuales.
-- ==============================================================================

-- PASO 0: Verificar que public.profiles existe antes de continuar.
-- Ejecuta esto primero de forma separada. Si hay error, ejecuta el setup de auth primero.
select id, email, role from public.profiles limit 1;

-- ==============================================================================
-- Una vez confirmado que profiles existe, ejecuta el resto del script:
-- ==============================================================================

-- 1. Crear tabla permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT
);

-- Habilitar RLS y policies para permissions
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura a todos los autenticados" ON public.permissions;
CREATE POLICY "Permitir lectura a todos los autenticados" ON public.permissions FOR SELECT TO authenticated USING (true);

-- 2. Crear tabla roles
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS para roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura a todos los autenticados" ON public.roles FOR SELECT TO authenticated USING (true);

-- 3. Crear tabla intermedia role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id TEXT REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Habilitar RLS para role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura a todos los autenticados" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- 4. Modificar tabla profiles para soportar role_id (manteniendo 'role' como fallback)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id);

-- 5. Poblar catálogo de permisos
INSERT INTO public.permissions (id, module, action, label, description) VALUES
('production.view', 'production', 'view', 'Ver Producción', 'Ver módulo de producción'),
('production.create_order', 'production', 'create_order', 'Crear Órdenes', 'Calcular y crear órdenes'),
('production.add_to_batch', 'production', 'add_to_batch', 'Agregar a Lote', 'Agregar órdenes a lotes'),
('inventory.view', 'inventory', 'view', 'Ver Bodega', 'Ver inventario de bodega'),
('inventory.create_scrap', 'inventory', 'create_scrap', 'Registrar Retazo', 'Crear retazo manual'),
('inventory.discard_scrap', 'inventory', 'discard_scrap', 'Dar de baja sobrante', 'Dar de baja sobrantes'),
('inventory.export', 'inventory', 'export', 'Exportar Lista', 'Exportar inventario a Excel'),
('orders.view', 'orders', 'view', 'Ver Órdenes', 'Ver historial de órdenes'),
('orders.generate_pdf', 'orders', 'generate_pdf', 'Generar PDF', 'Generar PDFs y etiquetas'),
('orders.export_sage', 'orders', 'export_sage', 'Exportar a Sage', 'Exportar a Sage'),
('orders.delete', 'orders', 'delete', 'Eliminar Orden', 'Eliminar órdenes del historial'),
('settings.view', 'settings', 'view', 'Ver Configuración', 'Ver configuración del sistema'),
('settings.edit_rules', 'settings', 'edit_rules', 'Editar Reglas', 'Editar reglas JSON y tolerancias'),
('users.view', 'users', 'view', 'Ver Usuarios', 'Ver panel de usuarios'),
('users.create_user', 'users', 'create_user', 'Crear Usuario', 'Crear nuevos usuarios'),
('users.edit_roles', 'users', 'edit_roles', 'Editar Roles', 'Crear, editar y asignar roles'),
('users.disable_user', 'users', 'disable_user', 'Desactivar Usuarios', 'Activar o desactivar usuarios')
ON CONFLICT (id) DO NOTHING;

-- 6. Poblar roles base del sistema
INSERT INTO public.roles (name, description, is_system) VALUES
('admin', 'Administrador del sistema con acceso total', true),
('produccion', 'Personal de planta y manufactura', true),
('bodega', 'Personal encargado de retazos e inventario', true),
('consulta', 'Usuario de solo lectura general', true)
ON CONFLICT (name) DO NOTHING;

-- 7. Asignar permisos a rol admin (TODOS los permisos)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- 8. Asignar permisos a rol produccion
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'produccion' AND p.id IN ('production.view', 'production.create_order', 'production.add_to_batch', 'orders.view', 'orders.generate_pdf')
ON CONFLICT DO NOTHING;

-- 9. Asignar permisos a rol bodega
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'bodega' AND p.id IN ('inventory.view', 'inventory.create_scrap', 'inventory.discard_scrap', 'inventory.export')
ON CONFLICT DO NOTHING;

-- 10. Asignar permisos a rol consulta
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'consulta' AND p.id IN ('production.view', 'inventory.view', 'orders.view', 'orders.generate_pdf')
ON CONFLICT DO NOTHING;

-- 11. Migrar profiles actuales asignando el role_id correspondiente
-- Esto busca el nombre del rol estático actual (ej. 'admin') en la tabla roles y lo enlaza
UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE p.role = r.name AND p.role_id IS NULL;
