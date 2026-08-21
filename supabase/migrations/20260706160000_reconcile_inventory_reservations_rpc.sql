-- 20260706160000_reconcile_inventory_reservations_rpc.sql

-- ========================================================================================
-- Motor SQL de Reconciliación Automática de Reservas Huérfanas de Inventario
-- ========================================================================================

CREATE OR REPLACE FUNCTION public.reconcile_inventory_reservations(
  p_dry_run boolean DEFAULT false,
  p_limit int DEFAULT 200,
  p_grace_minutes int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor_id uuid;
  v_scanned int := 0;
  v_released int := 0;
  v_consumed int := 0;
  v_unchanged int := 0;
  v_flagged int := 0;
  v_errors int := 0;
  v_details jsonb := '[]'::jsonb;

  v_res record;
  v_order record;
  v_item record;
  v_grace_interval interval;
  v_is_stale boolean;

  -- Variables para consumo recuperable
  v_current numeric;
  v_new numeric;
  v_new_payload jsonb;
  v_length_meters numeric;
  v_width_meters numeric;
  v_movement_extra_payload jsonb;

  v_action_taken text;
  v_reason_text text;
BEGIN
  -- 1. Seguridad: auth.uid() o service_role
  v_actor_id := auth.uid();
  v_grace_interval := (p_grace_minutes || ' minutes')::interval;

  -- 2. Advisory lock para evitar ejecuciones concurrentes simultáneas del reconciliador
  IF NOT p_dry_run THEN
    PERFORM pg_advisory_xact_lock(hashtext('reconcile_inventory_reservations_lock'));
  END IF;

  -- 3. Escaneo de reservas activas con SKIP LOCKED para no bloquear usuarios en tiempo real
  FOR v_res IN
    SELECT r.*
    FROM public.inventory_reservations r
    WHERE r.status = 'active'
    ORDER BY r.created_at ASC
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_scanned := v_scanned + 1;
    v_action_taken := 'unchanged';
    v_reason_text := NULL;

    -- Evaluar antigüedad según período de gracia
    v_is_stale := (COALESCE(v_res.updated_at, v_res.created_at) < (now() - v_grace_interval));

    -- Obtener orden asociada (si existe y no está soft-deleted)
    SELECT *
    INTO v_order
    FROM public.work_orders
    WHERE id = v_res.order_id
      AND deleted_at IS NULL;

    -- ─────────────────────────────────────────────────────────────────────────────────
    -- REGLAS DE CLASIFICACIÓN Y ACCIÓN
    -- ─────────────────────────────────────────────────────────────────────────────────

    -- REGLA 1: Reserva activa de una orden cancelada -> Liberar (release)
    IF FOUND AND v_order.status = 'cancelled' THEN
      v_action_taken := 'released';
      v_reason_text := 'order_cancelled';

    -- REGLA 2: Reserva activa de una orden completada -> Verificar evidencia de producción antes de consumir
    ELSIF FOUND AND v_order.status = 'completed' THEN
      -- Evidencia inequívoca: producción revisada/completada, issueSnapshot presente o inventario sincronizado
      IF (
        v_order.payload ? 'productionReview' AND (
          v_order.payload->'productionReview'->>'status' = 'completed'
          OR v_order.payload->'productionReview' ? 'issueSnapshot'
          OR v_order.payload->'productionReview' ? 'reviewedAt'
        )
      ) OR COALESCE((v_order.payload->>'inventorySynced')::boolean, false) = true OR v_order.payload ? 'sageExportedAt' THEN
        v_action_taken := 'consumed';
        v_reason_text := 'order_completed_with_production_evidence';
      ELSE
        -- Sin evidencia suficiente de producción: NO consumir destructivamente, marcar como flagged
        v_action_taken := 'flagged';
        v_reason_text := 'order_completed_lacks_production_evidence';
      END IF;

    -- REGLA 3: Reserva activa de orden que nunca llegó a producción (draft, pending, etc.) y venció el período de gracia -> Liberar
    ELSIF FOUND AND v_order.status IN ('draft', 'pending', 'materials_checked', 'sent_to_sage') AND v_is_stale THEN
      v_action_taken := 'released';
      v_reason_text := 'stale_order_not_in_production';

    -- REGLA 4: Reserva activa de una orden inexistente o eliminada -> Liberar si venció el período de gracia
    ELSIF NOT FOUND AND v_is_stale THEN
      v_action_taken := 'released';
      v_reason_text := 'stale_orphan_order_not_found';

    -- REGLA 5: Inconsistencia dudosa (ej. cantidad reservada <= 0) -> Auditar como flagged
    ELSIF v_res.quantity_reserved <= 0 THEN
      v_action_taken := 'flagged';
      v_reason_text := 'invalid_quantity_reserved';

    -- REGLA 6: Reserva activa legítima en producción (in_production) o dentro del período de gracia -> No tocar
    ELSE
      v_action_taken := 'unchanged';
      v_reason_text := 'valid_active_reservation';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────────────
    -- EJECUCIÓN DE ACCIONES (Si no es dry_run)
    -- ─────────────────────────────────────────────────────────────────────────────────

    IF v_action_taken = 'released' THEN
      v_released := v_released + 1;
      IF NOT p_dry_run THEN
        -- Marcar reserva como released
        UPDATE public.inventory_reservations
        SET
          status = 'released',
          released_at = now(),
          released_by = v_actor_id,
          release_reason = jsonb_build_object('source', 'reconciler', 'reason', v_reason_text)::text
        WHERE id = v_res.id;

        -- Registrar auditoría en inventory_movements
        INSERT INTO public.inventory_movements (
          inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
        ) VALUES (
          v_res.inventory_item_id,
          v_res.order_id,
          v_res.category,
          'rollback',
          v_res.sku,
          v_res.quantity_reserved,
          v_res.base_unit,
          v_actor_id,
          'Reconciliación automática: liberación de reserva huérfana (' || v_reason_text || ')',
          jsonb_build_object(
            'reconciliation', true,
            'dry_run', false,
            'previous_status', 'active',
            'new_status', 'released',
            'reason', v_reason_text,
            'reservation_id', v_res.id
          )
        );
      END IF;

    ELSIF v_action_taken = 'consumed' THEN
      -- Verificar existencia del ítem de inventario antes de intentar consumo recuperable
      SELECT *
      INTO v_item
      FROM public.inventory_items
      WHERE id = v_res.inventory_item_id
      FOR UPDATE;

      IF FOUND THEN
        v_consumed := v_consumed + 1;
        IF NOT p_dry_run THEN
          v_movement_extra_payload := '{}'::jsonb;

          -- Decremento seguro de stock
          IF v_res.base_unit = 'YD2' THEN
            v_current := COALESCE((v_item.payload->>'available_yd2')::numeric, 0);
            v_new := GREATEST(0, v_current - v_res.quantity_reserved);
            v_new_payload := jsonb_set(v_item.payload, '{available_yd2}', to_jsonb(v_new), true);

            v_width_meters := NULLIF((v_item.payload->>'width_meters')::numeric, 0);
            IF v_width_meters IS NOT NULL AND v_width_meters > 0 THEN
              v_length_meters := v_new / (v_width_meters * 1.19599);
              v_new_payload := jsonb_set(v_new_payload, '{length_meters}', to_jsonb(v_length_meters), true);
            END IF;

          ELSIF v_res.base_unit = 'FT' THEN
            v_current := COALESCE((v_item.payload->>'length_feet')::numeric, 0);
            v_new := GREATEST(0, v_current - v_res.quantity_reserved);
            v_new_payload := jsonb_set(v_item.payload, '{length_feet}', to_jsonb(v_new), true);

            IF v_item.payload ? 'length_meters' THEN
              v_length_meters := v_new / 3.28084;
              v_new_payload := jsonb_set(v_new_payload, '{length_meters}', to_jsonb(v_length_meters), true);
            END IF;

          ELSIF v_res.base_unit = 'EA' THEN
            v_current := COALESCE((v_item.payload->>'available_quantity')::numeric, 0);
            v_new := GREATEST(0, v_current - v_res.quantity_reserved);
            v_new_payload := jsonb_set(v_item.payload, '{available_quantity}', to_jsonb(v_new), true);
          ELSE
            v_new_payload := v_item.payload;
          END IF;

          -- Actualizar ítem
          UPDATE public.inventory_items
          SET payload = v_new_payload, updated_at = now(), updated_by = v_actor_id
          WHERE id = v_item.id;

          -- Marcar reserva como consumed
          UPDATE public.inventory_reservations
          SET status = 'consumed', consumed_at = now(), consumed_by = v_actor_id
          WHERE id = v_res.id;

          -- Auditoría
          INSERT INTO public.inventory_movements (
            inventory_item_id, order_id, category, action, item_code, quantity, unit, created_by, notes, payload
          ) VALUES (
            v_res.inventory_item_id,
            v_res.order_id,
            v_res.category,
            'consume',
            v_res.sku,
            v_res.quantity_reserved,
            v_res.base_unit,
            v_actor_id,
            'Reconciliación automática: consumo de reserva recuperable (' || v_reason_text || ')',
            jsonb_build_object(
              'reconciliation', true,
              'dry_run', false,
              'previous_status', 'active',
              'new_status', 'consumed',
              'reason', v_reason_text,
              'reservation_id', v_res.id
            )
          );
        END IF;
      ELSE
        -- Si el ítem no existe en inventory_items, marcar como flagged
        v_flagged := v_flagged + 1;
        v_action_taken := 'flagged';
        v_reason_text := 'inventory_item_not_found';
      END IF;

    ELSIF v_action_taken = 'flagged' THEN
      v_flagged := v_flagged + 1;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;

    -- Agregar detalle estructurado
    v_details := v_details || jsonb_build_object(
      'reservation_id', v_res.id,
      'order_id', v_res.order_id,
      'sku', v_res.sku,
      'action', v_action_taken,
      'reason', v_reason_text,
      'previous_status', 'active',
      'is_stale', v_is_stale
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'scanned', v_scanned,
    'released', v_released,
    'consumed', v_consumed,
    'unchanged', v_unchanged,
    'flagged', v_flagged,
    'errors', v_errors,
    'grace_minutes', p_grace_minutes,
    'limit', p_limit,
    'details', v_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_inventory_reservations(boolean, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_inventory_reservations(boolean, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_reservations(boolean, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_reservations(boolean, int, int) TO service_role;
