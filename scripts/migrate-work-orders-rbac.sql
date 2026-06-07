-- =============================================================================
-- Migracion Fase 5B: Endurecer RLS de work_orders con RBAC
-- =============================================================================

-- 1. Insertar permiso nuevo: orders.edit
INSERT INTO public.permissions (id, module, action, label, description)
VALUES (
  'orders.edit',
  'orders',
  'edit',
  'Editar órdenes',
  'Permite modificar órdenes guardadas'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Asignar orders.edit a admin y produccion
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('admin', 'produccion')
  AND p.id = 'orders.edit'
ON CONFLICT DO NOTHING;

-- 3. Crear función auxiliar para verificación de permisos RLS
-- SECURITY DEFINER permite saltar las reglas RLS de la tabla profiles y roles
-- para evitar recursión. STABLE ayuda al planeador de Postgres a cachearla.
CREATE OR REPLACE FUNCTION public.has_permission(user_id uuid, req_permission text)
RETURNS boolean AS $$
DECLARE
    user_role_id uuid;
    has_perm boolean;
BEGIN
    IF user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Obtener el role_id del usuario
    SELECT role_id INTO user_role_id
    FROM public.profiles
    WHERE id = user_id;

    IF user_role_id IS NULL THEN
        RETURN false;
    END IF;

    -- Verificar si el rol tiene el permiso
    SELECT EXISTS (
        SELECT 1
        FROM public.role_permissions
        WHERE role_id = user_role_id
          AND permission_id = req_permission
    ) INTO has_perm;

    RETURN has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;


-- 4. Habilitar RLS explícitamente (por si acaso no estuviera)
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- 5. Eliminar policies anteriores/provisionales
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.work_orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.work_orders;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.work_orders;

DROP POLICY IF EXISTS "work_orders_select_rbac" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_insert_rbac" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_update_rbac" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_delete_rbac" ON public.work_orders;

-- 6. Crear nuevas policies RBAC
CREATE POLICY "work_orders_select_rbac"
ON public.work_orders FOR SELECT
USING (public.has_permission(auth.uid(), 'orders.view'));

CREATE POLICY "work_orders_insert_rbac"
ON public.work_orders FOR INSERT
WITH CHECK (public.has_permission(auth.uid(), 'production.create_order'));

CREATE POLICY "work_orders_update_rbac"
ON public.work_orders FOR UPDATE
USING (public.has_permission(auth.uid(), 'orders.edit'))
WITH CHECK (public.has_permission(auth.uid(), 'orders.edit'));

CREATE POLICY "work_orders_delete_rbac"
ON public.work_orders FOR DELETE
USING (public.has_permission(auth.uid(), 'orders.delete'));

-- TODO: Si en un futuro se requiere que los usuarios solo puedan editar sus propias órdenes
-- (a menos que sean admins), la lógica se puede ajustar dentro de estas políticas o en has_permission.
