-- ============================================================
-- LUXIA — scripts/verify-reserve-order-inventory.sql
-- Pruebas funcionales de reserve_order_inventory (Bloque 3C.3)
-- ============================================================
--
-- Ejecutar contra Supabase local DESPUÉS de: supabase db reset
--
--   supabase db query --file scripts/verify-reserve-order-inventory.sql
--
-- Cubre:
--   T1. Lineal en M → quantity_reserved en FT (CR-1)
--   T2. Retazo bloqueado → UNSUPPORTED_SCRAP_RESERVATION_V1 (MED-1)
--   T3. Fungible split → required_quantity = v_take por fila (MED-2)
--   T4. Sobre-reserva en segunda orden sobre misma barra → falla (CR-1 regresión)
-- ============================================================

DO $$
DECLARE
  -- UUIDs
  ACTOR_PERM    CONSTANT UUID := 'CC000000-0000-0000-0001-000000000001';
  ORD_LINEAR_M  CONSTANT UUID := 'CC100000-0000-0000-0000-000000000001'; -- req 3 M
  ORD_LINEAR_B  CONSTANT UUID := 'CC100000-0000-0000-0000-000000000002'; -- req 10 M → sobra insuficiente
  ORD_SCRAP     CONSTANT UUID := 'CC100000-0000-0000-0000-000000000003'; -- SKU solo tiene scrap
  ORD_SPLIT     CONSTANT UUID := 'CC100000-0000-0000-0000-000000000004'; -- fungible 6 EA, ítems 4+3
  INV_BAR_19FT  CONSTANT UUID := 'CC200000-0000-0000-0000-000000000001'; -- barra 19 FT
  INV_SCRAP_BAR CONSTANT UUID := 'CC200000-0000-0000-0000-000000000002'; -- retazo scrap
  INV_EA_4      CONSTANT UUID := 'CC200000-0000-0000-0000-000000000003'; -- fungible 4 EA
  INV_EA_3      CONSTANT UUID := 'CC200000-0000-0000-0000-000000000004'; -- fungible 3 EA

  v_result        JSONB;
  v_caught        TEXT;
  v_qty_reserved  NUMERIC;
  v_base_unit     TEXT;
  v_row_count     INT;
  v_sum_rq        NUMERIC;
  v_pass          INT := 0;
  v_fail          INT := 0;
  EXPECTED_FT     CONSTANT NUMERIC := 3.0 * 3.28084;  -- 3 M → 9.84252 FT
BEGIN

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  LUXIA 3C.3 — verify-reserve-order-inventory.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ── SETUP ────────────────────────────────────────────────────────────────

  -- Actor con permiso inventory.reserve
  INSERT INTO auth.users (id, email)
  VALUES (ACTOR_PERM, 'verify3c3@luxia.test')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET
    role    = 'produccion',
    role_id = (SELECT id FROM public.roles WHERE name = 'produccion'),
    is_active = true
  WHERE id = ACTOR_PERM;

  -- Inventario
  INSERT INTO inventory_items (id, category, kind, code, status, payload)
  VALUES
    -- Barra real de 19 FT (T1, T4)
    (INV_BAR_19FT, 'tube', 'bar', 'VERIFY-BAR-01', 'available',
     jsonb_build_object('length_feet', 19.0, 'length_meters', 5.7912)),
    -- Retazo/scrap del mismo SKU que el pedido T2
    (INV_SCRAP_BAR, 'tube', 'scrap', 'VERIFY-SCRAP-01', 'available',
     jsonb_build_object('length_feet', 5.0, 'length_meters', 1.524)),
    -- Fungibles para T3
    (INV_EA_4, 'component', 'unit', 'VERIFY-EA-01', 'available',
     jsonb_build_object('available_quantity', 4, 'unit', 'EA')),
    (INV_EA_3, 'component', 'unit', 'VERIFY-EA-01', 'available',
     jsonb_build_object('available_quantity', 3, 'unit', 'EA'))
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, status = 'available';

  -- Órdenes
  INSERT INTO work_orders (id, order_number, status, payload, created_at, updated_at)
  VALUES
    -- T1: requiere 3 M de VERIFY-BAR-01
    (ORD_LINEAR_M, 'VERIFY-T1', 'ready_for_production',
     jsonb_build_object('id', ORD_LINEAR_M, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-BAR-01','quantity',3.0,'unit','M','description','Barra en M')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    -- T4 (regresión CR-1): segunda orden que pide 4 M sobre la misma barra (solo quedan ~9.16 FT)
    (ORD_LINEAR_B, 'VERIFY-T4', 'ready_for_production',
     jsonb_build_object('id', ORD_LINEAR_B, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-BAR-01','quantity',4.0,'unit','M','description','Barra en M grande')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    -- T2: pide SKU que SOLO tiene scraps (VERIFY-SCRAP-01)
    (ORD_SCRAP, 'VERIFY-T2', 'ready_for_production',
     jsonb_build_object('id', ORD_SCRAP, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-SCRAP-01','quantity',3.0,'unit','FT','description','Solo scrap')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now()),

    -- T3: fungible 6 EA, repartido entre 2 ítems de 4 y 3
    (ORD_SPLIT, 'VERIFY-T3', 'ready_for_production',
     jsonb_build_object('id', ORD_SPLIT, 'status', 'ready_for_production',
       'productionReview', jsonb_build_object('status', 'completed',
         'finalMaterialLines', jsonb_build_array(
           jsonb_build_object('sku','VERIFY-EA-01','quantity',6,'unit','EA','description','Fungible split')
         ), 'finalFabricLines', '[]'::jsonb)),
     now(), now())

  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload;

  -- Limpiar reservas de órdenes de prueba
  DELETE FROM inventory_reservations WHERE order_id IN (ORD_LINEAR_M, ORD_LINEAR_B, ORD_SCRAP, ORD_SPLIT);

  RAISE NOTICE 'SETUP completado ─────────────────────────────────────────────';

  -- ════════════════════════════════════════════════════════════════════════
  -- T1: Lineal en M → persiste en FT (CR-1)
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"CC000000-0000-0000-0001-000000000001","role":"authenticated"}', true);

  BEGIN
    v_result := public.reserve_order_inventory(ORD_LINEAR_M, ACTOR_PERM);

    SELECT quantity_reserved, base_unit
    INTO v_qty_reserved, v_base_unit
    FROM inventory_reservations
    WHERE order_id = ORD_LINEAR_M AND status = 'active'
    LIMIT 1;

    -- quantity_reserved debe ser ≈ 9.84252 FT (3 M * 3.28084)
    -- tolerancia: ±0.001
    IF  v_base_unit = 'FT'
    AND ABS(v_qty_reserved - EXPECTED_FT) < 0.001
    THEN
      RAISE NOTICE 'T1 PASS: lineal 3 M → reservado % FT (esperado ~%), base_unit=%',
        v_qty_reserved, EXPECTED_FT, v_base_unit;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'T1 FAIL: quantity_reserved=%, base_unit=%, esperado_ft=%',
        v_qty_reserved, v_base_unit, EXPECTED_FT;
      v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'T1 FAIL (EXCEPTION): %', SQLERRM; v_fail := v_fail + 1;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T4 (regresión CR-1): segunda orden sobre misma barra, qty > remanente → falla
  --   La barra tiene 19 FT, T1 reservó ~9.84 FT → remanente efectivo ~9.16 FT
  --   T4 pide 4 M = ~13.12 FT → no hay barra suficiente → INSUFFICIENT_STOCK
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"CC000000-0000-0000-0001-000000000001","role":"authenticated"}', true);

  BEGIN
    v_result := public.reserve_order_inventory(ORD_LINEAR_B, ACTOR_PERM);
    RAISE WARNING 'T4 FAIL: no lanzó excepción (4 M > remanente de barra de 19 FT con ~9.84 FT reservados)';
    v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSUFFICIENT_STOCK%' THEN
      RAISE NOTICE 'T4 PASS: INSUFFICIENT_STOCK correcto (sobre-reserva bloqueada por CR-1)';
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'T4 FAIL: excepción incorrecta → %', SQLERRM; v_fail := v_fail + 1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T2: Retazo bloqueado → UNSUPPORTED_SCRAP_RESERVATION_V1 (MED-1)
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"CC000000-0000-0000-0001-000000000001","role":"authenticated"}', true);

  BEGIN
    v_result := public.reserve_order_inventory(ORD_SCRAP, ACTOR_PERM);
    RAISE WARNING 'T2 FAIL: no lanzó excepción (SKU solo tiene scrap disponible)';
    v_fail := v_fail + 1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'UNSUPPORTED_SCRAP_RESERVATION_V1%' THEN
      RAISE NOTICE 'T2 PASS: UNSUPPORTED_SCRAP_RESERVATION_V1 correcto';
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'T2 FAIL: excepción incorrecta → %', SQLERRM; v_fail := v_fail + 1;
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- T3: Fungible split → required_quantity = v_take por fila (MED-2)
  --   req=6, ítems: 4 EA + 3 EA → split: 4 + 2 = 6
  --   Cada fila debe tener required_quantity = quantity_reserved (≠ 6 total)
  --   SUM(required_quantity) de las filas DEBE = SUM(quantity_reserved) = 6
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    '{"sub":"CC000000-0000-0000-0001-000000000001","role":"authenticated"}', true);

  BEGIN
    v_result := public.reserve_order_inventory(ORD_SPLIT, ACTOR_PERM);

    SELECT COUNT(*),
           SUM(quantity_reserved),
           SUM(required_quantity)
    INTO v_row_count, v_qty_reserved, v_sum_rq
    FROM inventory_reservations
    WHERE order_id = ORD_SPLIT AND status = 'active';

    -- Criterios:
    -- 1. 2 filas (split en 2 ítems)
    -- 2. SUM(quantity_reserved) = 6
    -- 3. SUM(required_quantity) = SUM(quantity_reserved) = 6 (no 6*2=12)
    IF  v_row_count = 2
    AND v_qty_reserved = 6
    AND v_sum_rq = 6  -- MED-2: cada fila tiene required_quantity = v_take
    THEN
      RAISE NOTICE 'T3 PASS: fungible split en % filas, SUM(qty_reserved)=%, SUM(required_qty)=% (no duplicado)',
        v_row_count, v_qty_reserved, v_sum_rq;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'T3 FAIL: filas=%, sum_qty_reserved=%, sum_required_qty=% (esperado 2, 6, 6)',
        v_row_count, v_qty_reserved, v_sum_rq;
      v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'T3 FAIL (EXCEPTION): %', SQLERRM; v_fail := v_fail + 1;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- RESULTADO FINAL
  -- ════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  RESULTADO 3C.3: % PASS / % FAIL  (total % tests)',
    v_pass, v_fail, v_pass + v_fail;
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'HAY % TESTS FALLANDO — revisar avisos anteriores', v_fail;
  END IF;

END $$;
