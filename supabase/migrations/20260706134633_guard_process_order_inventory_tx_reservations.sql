-- 20260706134633_guard_process_order_inventory_tx_reservations.sql

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

    v_order_id := (p_order_payload->>'id')::uuid;
    v_order_number := p_order_payload->>'orderNumber';

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ORDER: order payload no tiene id';
    END IF;

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
