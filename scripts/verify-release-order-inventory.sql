-- ============================================================
-- LUXIA — scripts/verify-release-order-inventory.sql
-- Pruebas funcionales de release_order_inventory (Bloque 3D)
-- ============================================================
--
-- Ejecutar contra Supabase local DESPUÉS de: supabase db reset
--
--   supabase db query --file scripts/verify-release-order-inventory.sql
-- ============================================================

DO $$
DECLARE
  -- UUIDs
  ACTOR_PERM    CONSTANT UUID := 'DD000000-0000-0000-0001-000000000001';
  ACTOR_NOPERM  CONSTANT UUID := 'DD000000-0000-0000-0001-000000000002';

  ORD_VALID     CONSTANT UUID := 'DD100000-0000-0000-0000-000000000001';
  ORD_NO_RES    CONSTANT UUID := 'DD100000-0000-0000-0000-000000000002';
  ORD_CONSUMED  CONSTANT UUID := 'DD100000-0000-0000-0000-000000000003';
  ORD_SECOND    CONSTANT UUID := 'DD100000-0000-0000-0000-000000000004';

  INV_ITEM_1    CONSTANT UUID := 'DD200000-0000-0000-0000-000000000001';

  v_result        JSONB;
  v_caught        TEXT;
  v_pass          INT := 0;
  v_fail          INT := 0;
  v_count         INT;
  v_wo_status     TEXT;
  v_res_record    RECORD;
BEGIN

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  LUXIA 3D — verify-release-order-inventory.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ── SETUP ────────────────────────────────────────────────────────────────

  -- Actores
  INSERT INTO auth.users (id, email)
  VALUES
    (ACTOR_PERM, 'verify3d_perm@luxia.test'),
    (ACTOR_NOPERM, 'verify3d_noperm@luxia.test')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET
    role    = 'produccion',
    role_id = (SELECT id FROM public.roles WHERE name = 'produccion'),
    is_active = true
  WHERE id = ACTOR_PERM;

  UPDATE public.profiles SET
    role    = 'consulta',
    role_id = (SELECT id FROM public.roles WHERE name = 'consulta'),
    is_active = true
  WHERE id = ACTOR_NOPERM;

  -- Inventario
  INSERT INTO inventory_items (id, category, kind, code, status, payload)
  VALUES
    (INV_ITEM_1, 'component', 'unit', 'VERIFY-3D-EA', 'available',
     jsonb_build_object('available_quantity', 10, 'unit', 'EA'))
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, status = 'available';

  -- Órdenes
  INSERT INTO work_orders (id, order_number, status, payload, created_at, updated_at)
  VALUES
    (ORD_VALID, 'V3D-001', 'ready_for_production',
     jsonb_build_object('id', ORD_VALID, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-3D-EA','quantity',2,'unit','EA','description','Fungible 3D')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    (ORD_NO_RES, 'V3D-002', 'ready_for_production',
     jsonb_build_object('id', ORD_NO_RES, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    (ORD_CONSUMED, 'V3D-003', 'ready_for_production',
     jsonb_build_object('id', ORD_CONSUMED, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    (ORD_SECOND, 'V3D-004', 'ready_for_production',
     jsonb_build_object('id', ORD_SECOND, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-3D-EA','quantity',10,'unit','EA','description','Fungible 3D (All)')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now())

  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload;

  -- Reservas falsas para ORD_CONSUMED
  DELETE FROM inventory_reservations WHERE order_id IN (ORD_VALID, ORD_NO_RES, ORD_CONSUMED, ORD_SECOND);

  INSERT INTO inventory_reservations (
    order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by, consumed_at
  ) VALUES (
    ORD_CONSUMED, INV_ITEM_1, 'VERIFY-3D-EA', 'line-1', 1, 1, 'EA', 'fungible', 'consumed', ACTOR_PERM, now()
  );

  RAISE NOTICE 'SETUP completado ─────────────────────────────────────────────';

  -- ════════════════════════════════════════════════════════════════════════
  -- T1: release_order_inventory existe y retorna jsonb
  -- ════════════════════════════════════════════════════════════════════════
  DECLARE v_rt TEXT; v_sd BOOL;
  BEGIN
    SELECT pg_catalog.pg_get_function_result(p.oid), p.prosecdef
    INTO v_rt, v_sd
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='release_order_inventory';
    IF v_rt='jsonb' AND v_sd THEN
      RAISE NOTICE 'T1 PASS: return_type=jsonb, security_definer=true'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T1 FAIL: rt=%, sd=%', v_rt, v_sd; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T2: anon NO tiene EXECUTE
  -- ════════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM information_schema.routine_privileges
  WHERE routine_name='release_order_inventory' AND grantee='anon';
  IF v_count=0 THEN
    RAISE NOTICE 'T2 PASS: anon no tiene EXECUTE'; v_pass:=v_pass+1;
  ELSE
    RAISE WARNING 'T2 FAIL: anon tiene EXECUTE (count=%)', v_count; v_fail:=v_fail+1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- T3: authenticated SÍ tiene EXECUTE
  -- ════════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM information_schema.routine_privileges
  WHERE routine_name='release_order_inventory' AND grantee='authenticated' AND privilege_type='EXECUTE';
  IF v_count>0 THEN
    RAISE NOTICE 'T3 PASS: authenticated tiene EXECUTE'; v_pass:=v_pass+1;
  ELSE
    RAISE WARNING 'T3 FAIL: authenticated no tiene EXECUTE'; v_fail:=v_fail+1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- T4: Usuario sin inventory.reserve falla con PERMISSION_DENIED
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"DD000000-0000-0000-0001-000000000002","role":"authenticated"}', true);
  BEGIN
    v_result := public.release_order_inventory(ORD_VALID);
    RAISE WARNING 'T4 FAIL: no lanzó excepción'; v_fail:=v_fail+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'PERMISSION_DENIED%' THEN
      RAISE NOTICE 'T4 PASS: PERMISSION_DENIED (usuario sin inventory.reserve)'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T4 FAIL: excepción inesperada → %', SQLERRM; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T5: p_user_id distinto de auth.uid() falla con PERMISSION_DENIED
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"DD000000-0000-0000-0001-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.release_order_inventory(ORD_VALID, '99999999-9999-9999-9999-999999999999');
    RAISE WARNING 'T5 FAIL: no lanzó excepción'; v_fail:=v_fail+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'PERMISSION_DENIED%' THEN
      RAISE NOTICE 'T5 PASS: PERMISSION_DENIED (p_user_id mismatch)'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T5 FAIL: → %', SQLERRM; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T6: Orden inexistente falla con ORDER_NOT_FOUND
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.release_order_inventory('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF');
    RAISE WARNING 'T6 FAIL: no lanzó excepción'; v_fail:=v_fail+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ORDER_NOT_FOUND%' THEN
      RAISE NOTICE 'T6 PASS: ORDER_NOT_FOUND correcto'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T6 FAIL: → %', SQLERRM; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T9: Orden sin reservas devuelve no_reservations
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    v_result := public.release_order_inventory(ORD_NO_RES);
    IF (v_result->>'status') = 'no_reservations' THEN
      RAISE NOTICE 'T9 PASS: no_reservations correcto para orden sin reservas'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T9 FAIL: devolvió %', v_result; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T10: Reserva consumed → RELEASE_NOT_ALLOWED_CONSUMED
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.release_order_inventory(ORD_CONSUMED);
    RAISE WARNING 'T10 FAIL: no lanzó excepción'; v_fail:=v_fail+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'RELEASE_NOT_ALLOWED_CONSUMED%' THEN
      RAISE NOTICE 'T10 PASS: RELEASE_NOT_ALLOWED_CONSUMED correcto'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T10 FAIL: → %', SQLERRM; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T7: Reservar y liberar (happy path)
  -- ════════════════════════════════════════════════════════════════════════
  -- Primero reservamos
  PERFORM public.reserve_order_inventory(ORD_VALID, ACTOR_PERM);

  BEGIN
    v_result := public.release_order_inventory(ORD_VALID, NULL, 'test_reason_123');

    SELECT * INTO v_res_record
    FROM inventory_reservations
    WHERE order_id = ORD_VALID
    LIMIT 1;

    IF (v_result->>'status') = 'released'
       AND (v_result->>'released_count')::int > 0
       AND v_res_record.status = 'released'
       AND v_res_record.released_at IS NOT NULL
       AND v_res_record.released_by = ACTOR_PERM
       AND v_res_record.release_reason = 'test_reason_123'
    THEN
      RAISE NOTICE 'T7 PASS: Reservas liberadas correctamente (released_at, released_by, reason verificados)'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T7 FAIL: result=%, record_status=%, record_reason=%', v_result, v_res_record.status, v_res_record.release_reason;
      v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T12: Release no toca work_orders.status
  -- ════════════════════════════════════════════════════════════════════════
  SELECT status INTO v_wo_status FROM work_orders WHERE id = ORD_VALID;
  IF v_wo_status = 'ready_for_production' THEN
    RAISE NOTICE 'T12 PASS: work_orders.status intacto'; v_pass:=v_pass+1;
  ELSE
    RAISE WARNING 'T12 FAIL: work_orders.status cambió a %', v_wo_status; v_fail:=v_fail+1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- T8: Segunda llamada → already_released
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    v_result := public.release_order_inventory(ORD_VALID);
    IF (v_result->>'status') = 'already_released' AND (v_result->>'released_count')::int = 0 THEN
      RAISE NOTICE 'T8 PASS: already_released correcto en segunda llamada'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T8 FAIL: devolvió %', v_result; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T11: Otra orden puede reservar el mismo ítem tras release
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    -- La orden ORD_VALID liberó sus 2 EA. La orden ORD_SECOND pide 10 EA.
    -- Como el inventario original era 10 EA, si la liberación fue exitosa, ORD_SECOND puede reservar los 10.
    v_result := public.reserve_order_inventory(ORD_SECOND, ACTOR_PERM);
    IF (v_result->>'ok')::bool = true THEN
      RAISE NOTICE 'T11 PASS: nueva orden pudo reservar el inventario liberado'; v_pass:=v_pass+1;
    ELSE
      RAISE WARNING 'T11 FAIL: reserva falló para la nueva orden → %', v_result; v_fail:=v_fail+1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- RESULTADO FINAL
  -- ════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  RESULTADO 3D: % PASS / % FAIL  (total % tests)',
    v_pass, v_fail, v_pass + v_fail;
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'HAY % TESTS FALLANDO — revisar avisos anteriores', v_fail;
  END IF;

END $$;
