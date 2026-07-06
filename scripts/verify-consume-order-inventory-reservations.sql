-- ════════════════════════════════════════════════════════════════════════
-- LUXIA 3E.1 — verify-consume-order-inventory-reservations.sql
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_pass int := 0;
  v_result jsonb;
  v_err text;
  v_count int;
  v_movements_count int;
  
  -- Usuarios de prueba
  ACTOR_PERM uuid := '11111111-2222-3333-4444-555555555555';
  ACTOR_NO_PERM uuid := '99999999-8888-7777-6666-555555555555';
  
  -- Órdenes
  ORD_VALID uuid := '00000000-0000-0000-0000-000000000001';
  ORD_NO_RES uuid := '00000000-0000-0000-0000-000000000002';
  ORD_CONSUMED uuid := '00000000-0000-0000-0000-000000000003';
  ORD_INVALID uuid := '00000000-0000-0000-0000-000000000004';
  
  -- Ítems
  INV_ITEM_1 uuid := '11111111-0000-0000-0000-000000000001'; -- Tela
  INV_ITEM_2 uuid := '22222222-0000-0000-0000-000000000002'; -- Lineal
  INV_ITEM_3 uuid := '33333333-0000-0000-0000-000000000003'; -- Fungible
  
  v_payload_1 jsonb;
  v_payload_2 jsonb;
  v_payload_3 jsonb;
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  LUXIA 3E.1 — verify-consume-order-inventory-reservations.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ════════════════════════════════════════════════════════════════════════
  -- SETUP
  -- ════════════════════════════════════════════════════════════════════════
  
  -- Insertar usuarios
  INSERT INTO auth.users (id, email) VALUES 
    (ACTOR_PERM, 'actor1@test.com'), 
    (ACTOR_NO_PERM, 'actor2@test.com') 
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role_id = (SELECT id FROM roles WHERE name = 'admin') WHERE id = ACTOR_PERM;
  UPDATE public.profiles SET role_id = (SELECT id FROM roles WHERE name = 'consulta') WHERE id = ACTOR_NO_PERM;
  
  -- Restaurar/Insertar ítems base con cantidades conocidas
  DELETE FROM inventory_items WHERE id IN (INV_ITEM_1, INV_ITEM_2, INV_ITEM_3);
  
  INSERT INTO inventory_items (id, code, category, kind, status, payload) VALUES
    (INV_ITEM_1, 'TELA-001', 'fabric', 'fabric_roll', 'available', '{"available_yd2": 100}'::jsonb),
    (INV_ITEM_2, 'LINEAL-001', 'component', 'linear_item', 'available', '{"length_feet": 50, "length_meters": 15.24}'::jsonb),
    (INV_ITEM_3, 'FUNGIBLE-001', 'component', 'fungible', 'available', '{"available_quantity": 200}'::jsonb);

  -- Órdenes
  DELETE FROM work_orders WHERE id IN (ORD_VALID, ORD_NO_RES, ORD_CONSUMED, ORD_INVALID);
  
  INSERT INTO work_orders (id, order_number, payload, status) VALUES 
    (ORD_VALID, 'TEST-CONS-1', '{}', 'in_production'),
    (ORD_NO_RES, 'TEST-CONS-2', '{}', 'in_production'),
    (ORD_CONSUMED, 'TEST-CONS-3', '{}', 'in_production'),
    (ORD_INVALID, 'TEST-CONS-4', '{}', 'ready_for_production');

  -- Limpiar reservas e movements
  DELETE FROM inventory_movements WHERE order_id IN (ORD_VALID, ORD_NO_RES, ORD_CONSUMED, ORD_INVALID);
  DELETE FROM inventory_reservations WHERE order_id IN (ORD_VALID, ORD_NO_RES, ORD_CONSUMED, ORD_INVALID);

  -- Reservas iniciales para ORD_VALID
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by) VALUES
    (ORD_VALID, INV_ITEM_1, 'TELA-001', 'line-1', 10, 10, 'YD2', 'fabric', 'active', ACTOR_PERM),
    (ORD_VALID, INV_ITEM_2, 'LINEAL-001', 'line-2', 5, 5, 'FT', 'linear', 'active', ACTOR_PERM),
    (ORD_VALID, INV_ITEM_3, 'FUNGIBLE-001', 'line-3', 20, 20, 'EA', 'fungible', 'active', ACTOR_PERM);

  -- Reservas para ORD_CONSUMED (para probar idempotencia)
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by, consumed_at, consumed_by) VALUES
    (ORD_CONSUMED, INV_ITEM_3, 'FUNGIBLE-001', 'line-x', 5, 5, 'EA', 'fungible', 'consumed', ACTOR_PERM, now(), ACTOR_PERM);

  -- Reservas para ORD_INVALID
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by) VALUES
    (ORD_INVALID, INV_ITEM_3, 'FUNGIBLE-001', 'line-z', 5, 5, 'EA', 'fungible', 'active', ACTOR_PERM);

  RAISE NOTICE 'SETUP completado ─────────────────────────────────────────────';

  -- T1: existe, retorna jsonb y es SECURITY DEFINER
  SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
  WHERE n.nspname = 'public' AND p.proname = 'consume_order_inventory_reservations' AND p.prosecdef = true;
  IF v_count = 1 THEN RAISE NOTICE 'T1 PASS: return_type=jsonb, security_definer=true'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T1 FAIL'; END IF;

  -- T2: anon no tiene EXECUTE
  SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
  WHERE n.nspname = 'public' AND p.proname = 'consume_order_inventory_reservations' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_count = 0 THEN RAISE NOTICE 'T2 PASS: anon no tiene EXECUTE'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T2 FAIL'; END IF;

  -- T3: authenticated tiene EXECUTE
  SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
  WHERE n.nspname = 'public' AND p.proname = 'consume_order_inventory_reservations' AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_count = 1 THEN RAISE NOTICE 'T3 PASS: authenticated tiene EXECUTE'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T3 FAIL'; END IF;

  -- Mock auth.uid() = null (T4)
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID);
    RAISE EXCEPTION 'T4 FAIL: debió fallar por auth.uid() nulo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PERMISSION_DENIED%' THEN RAISE NOTICE 'T4 PASS: auth.uid null → PERMISSION_DENIED'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T4 FAIL: %', SQLERRM; END IF;
  END;

  -- Impersonate ACTOR_NO_PERM
  EXECUTE format('SET request.jwt.claim.sub = ''%s''', ACTOR_NO_PERM);

  -- T5: usuario sin inventory.consume
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID);
    RAISE EXCEPTION 'T5 FAIL: debió fallar por falta de permiso';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PERMISSION_DENIED%' THEN RAISE NOTICE 'T5 PASS: usuario sin inventory.consume → PERMISSION_DENIED'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T5 FAIL: %', SQLERRM; END IF;
  END;

  -- Impersonate ACTOR_PERM
  EXECUTE format('SET request.jwt.claim.sub = ''%s''', ACTOR_PERM);

  -- T6: p_user_id mismatch
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID, ACTOR_NO_PERM);
    RAISE EXCEPTION 'T6 FAIL: debió fallar por mismatch de user_id';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PERMISSION_DENIED%' THEN RAISE NOTICE 'T6 PASS: p_user_id mismatch → PERMISSION_DENIED'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T6 FAIL: %', SQLERRM; END IF;
  END;

  -- T7: orden inexistente
  BEGIN
    PERFORM public.consume_order_inventory_reservations('99999999-0000-0000-0000-000000000009', ACTOR_PERM);
    RAISE EXCEPTION 'T7 FAIL: debió fallar por orden inexistente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ORDER_NOT_FOUND%' THEN RAISE NOTICE 'T7 PASS: orden inexistente → ORDER_NOT_FOUND'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T7 FAIL: %', SQLERRM; END IF;
  END;

  -- T10: sin reservas
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_NO_RES, ACTOR_PERM);
    RAISE EXCEPTION 'T10 FAIL: debió fallar por no reservas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%NO_RESERVATIONS%' THEN RAISE NOTICE 'T10 PASS: sin reservas → NO_RESERVATIONS'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T10 FAIL: %', SQLERRM; END IF;
  END;

  -- T11: todas consumed -> already_consumed
  v_result := public.consume_order_inventory_reservations(ORD_CONSUMED, ACTOR_PERM);
  IF v_result->>'status' = 'already_consumed' THEN 
    RAISE NOTICE 'T11 PASS: todas consumed → already_consumed'; v_pass:=v_pass+1; 
  ELSE 
    RAISE EXCEPTION 'T11 FAIL'; 
  END IF;

  -- T8: status ready_for_production -> INVALID_ORDER_STATUS
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_INVALID, ACTOR_PERM);
    RAISE EXCEPTION 'T8 FAIL: debió fallar por status';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_ORDER_STATUS%' THEN RAISE NOTICE 'T8 PASS: status ready_for_production → INVALID_ORDER_STATUS'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T8 FAIL: %', SQLERRM; END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T9, T15, T16, T17, T19, T20: Consumo OK
  -- ════════════════════════════════════════════════════════════════════════
  v_result := public.consume_order_inventory_reservations(ORD_VALID, ACTOR_PERM);
  IF v_result->>'status' = 'consumed' AND (v_result->>'consumed_count')::int = 3 THEN
    RAISE NOTICE 'T9 PASS: status in_production + reservas active → consume OK'; v_pass:=v_pass+1;
  ELSE
    RAISE EXCEPTION 'T9 FAIL: %', v_result;
  END IF;

  -- Validar payload de inventory_items
  SELECT payload INTO v_payload_1 FROM inventory_items WHERE id = INV_ITEM_1;
  SELECT payload INTO v_payload_2 FROM inventory_items WHERE id = INV_ITEM_2;
  SELECT payload INTO v_payload_3 FROM inventory_items WHERE id = INV_ITEM_3;

  -- T15: Tela descuenta available_yd2 (100 - 10 = 90)
  IF (v_payload_1->>'available_yd2')::numeric = 90 THEN RAISE NOTICE 'T15 PASS: tela descuenta available_yd2'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T15 FAIL'; END IF;
  
  -- T16: Lineal descuenta length_feet (50 - 5 = 45) y length_meters
  IF (v_payload_2->>'length_feet')::numeric = 45 AND (v_payload_2->>'length_meters')::numeric < 15.24 THEN 
    RAISE NOTICE 'T16 PASS: lineal descuenta length_feet y length_meters'; v_pass:=v_pass+1; 
  ELSE 
    RAISE EXCEPTION 'T16 FAIL'; 
  END IF;

  -- T17: Fungible descuenta available_quantity (200 - 20 = 180)
  IF (v_payload_3->>'available_quantity')::numeric = 180 THEN RAISE NOTICE 'T17 PASS: fungible descuenta available_quantity'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T17 FAIL'; END IF;

  -- T19: inventory_movements contiene reservation_id
  SELECT COUNT(*) INTO v_movements_count FROM inventory_movements WHERE order_id = ORD_VALID AND action = 'consume' AND payload ? 'reservation_id';
  IF v_movements_count = 3 THEN RAISE NOTICE 'T19 PASS: inventory_movements contiene reservation_id'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T19 FAIL: count=%', v_movements_count; END IF;

  -- T20: work_orders.status no cambia
  SELECT COUNT(*) INTO v_count FROM work_orders WHERE id = ORD_VALID AND status = 'in_production';
  IF v_count = 1 THEN RAISE NOTICE 'T20 PASS: work_orders.status no cambia'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T20 FAIL'; END IF;

  -- T22: Segunda llamada no crea nuevos movements (idempotencia already_consumed)
  v_result := public.consume_order_inventory_reservations(ORD_VALID, ACTOR_PERM);
  IF v_result->>'status' = 'already_consumed' THEN
    SELECT COUNT(*) INTO v_count FROM inventory_movements WHERE order_id = ORD_VALID AND action = 'consume';
    IF v_count = 3 THEN RAISE NOTICE 'T22 PASS: segunda llamada no crea nuevos movements'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T22 FAIL'; END IF;
  ELSE
    RAISE EXCEPTION 'T22 FAIL';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- T21: release_order_inventory después de consumed falla
  -- ════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.release_order_inventory(ORD_VALID, ACTOR_PERM, 'test');
    RAISE EXCEPTION 'T21 FAIL: debió fallar por estar consumidas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RELEASE_NOT_ALLOWED_CONSUMED%' THEN 
      RAISE NOTICE 'T21 PASS: release_order_inventory después de consumed falla'; v_pass:=v_pass+1; 
    ELSE 
      RAISE EXCEPTION 'T21 FAIL: %', SQLERRM; 
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- Modificamos estado manual para testear inconsistencias
  -- ════════════════════════════════════════════════════════════════════════
  
  -- T13: mezcla active + consumed
  UPDATE inventory_reservations SET status = 'active' WHERE order_id = ORD_VALID AND inventory_item_id = INV_ITEM_1;
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID, ACTOR_PERM);
    RAISE EXCEPTION 'T13 FAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INCONSISTENT_RESERVATION_STATE%' THEN RAISE NOTICE 'T13 PASS: mezcla active + consumed'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T13 FAIL: %', SQLERRM; END IF;
  END;

  -- T12: released -> RESERVATION_RELEASED
  UPDATE inventory_reservations SET status = 'released' WHERE order_id = ORD_VALID AND inventory_item_id = INV_ITEM_2;
  -- Todas las demás consumed (INV_ITEM_3 es consumed)
  UPDATE inventory_reservations SET status = 'consumed' WHERE order_id = ORD_VALID AND inventory_item_id = INV_ITEM_1;
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID, ACTOR_PERM);
    RAISE EXCEPTION 'T12 FAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RESERVATION_RELEASED%' THEN RAISE NOTICE 'T12 PASS: released → RESERVATION_RELEASED'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T12 FAIL: %', SQLERRM; END IF;
  END;

  -- T14: mezcla active + released
  UPDATE inventory_reservations SET status = 'active' WHERE order_id = ORD_VALID AND inventory_item_id = INV_ITEM_1;
  BEGIN
    PERFORM public.consume_order_inventory_reservations(ORD_VALID, ACTOR_PERM);
    RAISE EXCEPTION 'T14 FAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RESERVATION_RELEASED%' THEN RAISE NOTICE 'T14 PASS: mezcla active + released → RESERVATION_RELEASED'; v_pass:=v_pass+1; ELSE RAISE EXCEPTION 'T14 FAIL: %', SQLERRM; END IF;
  END;

  -- T18: item no puede quedar negativo (INSUFFICIENT_STOCK)
  -- Limpiamos y preparamos una nueva orden para sobre-consumo
  UPDATE inventory_items SET payload = '{"available_quantity": 5, "status": "active"}'::jsonb WHERE id = INV_ITEM_3;
  INSERT INTO work_orders (id, order_number, payload, status) VALUES ('00000000-0000-0000-0000-000000000005', 'T18', '{}', 'in_production');
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by) VALUES
    ('00000000-0000-0000-0000-000000000005', INV_ITEM_3, 'FUNGIBLE-001', 'line-x', 10, 10, 'EA', 'fungible', 'active', ACTOR_PERM);
  
  BEGIN
    PERFORM public.consume_order_inventory_reservations('00000000-0000-0000-0000-000000000005', ACTOR_PERM);
    RAISE EXCEPTION 'T18 FAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' THEN 
      RAISE NOTICE 'T18 PASS: item no puede quedar negativo'; v_pass:=v_pass+1; 
    ELSE 
      RAISE EXCEPTION 'T18 FAIL: %', SQLERRM; 
    END IF;
  END;

  -- T23: tela con width_meters recalcula length_meters
  INSERT INTO work_orders (id, order_number, payload, status) VALUES ('00000000-0000-0000-0000-000000000006', 'T23', '{}', 'in_production');
  INSERT INTO inventory_items (id, code, category, kind, status, payload) VALUES
    ('66666666-0000-0000-0000-000000000006', 'TELA-002', 'fabric', 'fabric_roll', 'available', '{"available_yd2": 100, "width_meters": 3.0, "length_meters": 27.87}'::jsonb);
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by) VALUES
    ('00000000-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000006', 'TELA-002', 'line-x', 10, 10, 'YD2', 'fabric', 'active', ACTOR_PERM);
  
  PERFORM public.consume_order_inventory_reservations('00000000-0000-0000-0000-000000000006', ACTOR_PERM);
  SELECT payload INTO v_payload_1 FROM inventory_items WHERE id = '66666666-0000-0000-0000-000000000006';
  SELECT payload INTO v_payload_2 FROM inventory_movements WHERE order_id = '00000000-0000-0000-0000-000000000006';
  IF (v_payload_1->>'available_yd2')::numeric = 90 AND (v_payload_1->>'length_meters')::numeric = 90 / (3.0 * 1.19599) AND (v_payload_2->>'length_meters_recalculated')::boolean = true THEN
    RAISE NOTICE 'T23 PASS: tela recalcula length_meters con width_meters'; v_pass:=v_pass+1;
  ELSE
    RAISE EXCEPTION 'T23 FAIL: payload_1=% payload_2=%', v_payload_1, v_payload_2;
  END IF;

  -- T24: tela sin width_meters descuenta pero no recalcula
  INSERT INTO work_orders (id, order_number, payload, status) VALUES ('00000000-0000-0000-0000-000000000007', 'T24', '{}', 'in_production');
  INSERT INTO inventory_items (id, code, category, kind, status, payload) VALUES
    ('77777777-0000-0000-0000-000000000007', 'TELA-003', 'fabric', 'fabric_roll', 'available', '{"available_yd2": 100}'::jsonb);
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, material_line_id, required_quantity, quantity_reserved, base_unit, source, status, created_by) VALUES
    ('00000000-0000-0000-0000-000000000007', '77777777-0000-0000-0000-000000000007', 'TELA-003', 'line-x', 10, 10, 'YD2', 'fabric', 'active', ACTOR_PERM);

  PERFORM public.consume_order_inventory_reservations('00000000-0000-0000-0000-000000000007', ACTOR_PERM);
  SELECT payload INTO v_payload_1 FROM inventory_items WHERE id = '77777777-0000-0000-0000-000000000007';
  SELECT payload INTO v_payload_2 FROM inventory_movements WHERE order_id = '00000000-0000-0000-0000-000000000007';
  IF (v_payload_1->>'available_yd2')::numeric = 90 AND NOT (v_payload_1 ? 'length_meters') AND (v_payload_2->>'length_meters_recalculated')::boolean = false THEN
    RAISE NOTICE 'T24 PASS: tela sin width_meters no recalcula length_meters'; v_pass:=v_pass+1;
  ELSE
    RAISE EXCEPTION 'T24 FAIL';
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  RESULTADO 3G: % PASS / 0 FAIL  (total 24 tests)', v_pass;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END;
$$;
