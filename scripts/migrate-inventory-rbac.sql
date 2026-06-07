-- ==========================================
-- FASE 5B.1: Migración de Inventario a Supabase
-- ==========================================

-- 1. Asegurar la existencia de los permisos en la tabla "permissions"
INSERT INTO public.permissions (id, module, action, label, description) VALUES
('inventory.view', 'inventory', 'view', 'Ver inventario', 'Permite consultar el inventario'),
('inventory.consume', 'inventory', 'consume', 'Consumir inventario', 'Permite consumir inventario mediante órdenes'),
('inventory.adjust', 'inventory', 'adjust', 'Ajustar inventario', 'Permite ajustar inventario manualmente'),
('inventory.import', 'inventory', 'import', 'Importar inventario', 'Permite importar inventario inicial'),
('inventory.delete', 'inventory', 'delete', 'Borrar inventario', 'Borrar permanentemente registros de inventario')
ON CONFLICT (id) DO NOTHING;

-- 1.5 Asignar permisos básicos a roles existentes
-- Admin: todo
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'admin' AND p.id LIKE 'inventory.%'
ON CONFLICT DO NOTHING;

-- Producción y Bodega: view, consume, adjust
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name IN ('produccion', 'bodega') AND p.id IN ('inventory.view', 'inventory.consume', 'inventory.adjust')
ON CONFLICT DO NOTHING;

-- Ventas: view
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p 
WHERE r.name = 'ventas' AND p.id = 'inventory.view'
ON CONFLICT DO NOTHING;

-- 2. Crear tabla inventory_items
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('fabric', 'tube', 'bottom', 'component')),
    kind TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'used', 'discarded', 'deleted')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_from_order_id UUID NULL REFERENCES public.work_orders(id),
    source TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    deleted_at TIMESTAMPTZ NULL,
    created_by UUID NULL REFERENCES auth.users(id),
    updated_by UUID NULL REFERENCES auth.users(id)
);

-- 3. Crear tabla inventory_movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NULL REFERENCES public.inventory_items(id),
    order_id UUID NULL REFERENCES public.work_orders(id),
    category TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('import', 'adjust', 'reserve', 'consume', 'create_scrap', 'use_scrap', 'discard', 'transfer', 'rollback')),
    item_code TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity >= 0),
    unit TEXT NOT NULL,
    notes TEXT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by UUID NULL REFERENCES auth.users(id)
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON public.inventory_items(code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_deleted_at ON public.inventory_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_created_from_order_id ON public.inventory_items(created_from_order_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_item_id ON public.inventory_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order_id ON public.inventory_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_action ON public.inventory_movements(action);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);

-- 5. Habilitar RLS
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 6. Limpiar policies previas por si este script se corre múltiples veces
DROP POLICY IF EXISTS "inventory_items_select_rbac" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_insert_rbac" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update_rbac" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_delete_rbac" ON public.inventory_items;

DROP POLICY IF EXISTS "inventory_movements_select_rbac" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_insert_rbac" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_update_rbac" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_delete_rbac" ON public.inventory_movements;

-- Eliminar políticas por defecto de supabase por si acaso
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.inventory_items;

DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.inventory_movements;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.inventory_movements;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.inventory_movements;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.inventory_movements;

-- 7. Crear Policies: inventory_items
CREATE POLICY "inventory_items_select_rbac" ON public.inventory_items
FOR SELECT USING (public.has_permission(auth.uid(), 'inventory.view'));

CREATE POLICY "inventory_items_insert_rbac" ON public.inventory_items
FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), 'inventory.adjust') OR 
    public.has_permission(auth.uid(), 'inventory.import') OR 
    public.has_permission(auth.uid(), 'inventory.consume')
);

CREATE POLICY "inventory_items_update_rbac" ON public.inventory_items
FOR UPDATE USING (
    public.has_permission(auth.uid(), 'inventory.adjust') OR 
    public.has_permission(auth.uid(), 'inventory.consume')
);

CREATE POLICY "inventory_items_delete_rbac" ON public.inventory_items
FOR DELETE USING (public.has_permission(auth.uid(), 'inventory.delete'));


-- 8. Crear Policies: inventory_movements
CREATE POLICY "inventory_movements_select_rbac" ON public.inventory_movements
FOR SELECT USING (public.has_permission(auth.uid(), 'inventory.view'));

CREATE POLICY "inventory_movements_insert_rbac" ON public.inventory_movements
FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), 'inventory.adjust') OR 
    public.has_permission(auth.uid(), 'inventory.import') OR 
    public.has_permission(auth.uid(), 'inventory.consume')
);

-- Solo el admin con permisos de borrado puede editar/borrar historial de movimientos (inmutabilidad recomendada)
CREATE POLICY "inventory_movements_update_rbac" ON public.inventory_movements
FOR UPDATE USING (public.has_permission(auth.uid(), 'inventory.delete'));

CREATE POLICY "inventory_movements_delete_rbac" ON public.inventory_movements
FOR DELETE USING (public.has_permission(auth.uid(), 'inventory.delete'));
