-- 20260706142246_pre_phase4_reservation_hardening.sql

-- ========================================================================================
-- 1. Hardening process_order_inventory_tx
-- ========================================================================================
CREATE OR REPLACE FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id uuid;
    v_order_id uuid;
    v_order_number text;
    v_has_consume_perm boolean;
    v_has_create_perm boolean;
    v_already_consumed boolean;
    v_item jsonb;
    v_action text;
    v_category text;
    v_item_code text;
    v_req_qty numeric;
    v_unit text;
    v_width_meters numeric;
    v_specific_id uuid;
    v_req_qty_ft numeric;
    
    v_inv_item_id uuid;
    v_inv_length numeric;
    v_inv_available_yd2 numeric;
    v_inv_payload jsonb;
    v_inv_qty numeric;
    v_inv_status text;
BEGIN
    -- 1. Validar auth
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Usuario no autenticado';
    END IF;

    IF NOT public.has_permission(v_user_id, 'inventory.consume') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    v_order_id := (p_order_payload->>'id')::uuid;
    v_order_number := p_order_payload->>'orderNumber';

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ORDER: order payload no tiene id';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_order_id::text));

    -- =====================================================================================
    -- GUARD ANTI-LEGACY: Evitar doble consumo si la orden usa el nuevo motor de reservas
    -- =====================================================================================
    IF EXISTS (
      SELECT 1
      FROM public.inventory_reservations
      WHERE order_id = v_order_id
        AND status IN ('active', 'consumed')
    ) THEN
      RAISE EXCEPTION 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations';
    END IF;

    -- 3. Evitar doble consumo legacy
    SELECT EXISTS (
        SELECT 1 FROM public.inventory_movements 
        WHERE order_id = v_order_id 
          AND action IN ('consume', 'use_scrap')
    ) INTO v_already_consumed;

    IF v_already_consumed THEN
        RETURN;
    END IF;

    -- 4. Upsert de la orden
    INSERT INTO public.work_orders (id, order_number, payload, status, created_at, updated_at)
    VALUES (
        v_order_id, 
        v_order_number, 
        p_order_payload, 
        COALESCE(p_order_payload->>'status', 'pending'),
        COALESCE((p_order_payload->>'createdAt')::timestamptz, timezone('utc', now())),
        timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET 
        payload = EXCLUDED.payload,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;

    -- 5. Procesar items del plan
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_consumption_plan->'items')
    LOOP
        v_action := v_item->>'action';
        v_category := v_item->>'category';
        v_item_code := v_item->>'itemCode';
        v_req_qty := (v_item->>'requiredQuantity')::numeric;
        v_unit := v_item->>'unit';
        v_width_meters := (v_item->>'widthMeters')::numeric;

        IF v_action = 'consume' THEN
            IF v_category = 'fabric' THEN
                SELECT id, (payload->>'available_yd2')::numeric, payload
                INTO v_inv_item_id, v_inv_available_yd2, v_inv_payload
                FROM public.inventory_items
                WHERE category = 'fabric' 
                  AND code = v_item_code 
                  AND status = 'available'
                  AND kind = 'roll'
                  AND ABS((payload->>'width_meters')::numeric - v_width_meters) <= 0.01
                  AND (payload->>'available_yd2')::numeric >= v_req_qty
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED;

                IF v_inv_item_id IS NULL THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: No hay rollo disponible para tela % de ancho % con cantidad (yd2) %', v_item_code, v_width_meters, v_req_qty;
                END IF;

                v_inv_available_yd2 := v_inv_available_yd2 - v_req_qty;
                v_inv_length := v_inv_available_yd2 / (v_width_meters * 1.1959900463);
                
                v_inv_payload := jsonb_set(v_inv_payload, '{available_yd2}', to_jsonb(v_inv_available_yd2));
                v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length));
                
                UPDATE public.inventory_items
                SET payload = v_inv_payload,
                    updated_at = timezone('utc', now()),
                    updated_by = v_user_id
                WHERE id = v_inv_item_id;

                INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                VALUES (v_inv_item_id, v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);

            ELSE
                IF v_category IN ('tube', 'bottom') THEN
                    v_req_qty_ft := v_req_qty;
                    IF v_unit = 'm' THEN
                        v_req_qty_ft := v_req_qty * 3.28084;
                    END IF;

                    SELECT id, (payload->>'length_feet')::numeric, payload
                    INTO v_inv_item_id, v_inv_length, v_inv_payload
                    FROM public.inventory_items
                    WHERE category = v_category
                      AND code = v_item_code 
                      AND status = 'available'
                      AND (payload->>'length_feet')::numeric >= v_req_qty_ft
                    ORDER BY (payload->>'length_feet')::numeric ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED;

                    IF v_inv_item_id IS NOT NULL THEN
                        v_inv_length := v_inv_length - v_req_qty_ft;
                        
                        IF v_inv_length >= 1.0 THEN 
                            v_inv_payload := jsonb_set(v_inv_payload, '{length_feet}', to_jsonb(v_inv_length));
                            v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length / 3.28084));
                            UPDATE public.inventory_items
                            SET payload = v_inv_payload, updated_at = timezone('utc', now()), updated_by = v_user_id
                            WHERE id = v_inv_item_id;
                        ELSE
                            UPDATE public.inventory_items
                            SET status = 'used', updated_at = timezone('utc', now()), updated_by = v_user_id
                            WHERE id = v_inv_item_id;
                        END IF;

                        INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                        VALUES (v_inv_item_id, v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                    ELSE
                        INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                        VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, 'Corte de barra nueva 19ft: ' || COALESCE(v_item->>'notes', ''), v_user_id);
                        
                        v_inv_length := 19.0 - v_req_qty_ft;
                        IF v_inv_length >= 1.0 THEN
                            INSERT INTO public.inventory_items (category, kind, code, status, payload, created_from_order_id, source, created_by)
                            VALUES (
                                v_category, 
                                'unit', 
                                v_item_code, 
                                'available', 
                                jsonb_build_object(
                                    'length_feet', v_inv_length,
                                    'length_meters', v_inv_length / 3.28084,
                                    'available_quantity', 1,
                                    'unit', 'FT',
                                    'source_order', v_order_number
                                ),
                                v_order_id, 
                                'production_cut',
                                v_user_id
                            ) RETURNING id INTO v_inv_item_id;

                            INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                            VALUES (v_inv_item_id, v_order_id, v_category, 'create_scrap', v_item_code, v_inv_length, 'ft', 'Sobrante automático de barra 19ft', v_user_id);
                        END IF;
                    END IF;
                ELSE
                    INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                    VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                END IF;
            END IF;

        ELSIF v_action = 'use_scrap' THEN
            v_specific_id := (v_item->>'specificInventoryItemId')::uuid;
            IF v_specific_id IS NULL THEN
                RAISE EXCEPTION 'INVALID_CONSUMPTION_PLAN: use_scrap requiere specificInventoryItemId';
            END IF;

            UPDATE public.inventory_items
            SET status = 'used',
                updated_at = timezone('utc', now()),
                updated_by = v_user_id
            WHERE id = v_specific_id AND status = 'available'
            RETURNING id INTO v_inv_item_id;

            IF v_inv_item_id IS NULL THEN
                RAISE EXCEPTION 'ITEM_NOT_AVAILABLE: El retazo % no existe o ya no está disponible', v_specific_id;
            END IF;

            INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
            VALUES (v_inv_item_id, v_order_id, v_category, 'use_scrap', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);

        ELSIF v_action = 'create_scrap' THEN
            INSERT INTO public.inventory_items (category, kind, code, status, payload, created_from_order_id, source, created_by)
            VALUES (
                v_category, 
                'scrap', 
                v_item_code, 
                'available', 
                (COALESCE(v_item->'payload', '{}'::jsonb) || jsonb_build_object(
                    'width_meters', v_width_meters, 
                    'length_meters', v_req_qty / (v_width_meters * 1.1959900463),
                    'available_yd2', v_req_qty,
                    'area_meters', v_width_meters * (v_req_qty / (v_width_meters * 1.1959900463)),
                    'source_order', v_order_number
                )),
                v_order_id, 
                'production_cut',
                v_user_id
            ) RETURNING id INTO v_inv_item_id;

            INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
            VALUES (v_inv_item_id, v_order_id, v_category, 'create_scrap', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
            
        ELSE
            RAISE EXCEPTION 'INVALID_CONSUMPTION_PLAN: Acción no soportada %', v_action;
        END IF;

    END LOOP;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_order_inventory_tx(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_order_inventory_tx(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_inventory_tx(jsonb, jsonb) TO service_role;

-- ========================================================================================
-- 2. Hardening consume_order_inventory_reservations
-- ========================================================================================
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
  v_width_meters numeric;
  v_movement_extra_payload jsonb;
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

    v_movement_extra_payload := '{}'::jsonb;

    -- Decremento físico
    IF v_res_record.base_unit = 'YD2' THEN
      v_current := COALESCE((v_item.payload->>'available_yd2')::numeric, 0);
      v_new := v_current - v_res_record.quantity_reserved;
      IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      v_new_payload := jsonb_set(v_item.payload, '{available_yd2}', to_jsonb(v_new), true);

      v_width_meters := NULLIF((v_item.payload->>'width_meters')::numeric, 0);
      IF v_width_meters IS NOT NULL AND v_width_meters > 0 THEN
        v_length_meters := v_new / (v_width_meters * 1.19599);
        v_new_payload := jsonb_set(v_new_payload, '{length_meters}', to_jsonb(v_length_meters), true);
        
        v_movement_extra_payload := jsonb_build_object(
          'previous_length_meters', COALESCE((v_item.payload->>'length_meters')::numeric, 0),
          'new_length_meters', v_length_meters,
          'width_meters', v_width_meters,
          'length_meters_recalculated', true
        );
      ELSE
        v_movement_extra_payload := jsonb_build_object(
          'length_meters_recalculated', false
        );
      END IF;

    ELSIF v_res_record.base_unit = 'FT' THEN
      v_current := COALESCE((v_item.payload->>'length_feet')::numeric, 0);
      v_new := v_current - v_res_record.quantity_reserved;
      IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      v_new_payload := jsonb_set(v_item.payload, '{length_feet}', to_jsonb(v_new), true);
      
      IF v_item.payload ? 'length_meters' THEN
        v_length_meters := v_new / 3.28084;
        v_new_payload := jsonb_set(v_new_payload, '{length_meters}', to_jsonb(v_length_meters), true);
        v_movement_extra_payload := jsonb_build_object(
          'previous_length_meters', COALESCE((v_item.payload->>'length_meters')::numeric, 0),
          'new_length_meters', v_length_meters
        );
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
      ) || v_movement_extra_payload
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


-- ========================================================================================
-- 3. Hardening release_order_inventory
-- ========================================================================================
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

  -- NUEVO: Si hay reservas active y la orden está in_production
  IF v_count_active > 0 AND v_order_status = 'in_production' THEN
    RAISE EXCEPTION 'RELEASE_NOT_ALLOWED_IN_PRODUCTION';
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
