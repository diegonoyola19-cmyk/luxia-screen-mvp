-- =============================================================================
-- FASE 5B.8.B: RPC para consumo de inventario atómico
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_order_inventory_tx(
    p_order_payload jsonb,
    p_consumption_plan jsonb
) RETURNS void AS $$
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
    
    v_inv_item_id uuid;
    v_inv_length numeric;
    v_inv_available_yd2 numeric;
    v_inv_payload jsonb;
    v_inv_qty numeric;
BEGIN
    -- 1. Validar auth
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Usuario no autenticado';
    END IF;

    -- 2. Validar permisos
    v_has_consume_perm := public.has_permission(v_user_id, 'inventory.consume');
    v_has_create_perm := public.has_permission(v_user_id, 'production.create_order') OR public.has_permission(v_user_id, 'orders.edit');
    
    IF NOT v_has_consume_perm THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere permiso inventory.consume';
    END IF;
    IF NOT v_has_create_perm THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere permiso de creación/edición de órdenes';
    END IF;

    v_order_id := (p_order_payload->>'id')::uuid;
    v_order_number := p_order_payload->>'orderNumber';

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ORDER: order payload no tiene id';
    END IF;

    -- 3. Evitar doble consumo
    SELECT EXISTS (
        SELECT 1 FROM public.inventory_movements 
        WHERE order_id = v_order_id 
          AND action IN ('consume', 'use_scrap')
    ) INTO v_already_consumed;

    IF v_already_consumed THEN
        -- Es idempotente: si ya se consumió, simplemente ignorar y salir exitosamente,
        -- o lanzar excepción. Dejaremos que lance error controlado para que el frontend lo sepa,
        -- o retornamos silente si preferimos idempotencia pura.
        -- Optamos por un retorno silente para que reintentos offline no fallen.
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
                -- Buscar el rollo disponible más antiguo
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

                -- Actualizar stock
                v_inv_available_yd2 := v_inv_available_yd2 - v_req_qty;
                v_inv_length := v_inv_available_yd2 / (v_width_meters * 1.1959900463);
                
                v_inv_payload := jsonb_set(v_inv_payload, '{available_yd2}', to_jsonb(v_inv_available_yd2));
                v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length));
                
                UPDATE public.inventory_items
                SET payload = v_inv_payload,
                    updated_at = timezone('utc', now()),
                    updated_by = v_user_id
                WHERE id = v_inv_item_id;

                -- Registrar movimiento
                INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                VALUES (v_inv_item_id, v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);

            ELSE
                -- Componentes o tubos. 
                -- Asumimos que los tubos no están segmentados por longitud todavía en el MES (o si lo están, habría que restar).
                -- Si es unitario/hardware, tal vez no llevemos stock físico en BD, pero generamos el movimiento para costeo.
                -- Por ahora, si no hay tabla de stock unitario validada, insertamos el movimiento sin inventory_item_id.
                -- Si sí hay, haríamos update. Pero en base de datos `inventory_items` solo tiene 'roll' y 'scrap' para fabrics (según esquemas que vimos, o 'bar'/'offcut' para tubo).
                -- Para tubo linear:
                IF v_category IN ('tube', 'bottom') THEN
                    -- No bloqueamos producción por tubo si no hay tracking físico estricto, o restamos de una barra.
                    -- Por simplicidad en Fase 5B.8, generamos el consumo ciego si no hay un item específico.
                    INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                    VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                ELSE
                    -- Componente
                    INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                    VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                END IF;
            END IF;

        ELSIF v_action = 'use_scrap' THEN
            v_specific_id := (v_item->>'specificInventoryItemId')::uuid;
            IF v_specific_id IS NULL THEN
                RAISE EXCEPTION 'INVALID_CONSUMPTION_PLAN: use_scrap requiere specificInventoryItemId';
            END IF;

            -- Validar y marcar como usado
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
            -- Insertar nuevo item de inventario tipo scrap
            INSERT INTO public.inventory_items (category, kind, code, status, payload, created_from_order_id, source, created_by)
            VALUES (
                v_category, 
                'scrap', 
                v_item_code, 
                'available', 
                jsonb_build_object(
                    'width_meters', v_width_meters, 
                    'length_meters', v_req_qty / (v_width_meters * 1.1959900463),
                    'available_yd2', v_req_qty,
                    'area_meters', v_width_meters * (v_req_qty / (v_width_meters * 1.1959900463))
                ),
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
