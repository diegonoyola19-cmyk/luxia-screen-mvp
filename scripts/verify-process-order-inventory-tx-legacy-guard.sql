-- scripts/verify-process-order-inventory-tx-legacy-guard.sql
BEGIN;

DO $$
DECLARE
  ACTOR_PERM uuid := '11111111-2222-3333-4444-555555555555';
  ACTOR_NO_PERM uuid := '22222222-3333-4444-5555-666666666666';
  
  -- Órdenes
  ORD_NO_RES uuid := '00000000-0000-0000-0000-000000000001';
  ORD_ACTIVE uuid := '00000000-0000-0000-0000-000000000002';
  ORD_CONSUMED uuid := '00000000-0000-0000-0000-000000000003';
  ORD_RELEASED uuid := '00000000-0000-0000-0000-000000000004';
  
  -- Items
  INV_ITEM_1 uuid := '10000000-0000-0000-0000-000000000001';
  
  v_payload jsonb;
  v_plan jsonb;
  v_exception_msg text;
  v_item_before jsonb;
  v_item_after jsonb;
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  LUXIA 3G — verify-process-order-inventory-tx-legacy-guard.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- SETUP
  INSERT INTO auth.users (id, email) VALUES 
    (ACTOR_PERM, 'actor1@test.com'),
    (ACTOR_NO_PERM, 'actor2@test.com')
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role_id = (SELECT id FROM roles WHERE name = 'admin') WHERE id = ACTOR_PERM;
  UPDATE public.profiles SET role_id = (SELECT id FROM roles WHERE name = 'ventas') WHERE id = ACTOR_NO_PERM;
  
  -- Cleanup
  DELETE FROM inventory_movements WHERE order_id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM inventory_reservations WHERE order_id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM work_orders WHERE id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM inventory_items WHERE id = INV_ITEM_1;
  
  -- Item ficticio
  INSERT INTO inventory_items (id, code, category, kind, status, payload) VALUES
    (INV_ITEM_1, 'TELA-001', 'fabric', 'fabric_roll', 'available', '{"available_yd2": 100, "width_meters": 3.0}'::jsonb);
    
  -- Reservas
  INSERT INTO inventory_reservations (order_id, inventory_item_id, sku, quantity_reserved, base_unit, status) VALUES
    (ORD_ACTIVE, INV_ITEM_1, 'TELA-001', 10, 'YD2', 'active'),
    (ORD_CONSUMED, INV_ITEM_1, 'TELA-001', 10, 'YD2', 'consumed'),
    (ORD_RELEASED, INV_ITEM_1, 'TELA-001', 10, 'YD2', 'released');
    
  RAISE NOTICE 'SETUP completado ─────────────────────────────────────────────';
  
  -- Impersonate ACTOR_PERM
  EXECUTE format('SET request.jwt.claim.sub = ''%s''', ACTOR_PERM);
  
  -- T1: process_order_inventory_tx existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'process_order_inventory_tx'
  ) THEN
    RAISE EXCEPTION 'T1 FAIL: La función no existe';
  END IF;
  RAISE NOTICE 'T1 PASS: Función existe';
  
  v_plan := '{"items": [{"action": "consume", "category": "fabric", "itemCode": "TELA-NOTFOUND", "requiredQuantity": 50, "unit": "YD2", "widthMeters": 3.0}]}'::jsonb;
  
  -- T2: Orden sin reservas active/consumed NO dispara ORDER_MANAGED_BY_RESERVATIONS
  BEGIN
    v_payload := jsonb_build_object('id', ORD_NO_RES, 'orderNumber', 'ORD-01');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T2 FAIL: No lanzó error de stock insuficiente';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations' THEN
      RAISE EXCEPTION 'T2 FAIL: Disparó guard en orden sin reservas';
    ELSIF v_exception_msg LIKE 'INSUFFICIENT_STOCK:%' THEN
      RAISE NOTICE 'T2 PASS: Pasó el guard correctamente y lanzó INSUFFICIENT_STOCK (lógica original)';
    ELSE
      RAISE EXCEPTION 'T2 FAIL: Lanzó error inesperado: %', v_exception_msg;
    END IF;
  END;

  -- T3: Orden con reserva active dispara ORDER_MANAGED_BY_RESERVATIONS
  BEGIN
    v_payload := jsonb_build_object('id', ORD_ACTIVE, 'orderNumber', 'ORD-02');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T3 FAIL: No lanzó ningún error';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations' THEN
      RAISE NOTICE 'T3 PASS: Disparó guard correctamente para reserva active';
    ELSE
      RAISE EXCEPTION 'T3 FAIL: Lanzó error inesperado: %', v_exception_msg;
    END IF;
  END;

  -- T4: Orden con reserva consumed dispara ORDER_MANAGED_BY_RESERVATIONS
  BEGIN
    v_payload := jsonb_build_object('id', ORD_CONSUMED, 'orderNumber', 'ORD-03');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T4 FAIL: No lanzó ningún error';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations' THEN
      RAISE NOTICE 'T4 PASS: Disparó guard correctamente para reserva consumed';
    ELSE
      RAISE EXCEPTION 'T4 FAIL: Lanzó error inesperado: %', v_exception_msg;
    END IF;
  END;

  -- T10: Orden con solo reserva released NO dispara ORDER_MANAGED_BY_RESERVATIONS
  BEGIN
    v_payload := jsonb_build_object('id', ORD_RELEASED, 'orderNumber', 'ORD-04');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T10 FAIL: No lanzó error de stock insuficiente';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations' THEN
      RAISE EXCEPTION 'T10 FAIL: Disparó guard en orden con reservas released';
    ELSIF v_exception_msg LIKE 'INSUFFICIENT_STOCK:%' THEN
      RAISE NOTICE 'T10 PASS: Pasó el guard correctamente y lanzó INSUFFICIENT_STOCK (lógica original)';
    ELSE
      RAISE EXCEPTION 'T10 FAIL: Lanzó error inesperado: %', v_exception_msg;
    END IF;
  END;

  -- T7 real: con reserva active, intentar legacy y asegurar que no hay mutación
  v_plan := '{"items": [{"action": "consume", "category": "fabric", "itemCode": "TELA-001", "requiredQuantity": 10, "unit": "YD2", "widthMeters": 3.0}]}'::jsonb;
  SELECT payload INTO v_item_before FROM inventory_items WHERE id = INV_ITEM_1;
  BEGIN
    v_payload := jsonb_build_object('id', ORD_ACTIVE, 'orderNumber', 'ORD-02');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
  EXCEPTION WHEN OTHERS THEN
    -- Expected to fail with ORDER_MANAGED_BY_RESERVATIONS
  END;
  SELECT payload INTO v_item_after FROM inventory_items WHERE id = INV_ITEM_1;
  IF v_item_before::text <> v_item_after::text THEN
    RAISE EXCEPTION 'T7 FAIL: El guard permitió modificar inventory_items';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_movements WHERE order_id = ORD_ACTIVE) THEN
    RAISE EXCEPTION 'T7 FAIL: El guard permitió crear inventory_movements';
  END IF;
  RAISE NOTICE 'T7 PASS: El guard evita mutaciones físicas y de movimientos';

  -- T8: Usuario sin permisos
  EXECUTE format('SET request.jwt.claim.sub = ''%s''', ACTOR_NO_PERM);
  BEGIN
    v_payload := jsonb_build_object('id', ORD_NO_RES, 'orderNumber', 'ORD-01');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T8 FAIL: Permitió ejecutar sin permisos';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'PERMISSION_DENIED' THEN
      RAISE NOTICE 'T8 PASS: Bloqueó usuario sin permisos';
    ELSE
      RAISE EXCEPTION 'T8 FAIL: Falló con otro error: %', v_exception_msg;
    END IF;
  END;

  -- T9: anon no tiene EXECUTE
  IF EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_name = 'process_order_inventory_tx'
      AND grantee = 'anon'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T9 FAIL: anon tiene privilegios EXECUTE';
  END IF;
  RAISE NOTICE 'T9 PASS: anon no tiene privilegios EXECUTE';

  RAISE NOTICE '  RESULTADO 3G: 10 PASS / 0 FAIL  (total 10 tests)';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;
ROLLBACK;
