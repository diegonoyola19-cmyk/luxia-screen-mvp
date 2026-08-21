-- 20260706150000_materialize_production_scraps_rpc.sql

-- ========================================================================================
-- Hardening y Materialización Atómica de Retazos / Scraps en consume_order_inventory_reservations
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

  -- Variables para materialización de retazos / scraps
  v_snapshot jsonb;
  v_rem_record jsonb;
  v_disc_record jsonb;
  v_curtain_item jsonb;
  v_rem_id text;
  v_sku text;
  v_desc text;
  v_rem_ft numeric;
  v_length_ft numeric;
  v_bar_index int;
  v_reason text;
  v_kind text;
  v_category text;
  v_new_scrap_id uuid;
  v_scraps_created_count int := 0;
  v_scraps_discarded_count int := 0;
  v_already_exists boolean;

  -- Variables para retazos de tela
  v_waste_w numeric;
  v_waste_h numeric;
  v_fab_code text;
  v_fab_family text;
  v_fab_color text;
  v_curtain_id text;
BEGIN
  -- 1. Seguridad e Identidad
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated user';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User mismatch';
  END IF;

  IF NOT public.has_permission(v_actor_id, 'inventory.consume') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Requires inventory.consume permission';
  END IF;

  -- 2. Lock y obtención de orden
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

  -- 3. Evaluación de estado de reservas para idempotencia
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

  -- Idempotencia: Si ya fueron consumidas todas las reservas
  IF v_consumed_count = v_total_reservations THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_consumed',
      'order_id', p_order_id,
      'consumed_count', 0,
      'scraps_created_count', 0,
      'scraps_discarded_count', 0
    );
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

  IF v_order.status <> 'in_production' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS';
  END IF;

  -- 4. Procesar consumo de reservas activas e inventario físico
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

    SELECT *
    INTO v_item
    FROM public.inventory_items
    WHERE id = v_res_record.inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND';
    END IF;

    v_movement_extra_payload := '{}'::jsonb;

    -- Decremento de stock según unidad base
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

    -- Actualizar ítem original en inventory_items
    UPDATE public.inventory_items
    SET
      payload = v_new_payload,
      updated_at = timezone('utc', now()),
      updated_by = v_actor_id
    WHERE id = v_item.id;

    -- Insertar movimiento de consumo
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

    -- Marcar reserva como consumida
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

  -- 5. MATERIALIZACIÓN ATÓMICA DE RETAZOS / SCRAPS REUTILIZABLES
  v_snapshot := v_order.payload->'productionReview'->'issueSnapshot';

  IF v_snapshot IS NOT NULL THEN
    -- A. Retazos lineales reutilizables (createdRemainders >= 1.00 m / 3.28084 ft)
    IF v_snapshot ? 'createdRemainders' AND jsonb_array_length(v_snapshot->'createdRemainders') > 0 THEN
      FOR v_rem_record IN SELECT * FROM jsonb_array_elements(v_snapshot->'createdRemainders')
      LOOP
        v_rem_id := v_rem_record->>'id';
        v_sku := v_rem_record->>'sku';
        v_desc := COALESCE(v_rem_record->>'description', v_sku);
        v_rem_ft := (v_rem_record->>'remainingLengthFt')::numeric;

        -- Regla de Negocio: solo materializar sobrantes >= 1.00m (3.28084 ft) y > 0
        IF v_rem_ft IS NOT NULL AND v_rem_ft >= 3.28084 THEN
          -- Idempotencia: Verificar que no se haya insertado previamente para esta orden
          SELECT EXISTS (
            SELECT 1 
            FROM public.inventory_items 
            WHERE created_from_order_id = p_order_id 
              AND (payload->>'stable_id' = v_rem_id OR code = v_sku AND payload->>'stable_id' = v_rem_id)
          ) INTO v_already_exists;

          IF NOT v_already_exists THEN
            -- Determinar ID único estricto (UUID)
            IF v_rem_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
              v_new_scrap_id := v_rem_id::uuid;
            ELSE
              v_new_scrap_id := gen_random_uuid();
            END IF;

            v_category := CASE 
              WHEN v_sku LIKE '%TU-%' THEN 'tube'
              WHEN v_sku LIKE '%AL-%' OR v_sku LIKE '%CLZ%' THEN 'bottom'
              ELSE 'component'
            END;

            INSERT INTO public.inventory_items (
              id, category, kind, code, status, created_from_order_id, source, created_by, payload, created_at, updated_at
            ) VALUES (
              v_new_scrap_id,
              v_category,
              'unit',
              v_sku,
              'available',
              p_order_id,
              'production_cut',
              v_actor_id,
              jsonb_build_object(
                'length_feet', v_rem_ft,
                'length_meters', v_rem_ft / 3.28084,
                'available_quantity', 1,
                'unit', 'FT',
                'code', v_sku,
                'description', v_desc,
                'stable_id', v_rem_id
              ),
              timezone('utc', now()),
              timezone('utc', now())
            );

            INSERT INTO public.inventory_movements (
              inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
            ) VALUES (
              v_new_scrap_id,
              p_order_id,
              v_category,
              'create_scrap',
              v_sku,
              v_rem_ft,
              'FT',
              v_actor_id,
              'Retazo lineal reutilizable generado en producción',
              jsonb_build_object('stable_id', v_rem_id, 'source_order_id', p_order_id)
            );

            v_scraps_created_count := v_scraps_created_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- B. Mermas / Descartes lineales (< 1.00 m / 3.28084 ft) (discardedLinearRemainders)
    IF v_snapshot ? 'discardedLinearRemainders' AND jsonb_array_length(v_snapshot->'discardedLinearRemainders') > 0 THEN
      FOR v_disc_record IN SELECT * FROM jsonb_array_elements(v_snapshot->'discardedLinearRemainders')
      LOOP
        v_sku := v_disc_record->>'sku';
        v_length_ft := (v_disc_record->>'lengthFt')::numeric;
        v_kind := COALESCE(v_disc_record->>'materialKind', 'tube');
        v_reason := COALESCE(v_disc_record->>'reason', 'Menor a 1.00 m');
        v_bar_index := COALESCE((v_disc_record->>'barIndex')::int, 0);

        IF v_length_ft IS NOT NULL AND v_length_ft > 0 THEN
          SELECT EXISTS (
            SELECT 1 
            FROM public.inventory_movements
            WHERE order_id = p_order_id
              AND action = 'discard'
              AND item_code = v_sku
              AND COALESCE((payload->>'bar_index')::int, 0) = v_bar_index
          ) INTO v_already_exists;

          IF NOT v_already_exists THEN
            INSERT INTO public.inventory_movements (
              inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
            ) VALUES (
              NULL,
              p_order_id,
              v_kind,
              'discard',
              v_sku,
              v_length_ft,
              'FT',
              v_actor_id,
              v_reason,
              jsonb_build_object('bar_index', v_bar_index, 'source_order_id', p_order_id)
            );

            v_scraps_discarded_count := v_scraps_discarded_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- C. Retazos de Tela (WastePiece / wastePieceWidthMeters >= 0.50 & wastePieceHeightMeters >= 0.50)
  IF v_order.payload ? 'items' AND jsonb_array_length(v_order.payload->'items') > 0 THEN
    FOR v_curtain_item IN SELECT * FROM jsonb_array_elements(v_order.payload->'items')
    LOOP
      v_curtain_id := v_curtain_item->>'id';
      v_waste_w := (v_curtain_item->'result'->>'wastePieceWidthMeters')::numeric;
      v_waste_h := (v_curtain_item->'result'->>'wastePieceHeightMeters')::numeric;
      v_fab_code := v_curtain_item->'result'->'selectedFabric'->>'itemCode';
      v_fab_family := COALESCE(v_curtain_item->'result'->'selectedFabric'->>'family', '');
      v_fab_color := COALESCE(v_curtain_item->'result'->'selectedFabric'->>'color', '');

      -- Regla de Negocio: solo retazos de tela >= 0.50m por lado (50 cm)
      IF v_waste_w IS NOT NULL AND v_waste_h IS NOT NULL AND v_waste_w >= 0.50 AND v_waste_h >= 0.50 AND v_fab_code IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 
          FROM public.inventory_items 
          WHERE created_from_order_id = p_order_id 
            AND category = 'fabric' 
            AND kind = 'scrap' 
            AND payload->>'curtain_item_id' = v_curtain_id
        ) INTO v_already_exists;

        IF NOT v_already_exists THEN
          v_new_scrap_id := gen_random_uuid();

          INSERT INTO public.inventory_items (
            id, category, kind, code, status, created_from_order_id, source, created_by, payload, created_at, updated_at
          ) VALUES (
            v_new_scrap_id,
            'fabric',
            'scrap',
            v_fab_code,
            'available',
            p_order_id,
            'production_cut',
            v_actor_id,
            jsonb_build_object(
              'width_meters', v_waste_w,
              'length_meters', v_waste_h,
              'area_meters', v_waste_w * v_waste_h,
              'available_yd2', v_waste_w * v_waste_h * 1.19599,
              'family', v_fab_family,
              'color', v_fab_color,
              'curtain_item_id', v_curtain_id
            ),
            timezone('utc', now()),
            timezone('utc', now())
          );

          INSERT INTO public.inventory_movements (
            inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
          ) VALUES (
            v_new_scrap_id,
            p_order_id,
            'fabric',
            'create_scrap',
            v_fab_code,
            v_waste_w * v_waste_h * 1.19599,
            'YD2',
            v_actor_id,
            'Retazo de tela generado en producción',
            jsonb_build_object('curtain_item_id', v_curtain_id, 'source_order_id', p_order_id)
          );

          v_scraps_created_count := v_scraps_created_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'consumed',
    'order_id', p_order_id,
    'consumed_count', v_active_count,
    'scraps_created_count', v_scraps_created_count,
    'scraps_discarded_count', v_scraps_discarded_count
  );
END;
$$;
