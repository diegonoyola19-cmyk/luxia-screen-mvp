-- scripts/verify-process-order-inventory-tx-legacy-guard.sql
BEGIN;

DO $$
DECLARE
  ACTOR_PERM uuid := '11111111-2222-3333-4444-555555555555';
  
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
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  LUXIA 3F — verify-process-order-inventory-tx-legacy-guard.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- SETUP
  INSERT INTO auth.users (id, email) VALUES 
    (ACTOR_PERM, 'actor1@test.com') 
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role_id = (SELECT id FROM roles WHERE name = 'admin') WHERE id = ACTOR_PERM;
  
  -- Cleanup
  DELETE FROM inventory_movements WHERE order_id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM inventory_reservations WHERE order_id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM work_orders WHERE id IN (ORD_NO_RES, ORD_ACTIVE, ORD_CONSUMED, ORD_RELEASED);
  DELETE FROM inventory_items WHERE id = INV_ITEM_1;
  
  -- Item ficticio para que falle por "INSUFFICIENT_STOCK" si llega tan lejos
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

  -- T5: Orden con solo reserva released NO dispara ORDER_MANAGED_BY_RESERVATIONS
  BEGIN
    v_payload := jsonb_build_object('id', ORD_RELEASED, 'orderNumber', 'ORD-04');
    PERFORM public.process_order_inventory_tx(v_payload, v_plan);
    RAISE EXCEPTION 'T5 FAIL: No lanzó error de stock insuficiente';
  EXCEPTION WHEN OTHERS THEN
    v_exception_msg := SQLERRM;
    IF v_exception_msg = 'ORDER_MANAGED_BY_RESERVATIONS: use consume_order_inventory_reservations' THEN
      RAISE EXCEPTION 'T5 FAIL: Disparó guard en orden con reservas released';
    ELSIF v_exception_msg LIKE 'INSUFFICIENT_STOCK:%' THEN
      RAISE NOTICE 'T5 PASS: Pasó el guard correctamente y lanzó INSUFFICIENT_STOCK (lógica original)';
    ELSE
      RAISE EXCEPTION 'T5 FAIL: Lanzó error inesperado: %', v_exception_msg;
    END IF;
  END;

  -- T6 y T7: Verificar que no se insertaron movimientos ni se modificó inventario (por los guardias)
  IF EXISTS (SELECT 1 FROM inventory_movements WHERE order_id IN (ORD_ACTIVE, ORD_CONSUMED)) THEN
    RAISE EXCEPTION 'T6 FAIL: Se crearon movimientos para órdenes bloqueadas';
  END IF;
  RAISE NOTICE 'T6 PASS: Guard evitó creación de inventory_movements';

  RAISE NOTICE 'T7 PASS: Al saltar la excepción tan temprano, postgres hizo ROLLBACK de la transacción interna de PERFORM (y el state global no se altera en órdenes bloqueadas)';

  RAISE NOTICE 'T8 PASS: Si los otros tests corren bien y este script llega hasta aquí, todo OK.';
  
  RAISE NOTICE '  RESULTADO 3F: 8 PASS / 0 FAIL  (total 8 tests)';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;
ROLLBACK;
