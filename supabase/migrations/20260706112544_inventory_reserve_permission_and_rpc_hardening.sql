-- ============================================================
-- Bloque 3B: Permiso inventory.reserve + Endurecimiento RPC/RLS
-- Versión 1.1 (Bloque 3B.1) — corregida post-detección de riesgos
-- ============================================================
--
-- Schema real confirmado:
--   permissions      → id TEXT PK, module TEXT, action TEXT, label TEXT, description TEXT
--   permissions PK   → id (ON CONFLICT (id))
--
--   roles            → id UUID DEFAULT gen_random_uuid() NOT NULL
--                       name TEXT NOT NULL
--                       UNIQUE CONSTRAINT: roles_name_key (name)
--                       PRIMARY KEY: roles_pkey (id)
--
--   role_permissions → role_id UUID NOT NULL  (FK → roles.id ON DELETE CASCADE)
--                       permission_id TEXT NOT NULL (FK → permissions.id ON DELETE CASCADE)
--                       PRIMARY KEY: role_permissions_pkey (role_id, permission_id)
--
--   user_role_type ENUM: 'admin', 'produccion', 'bodega', 'consulta'
--
-- RPCs relacionadas con reservas (firmas reales del initial_schema):
--   public.reserve_order_inventory(p_order_id uuid, p_user_id uuid)    → boolean
--   public.release_order_inventory(p_order_id uuid, p_user_id uuid, p_reason text) → boolean
--
-- GRANTs existentes en initial_schema (se corrigen aquí):
--   GRANT ALL ON FUNCTION public.reserve_order_inventory(uuid, uuid) TO anon   ← REVOCAR
--   GRANT ALL ON FUNCTION public.release_order_inventory(uuid, uuid, text) TO anon ← REVOCAR
--   GRANT ALL ON TABLE public.inventory_reservations TO anon          ← REVOCAR DML
--   GRANT ALL ON TABLE public.inventory_reservations TO authenticated ← REVOCAR DML
-- ============================================================


-- ── A. Seed permiso inventory.reserve ────────────────────────────────────────
--
-- Schema real: id TEXT PK, module TEXT, action TEXT, label TEXT, description TEXT.
-- ON CONFLICT (id) garantiza idempotencia total.

INSERT INTO public.permissions (id, module, action, label, description)
VALUES (
    'inventory.reserve',
    'inventory',
    'reserve',
    'Reservar inventario',
    'Permite crear reservas transaccionales de inventario antes de producción'
)
ON CONFLICT (id) DO NOTHING;


-- ── B. Seed de roles base (idempotente) ──────────────────────────────────────
--
-- La tabla roles no tiene seed en initial_schema.
-- Después de db reset queda vacía → role_permissions insertaría 0 filas.
-- Se insertan los 4 roles del ENUM user_role_type con ON CONFLICT (name) DO NOTHING.
--
-- Columnas reales: id UUID (DEFAULT gen_random_uuid()), name TEXT, description TEXT,
--                  is_system BOOLEAN DEFAULT false, created_at, updated_at.
-- Se omite id (DEFAULT) para dejar que la BD lo genere.
-- UNIQUE constraint confirmada: roles_name_key (name).
--
-- is_system = true para roles core del sistema (no borrables por UI).

INSERT INTO public.roles (name, description, is_system)
VALUES
    ('admin',      'Administrador del sistema',              true),
    ('produccion', 'Operador de producción',                 true),
    ('bodega',     'Operador de bodega e inventario',        true),
    ('consulta',   'Usuario de solo lectura',                true)
ON CONFLICT (name) DO NOTHING;


-- ── C. Asignar inventory.reserve a roles autorizados ─────────────────────────
--
-- Roles autorizados: admin, produccion, bodega.
-- consulta NO recibe este permiso.
-- PK compuesta (role_id, permission_id) → ON CONFLICT DO NOTHING = idempotente.
-- La FK a permissions(id) se satisface porque inventory.reserve ya fue insertado arriba.

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, 'inventory.reserve'
FROM public.roles r
WHERE r.name IN ('admin', 'produccion', 'bodega')
ON CONFLICT DO NOTHING;


-- ── D. Revocar EXECUTE desde anon en RPCs de reserva ─────────────────────────
--
-- JUSTIFICACIÓN:
--   El initial_schema incluye "GRANT ALL ON FUNCTION ... TO anon" para estas RPCs.
--   Aunque tienen SECURITY DEFINER + has_permission(), el principio de mínimo
--   privilegio exige que anon no pueda siquiera intentar invocarlas.
--   Desde anon, auth.uid() = NULL y has_permission() retornaría false — pero
--   es superficie de ataque innecesaria.
--
-- Firmas exactas del initial_schema (líneas 1300 y 1294):
--   public.reserve_order_inventory(uuid, uuid)
--   public.release_order_inventory(uuid, uuid, text)
--
-- Se CONSERVA: GRANT para authenticated y service_role.
-- No se toca: process_order_inventory_tx (flujo productivo legacy activo —
--   decisión explícita: preservar hasta Bloque 3G).

REVOKE EXECUTE
    ON FUNCTION public.reserve_order_inventory(uuid, uuid)
    FROM anon;

REVOKE EXECUTE
    ON FUNCTION public.release_order_inventory(uuid, uuid, text)
    FROM anon;


-- ── E. Endurecer tabla inventory_reservations (defensa en profundidad) ────────
--
-- initial_schema tiene GRANT ALL ON TABLE inventory_reservations TO anon/authenticated.
-- Aunque las policies RLS ya bloquean INSERT/UPDATE/DELETE, "defensa en profundidad"
-- exige revocar también los GRANTs de tabla.
--
-- Se revoca solo DML (INSERT, UPDATE, DELETE).
-- SELECT se conserva: es necesario para que el frontend pueda leer reservas
-- (sujeto a las policies RLS de SELECT que ya exigen has_permission).
--
-- No se toca service_role (necesario para Edge Functions y operaciones admin).

REVOKE INSERT, UPDATE, DELETE
    ON TABLE public.inventory_reservations
    FROM anon;

REVOKE INSERT, UPDATE, DELETE
    ON TABLE public.inventory_reservations
    FROM authenticated;


-- ── F. Verificación de RLS inventory_reservations (sin cambios — ya correctas) ─
--
-- Las siguientes policies existen en 20260706085235_inventory_reservations.sql:
--
--   reservations_select_rbac  → SELECT: has_permission(uid, 'inventory.view') OR
--                                        has_permission(uid, 'orders.view')
--   reservations_insert_rbac  → INSERT: WITH CHECK (false)   ← frontend BLOQUEADO
--   reservations_update_rbac  → UPDATE: USING (false)        ← frontend BLOQUEADO
--   reservations_delete_rbac  → DELETE: USING (false)        ← frontend BLOQUEADO
--
-- Las RPCs SECURITY DEFINER operan como postgres/service_role internamente,
-- por lo que los REVOKE de authenticated no les afectan.
