-- ==========================================
-- FASE 4B.1: Hardening DDL para Reservas de Inventario
-- ==========================================

-- 1. Crear tabla inventory_reservations
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL CHECK (length(trim(sku)) > 0),
    material_line_id TEXT NULL,
    required_quantity NUMERIC NOT NULL CHECK (required_quantity > 0),
    quantity_reserved NUMERIC NOT NULL CHECK (quantity_reserved > 0 AND quantity_reserved <= required_quantity),
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    source TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by UUID NULL REFERENCES auth.users(id),
    
    released_at TIMESTAMPTZ NULL,
    released_by UUID NULL REFERENCES auth.users(id),
    release_reason TEXT NULL,
    
    consumed_at TIMESTAMPTZ NULL,
    consumed_by UUID NULL REFERENCES auth.users(id)
);

-- 2. Constraints de integridad para estados
ALTER TABLE public.inventory_reservations DROP CONSTRAINT IF EXISTS chk_active_data;
ALTER TABLE public.inventory_reservations
ADD CONSTRAINT chk_active_data CHECK (
    (status = 'active' AND released_at IS NULL AND consumed_at IS NULL) OR (status != 'active')
);

ALTER TABLE public.inventory_reservations DROP CONSTRAINT IF EXISTS chk_released_data;
ALTER TABLE public.inventory_reservations
ADD CONSTRAINT chk_released_data CHECK (
    (status = 'released' AND released_at IS NOT NULL) OR (status != 'released')
);

ALTER TABLE public.inventory_reservations DROP CONSTRAINT IF EXISTS chk_consumed_data;
ALTER TABLE public.inventory_reservations
ADD CONSTRAINT chk_consumed_data CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL) OR (status != 'consumed')
);

-- 3. Idempotencia y Concurrencia
-- Se utiliza COALESCE con '**unknown**' para que PostgreSQL trate a las líneas sin ID como equivalentes
-- en lugar de permitir filas duplicadas si material_line_id es NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_idempotency 
ON public.inventory_reservations(order_id, inventory_item_id, COALESCE(material_line_id, '**unknown**')) 
WHERE status = 'active';

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order_id ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_inventory_item_id ON public.inventory_reservations(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status ON public.inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_sku ON public.inventory_reservations(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status_order ON public.inventory_reservations(status, order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status_item ON public.inventory_reservations(status, inventory_item_id);

-- Índice recomendado para cálculos rápidos de disponibilidad: SUM(quantity_reserved)
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_active_items 
ON public.inventory_reservations(inventory_item_id) 
WHERE status = 'active';

-- 5. Habilitar RLS
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- Limpiar policies por si el script se vuelve a correr
DROP POLICY IF EXISTS "reservations_select_rbac" ON public.inventory_reservations;
DROP POLICY IF EXISTS "reservations_insert_rbac" ON public.inventory_reservations;
DROP POLICY IF EXISTS "reservations_update_rbac" ON public.inventory_reservations;
DROP POLICY IF EXISTS "reservations_delete_rbac" ON public.inventory_reservations;

-- 6. Crear Policies de Seguridad (Justificación RLS)

-- SELECT: Permitido para roles que tengan permiso de ver inventario u órdenes.
CREATE POLICY "reservations_select_rbac" ON public.inventory_reservations
FOR SELECT USING (
    public.has_permission(auth.uid(), 'inventory.view') OR 
    public.has_permission(auth.uid(), 'orders.view')
);

-- INSERT / UPDATE / DELETE: Bloqueados explícitamente para el cliente con WITH CHECK(false) y USING(false).
-- Esto asegura que los clientes autenticados no puedan realizar mutaciones directamente.
CREATE POLICY "reservations_insert_rbac" ON public.inventory_reservations
FOR INSERT WITH CHECK (false);

CREATE POLICY "reservations_update_rbac" ON public.inventory_reservations
FOR UPDATE USING (false);

CREATE POLICY "reservations_delete_rbac" ON public.inventory_reservations
FOR DELETE USING (false);
