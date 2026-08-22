-- =============================================================================
-- FASE 5B.8.C: RPC para cancelación y reversión de inventario atómico
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order_inventory_tx(
    p_order_id uuid
) RETURNS void AS $$
DECLARE
    v_user_id uuid;
    v_order_status text;
    v_order_deleted_at timestamptz;
    v_has_cancel_perm boolean;
    v_mov RECORD;
    v_item RECORD;
    v_inv_payload jsonb;
    v_inv_available_yd2 numeric;
    v_inv_length numeric;
    v_inv_width numeric;
    v_scrap_used_by_other boolean;
    v_scrap_status text;
BEGIN
    -- 1. Validar auth
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Usuario no autenticado';
    END IF;

    -- 2. Validar permisos
    v_has_cancel_perm := public.has_permission(v_user_id, 'orders.delete') 
                      OR public.has_permission(v_user_id, 'orders.edit') 
                      OR public.has_permission(v_user_id, 'production.create_order')
                      OR public.has_permission(v_user_id, 'inventory.consume');
    
    IF NOT v_has_cancel_perm THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: No tienes permisos para cancelar o revertir esta orden';
    END IF;

    -- 3. Bloquear orden y verificar estado
    SELECT status, deleted_at INTO v_order_status, v_order_deleted_at
    FROM public.work_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Si la orden no existe en work_orders, salir limpiamente
        RETURN;
    END IF;

    -- 4. Protección contra cancelación de órdenes completadas
    IF v_order_status = 'completed' THEN
        RAISE EXCEPTION 'CANNOT_CANCEL_COMPLETED_ORDER: La orden % ya fue completada y no puede ser cancelada automáticamente.', p_order_id;
    END IF;

    -- 5. Idempotencia: Si ya está cancelada y ya tiene rollback, no hacer nada (prevenir doble rollback)
    IF v_order_status = 'cancelled' AND EXISTS (
        SELECT 1 FROM public.inventory_movements WHERE order_id = p_order_id AND action = 'rollback'
    ) THEN
        RETURN;
    END IF;

    -- 6. CASO CRÍTICO: Validar que NINGÚN retazo creado por esta orden haya sido consumido por otra orden
    -- Si un scrap derivado ya fue consumido total o parcialmente, bloquear cancelación para prevenir stock duplicado
    FOR v_mov IN
        SELECT id, inventory_item_id, item_code
        FROM public.inventory_movements
        WHERE order_id = p_order_id AND action = 'create_scrap'
    LOOP
        IF v_mov.inventory_item_id IS NOT NULL THEN
            SELECT status INTO v_scrap_status
            FROM public.inventory_items
            WHERE id = v_mov.inventory_item_id;

            -- Verificar si otra orden consumió este retazo
            SELECT EXISTS (
                SELECT 1 FROM public.inventory_movements 
                WHERE inventory_item_id = v_mov.inventory_item_id 
                  AND order_id <> p_order_id 
                  AND action IN ('consume', 'use_scrap')
            ) INTO v_scrap_used_by_other;

            IF v_scrap_used_by_other OR v_scrap_status = 'used' THEN
                RAISE EXCEPTION 'SCRAP_ALREADY_USED: No se puede cancelar la orden % automáticamente porque el retazo (%) generado por esta orden ya fue utilizado total o parcialmente en otra orden. Requiere conciliación manual.', p_order_id, v_mov.item_code;
            END IF;
        END IF;
    END LOOP;

    -- 7. Revertir consumos de inventory_movements para esta orden
    FOR v_mov IN 
        SELECT id, inventory_item_id, category, action, item_code, quantity, unit
        FROM public.inventory_movements
        WHERE order_id = p_order_id
          AND action IN ('consume', 'use_scrap', 'create_scrap')
        ORDER BY created_at DESC
    LOOP
        IF v_mov.action = 'consume' THEN
            IF v_mov.inventory_item_id IS NOT NULL THEN
                SELECT id, category, kind, status, payload INTO v_item
                FROM public.inventory_items
                WHERE id = v_mov.inventory_item_id
                FOR UPDATE;

                IF FOUND THEN
                    IF v_item.category = 'fabric' THEN
                        v_inv_width := (v_item.payload->>'width_meters')::numeric;
                        v_inv_available_yd2 := COALESCE((v_item.payload->>'available_yd2')::numeric, 0) + v_mov.quantity;
                        IF v_inv_width > 0 THEN
                            v_inv_length := v_inv_available_yd2 / (v_inv_width * 1.1959900463);
                        ELSE
                            v_inv_length := COALESCE((v_item.payload->>'length_meters')::numeric, 0);
                        END IF;

                        v_inv_payload := jsonb_set(v_item.payload, '{available_yd2}', to_jsonb(v_inv_available_yd2));
                        v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length));

                        UPDATE public.inventory_items
                        SET payload = v_inv_payload,
                            status = 'available',
                            updated_at = timezone('utc', now()),
                            updated_by = v_user_id
                        WHERE id = v_item.id;

                        INSERT INTO public.inventory_movements (
                            inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by
                        ) VALUES (
                            v_item.id, p_order_id, v_mov.category, 'rollback', v_mov.item_code, v_mov.quantity, v_mov.unit,
                            'Reversión de consumo de tela por cancelación de orden', v_user_id
                        );

                    ELSIF v_item.category IN ('tube', 'bottom') THEN
                        -- Restaurar longitud lineal en scrap
                        v_inv_length := COALESCE((v_item.payload->>'length_feet')::numeric, 0) + 
                            CASE WHEN v_mov.unit = 'm' THEN v_mov.quantity * 3.28084 ELSE v_mov.quantity END;
                        
                        v_inv_payload := jsonb_set(v_item.payload, '{length_feet}', to_jsonb(v_inv_length));
                        v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length / 3.28084));

                        UPDATE public.inventory_items
                        SET payload = v_inv_payload,
                            status = 'available',
                            updated_at = timezone('utc', now()),
                            updated_by = v_user_id
                        WHERE id = v_item.id;

                        INSERT INTO public.inventory_movements (
                            inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by
                        ) VALUES (
                            v_item.id, p_order_id, v_mov.category, 'rollback', v_mov.item_code, v_mov.quantity, v_mov.unit,
                            'Reversión de corte lineal por cancelación de orden', v_user_id
                        );
                    END IF;
                END IF;
            ELSE
                -- Consumo sin item_id específico (ej. corte de barra nueva o hardware general)
                INSERT INTO public.inventory_movements (
                    order_id, category, action, item_code, quantity, unit, notes, created_by
                ) VALUES (
                    p_order_id, v_mov.category, 'rollback', v_mov.item_code, v_mov.quantity, v_mov.unit,
                    'Reversión de consumo general por cancelación de orden', v_user_id
                );
            END IF;

        ELSIF v_mov.action = 'use_scrap' THEN
            -- Restaurar retazo preexistente que esta orden consumió
            IF v_mov.inventory_item_id IS NOT NULL THEN
                UPDATE public.inventory_items
                SET status = 'available',
                    updated_at = timezone('utc', now()),
                    updated_by = v_user_id
                WHERE id = v_mov.inventory_item_id;

                INSERT INTO public.inventory_movements (
                    inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by
                ) VALUES (
                    v_mov.inventory_item_id, p_order_id, v_mov.category, 'rollback', v_mov.item_code, v_mov.quantity, v_mov.unit,
                    'Restauración de retazo utilizado por cancelación de orden', v_user_id
                );
            END IF;

        ELSIF v_mov.action = 'create_scrap' THEN
            -- Invalidar el retazo generado por esta orden (ya validamos en paso 6 que no fue usado por nadie)
            IF v_mov.inventory_item_id IS NOT NULL THEN
                UPDATE public.inventory_items
                SET status = 'deleted',
                    deleted_at = timezone('utc', now()),
                    updated_at = timezone('utc', now()),
                    updated_by = v_user_id
                WHERE id = v_mov.inventory_item_id;

                INSERT INTO public.inventory_movements (
                    inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by
                ) VALUES (
                    v_mov.inventory_item_id, p_order_id, v_mov.category, 'rollback', v_mov.item_code, v_mov.quantity, v_mov.unit,
                    'Invalidación de retazo sobrante por cancelación de orden', v_user_id
                );
            END IF;
        END IF;
    END LOOP;

    -- 8. Actualizar la orden a 'cancelled'
    UPDATE public.work_orders
    SET status = 'cancelled',
        updated_at = timezone('utc', now()),
        payload = jsonb_set(payload, '{status}', '"cancelled"')
    WHERE id = p_order_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
