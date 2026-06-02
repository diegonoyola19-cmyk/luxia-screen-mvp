-- =============================================================================
-- Migracion Fase 5A: Actualizar tabla work_orders y habilitar Realtime
-- Script idempotente que no asume que la tabla esta vacia o recien creada
-- =============================================================================

-- 1. Crear tabla minima si no existe
CREATE TABLE IF NOT EXISTS public.work_orders (
  id uuid PRIMARY KEY
);

-- 2. Agregar columnas usando ADD COLUMN IF NOT EXISTS
-- NOTA: order_number y payload se agregan sin la restriccion NOT NULL 
-- para evitar errores si la tabla ya contiene filas sin estos datos.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'luxia',
  ADD COLUMN IF NOT EXISTS local_migrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. Indices utiles
CREATE INDEX IF NOT EXISTS idx_work_orders_order_number ON public.work_orders (order_number);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders (status);
CREATE INDEX IF NOT EXISTS idx_work_orders_deleted_at ON public.work_orders (deleted_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_updated_at ON public.work_orders (updated_at DESC);

-- 4. Habilitar RLS
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- 5. Creacion de politicas de seguridad
-- TODO: En una fase futura, endurecer estas politicas con RBAC granular usando la tabla role_permissions.
DO $$ 
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'work_orders' AND policyname = 'Enable read for authenticated users'
  ) THEN
      CREATE POLICY "Enable read for authenticated users" 
      ON public.work_orders FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'work_orders' AND policyname = 'Enable insert for authenticated users'
  ) THEN
      CREATE POLICY "Enable insert for authenticated users" 
      ON public.work_orders FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'work_orders' AND policyname = 'Enable update for authenticated users'
  ) THEN
      CREATE POLICY "Enable update for authenticated users" 
      ON public.work_orders FOR UPDATE
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 6. Habilitar Realtime para public.work_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'work_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;
  END IF;
END $$;
