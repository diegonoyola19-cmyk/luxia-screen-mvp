-- ============================================================
-- Bloque 3D: release_order_inventory RPC
-- ============================================================

-- 1. DROP del stub anterior que retornaba boolean
DROP FUNCTION IF EXISTS public.release_order_inventory(uuid, uuid, text);

-- 2. CREATE FUNCTION
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_order_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id     uuid;
  v_order_status text;
  v_count_active int;
  v_count_released int;
  v_count_consumed int;
BEGIN
  -- 2. Seguridad
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated request';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Cannot act on behalf of another user';
  END IF;

  IF NOT public.has_permission(v_actor_id, 'inventory.reserve') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User does not have inventory.reserve permission';
  END IF;

  -- 3. Locks
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  -- 4. Validar orden (y lock)
  SELECT status INTO v_order_status
  FROM work_orders
  WHERE id = p_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: La orden % no existe o fue eliminada', p_order_id;
  END IF;

  -- 6. Verificar estado de las reservas para idempotencia y reglas de negocio
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'released'),
    COUNT(*) FILTER (WHERE status = 'consumed')
  INTO v_count_active, v_count_released, v_count_consumed
  FROM inventory_reservations
  WHERE order_id = p_order_id;

  -- D. Si hay consumed, no permitir release
  IF v_count_consumed > 0 THEN
    RAISE EXCEPTION 'RELEASE_NOT_ALLOWED_CONSUMED: Cannot release reservations because some are already consumed';
  END IF;

  -- C. Si no hay de ningún tipo
  IF (v_count_active + v_count_released) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'no_reservations',
      'order_id', p_order_id,
      'released_count', 0
    );
  END IF;

  -- B. Si no hay active pero hay released
  IF v_count_active = 0 AND v_count_released > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_released',
      'order_id', p_order_id,
      'released_count', 0
    );
  END IF;

  -- A. Si hay active, liberar
  -- 5. Comportamiento principal
  UPDATE inventory_reservations
  SET
    status = 'released',
    released_at = now(),
    released_by = v_actor_id,
    release_reason = COALESCE(p_reason, 'manual_release')
  WHERE order_id = p_order_id AND status = 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'released',
    'order_id', p_order_id,
    'released_count', v_count_active
  );

END;
$$;

ALTER FUNCTION public.release_order_inventory(uuid, uuid, text) OWNER TO postgres;

-- 7. Grants
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_order_inventory(uuid, uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, uuid, text) TO service_role;
