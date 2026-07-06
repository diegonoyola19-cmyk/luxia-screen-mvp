-- 1. Seed de permiso inventory.consume
INSERT INTO public.permissions (id, module, action, label, description)
VALUES ('inventory.consume', 'inventory', 'consume', 'Consumir Inventario', 'Consumir reservas de inventario físicas para órdenes')
ON CONFLICT (id) DO NOTHING;

-- Asignar a admin y produccion
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT id, 'inventory.consume' FROM public.roles WHERE name IN ('admin', 'produccion')
ON CONFLICT DO NOTHING;

-- 2. Crear RPC
DROP FUNCTION IF EXISTS public.consume_order_inventory_reservations(uuid, uuid);

CREATE OR REPLACE FUNCTION public.consume_order_inventory_reservations(
  p_order_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor_id uuid;
  v_order record;
  v_res_record record;
  v_item record;
  v_active_count int := 0;
  v_consumed_count int := 0;
  v_released_count int := 0;
  v_total_reservations int := 0;
  v_current numeric;
  v_new numeric;
  v_new_payload jsonb;
  v_length_meters numeric;
BEGIN
  -- Seguridad
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF NOT public.has_permission(v_actor_id, 'inventory.consume') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Lock y orden
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT *
  INTO v_order
  FROM public.work_orders
  WHERE id = p_order_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Estados de reserva
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'consumed'),
    COUNT(*) FILTER (WHERE status = 'released')
  INTO v_total_reservations, v_active_count, v_consumed_count, v_released_count
  FROM public.inventory_reservations
  WHERE order_id = p_order_id;

  IF v_total_reservations = 0 THEN
    RAISE EXCEPTION 'NO_RESERVATIONS';
  END IF;

  IF v_consumed_count = v_total_reservations THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_consumed', 'order_id', p_order_id, 'consumed_count', 0);
  END IF;

  IF v_released_count > 0 THEN
    RAISE EXCEPTION 'RESERVATION_RELEASED';
  END IF;

  IF v_consumed_count > 0 AND v_active_count > 0 THEN
    RAISE EXCEPTION 'INCONSISTENT_RESERVATION_STATE';
  END IF;

  IF v_active_count <> v_total_reservations THEN
    RAISE EXCEPTION 'INCONSISTENT_RESERVATION_STATE';
  END IF;

  -- Validar estado para consumo nuevo
  IF v_order.status <> 'in_production' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS';
  END IF;

  -- Lock de reservas activas
  FOR v_res_record IN 
    SELECT *
    FROM public.inventory_reservations
    WHERE order_id = p_order_id
      AND status = 'active'
    ORDER BY inventory_item_id, id
    FOR UPDATE
  LOOP
    IF v_res_record.quantity_reserved <= 0 THEN
      RAISE EXCEPTION 'INVALID_RESERVATION_QUANTITY';
    END IF;

    -- Lock de inventory_items
    SELECT *
    INTO v_item
    FROM public.inventory_items
    WHERE id = v_res_record.inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND';
    END IF;

    -- Decremento físico
    IF v_res_record.base_unit = 'YD2' THEN
      v_current := COALESCE((v_item.payload->>'available_yd2')::numeric, 0);
      v_new := v_current - v_res_record.quantity_reserved;
      IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      v_new_payload := jsonb_set(v_item.payload, '{available_yd2}', to_jsonb(v_new), true);

    ELSIF v_res_record.base_unit = 'FT' THEN
      v_current := COALESCE((v_item.payload->>'length_feet')::numeric, 0);
      v_new := v_current - v_res_record.quantity_reserved;
      IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      v_new_payload := jsonb_set(v_item.payload, '{length_feet}', to_jsonb(v_new), true);
      
      IF v_item.payload ? 'length_meters' THEN
        v_length_meters := v_new / 3.28084;
        v_new_payload := jsonb_set(v_new_payload, '{length_meters}', to_jsonb(v_length_meters), true);
      END IF;

    ELSIF v_res_record.base_unit = 'EA' THEN
      v_current := COALESCE((v_item.payload->>'available_quantity')::numeric, 0);
      v_new := v_current - v_res_record.quantity_reserved;
      IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      v_new_payload := jsonb_set(v_item.payload, '{available_quantity}', to_jsonb(v_new), true);

    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_UNIT';
    END IF;

    -- Actualizar inventory_items
    UPDATE public.inventory_items
    SET
      payload = v_new_payload,
      updated_at = timezone('utc', now()),
      updated_by = v_actor_id
    WHERE id = v_item.id;

    -- Insertar inventory_movements
    INSERT INTO public.inventory_movements (
      inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
    ) VALUES (
      v_res_record.inventory_item_id, p_order_id, v_item.category, 'consume', v_res_record.sku, v_res_record.quantity_reserved, v_res_record.base_unit, v_actor_id, 'Consumo vía reserva',
      jsonb_build_object(
        'reservation_id', v_res_record.id,
        'material_line_id', v_res_record.material_line_id,
        'source', v_res_record.source,
        'previous_quantity', v_current,
        'new_quantity', v_new,
        'base_unit', v_res_record.base_unit,
        'consumed_via', 'inventory_reservation'
      ) || 
      (CASE 
        WHEN v_res_record.base_unit = 'FT' AND v_item.payload ? 'length_meters' THEN 
          jsonb_build_object(
            'previous_length_meters', COALESCE((v_item.payload->>'length_meters')::numeric, 0),
            'new_length_meters', v_length_meters
          )
        ELSE '{}'::jsonb
      END)
    );

    -- Marcar reserva consumed
    UPDATE public.inventory_reservations
    SET
      status = 'consumed',
      consumed_at = timezone('utc', now()),
      consumed_by = v_actor_id
    WHERE id = v_res_record.id
      AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESERVATION_CONSUME_FAILED';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'consumed',
    'order_id', p_order_id,
    'consumed_count', v_active_count
  );
END;
$$;

-- 13. Grants
REVOKE ALL ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) TO service_role;
