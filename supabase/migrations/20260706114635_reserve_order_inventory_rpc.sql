-- ============================================================
-- Bloque 3C.1: reserve_order_inventory RPC real
-- ============================================================
--
-- Contexto:
--   El stub anterior retornaba BOOLEAN. El nuevo retorna JSONB.
--   PostgreSQL no permite CREATE OR REPLACE cuando cambia el return type,
--   por lo que se requiere DROP previo.
--
-- Schema confirmado (Bloque 3C.0):
--   inventory_items.code          = SKU del ítem
--   inventory_items.payload JSONB = { available_yd2, width_meters, length_feet,
--                                     available_quantity, ... }
--   inventory_reservations.quantity_reserved CHECK >= 0  (validar > 0 en RPC)
--   inventory_reservations.material_line_id  TEXT NULL
--   Idempotency unique index: (order_id, inventory_item_id, COALESCE(material_line_id,'**unknown**'))
--     WHERE status='active'
--
-- Soporte V1:
--   fabric_roll  ✅  (telas desde finalFabricLines + materialLines YD2 con width)
--   linear_bar   ✅  (tubos/bottomrails desde finalMaterialLines FT/M)
--   fungible     ✅  (EA desde finalMaterialLines)
--   scrap        ❌  (no soportado en V1 → UNSUPPORTED_SCRAP_RESERVATION_V1)
-- ============================================================


-- ── 0. DROP del stub (cambia return type boolean → jsonb) ─────────────────────

DROP FUNCTION IF EXISTS public.reserve_order_inventory(uuid, uuid);


-- ── 1. Helper: _normalize_reservation_unit ────────────────────────────────────
--
-- Normaliza unidades de líneas BOM al conjunto canónico de la RPC.
-- Retorna 'UNKNOWN' si la unidad no es reconocida (la RPC la rechaza).

CREATE OR REPLACE FUNCTION public._normalize_reservation_unit(p_unit text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_u text;
BEGIN
  v_u := upper(trim(COALESCE(p_unit, '')));

  -- Telas / área
  IF v_u IN ('Y2', 'YD2', 'YDS2', 'YD²', 'SQYD', 'SQ_YD') THEN RETURN 'YD2'; END IF;

  -- Pies lineales
  IF v_u IN ('FT', 'LF', 'FEET', 'FOOT') THEN RETURN 'FT'; END IF;

  -- Metros lineales
  IF v_u IN ('M', 'LM', 'MTR', 'METER', 'METERS') THEN RETURN 'M'; END IF;

  -- Unidades / fungibles
  IF v_u IN ('EA', 'EACH', 'UNIT', 'UNITS', 'PCS', 'PIECE', 'PIECES', 'UN', 'PZ') THEN RETURN 'EA'; END IF;

  RETURN 'UNKNOWN';
END;
$$;

ALTER FUNCTION public._normalize_reservation_unit(text) OWNER TO postgres;

-- Acceso solo a service_role (función interna, no expuesta directamente)
REVOKE ALL ON FUNCTION public._normalize_reservation_unit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._normalize_reservation_unit(text) TO service_role;


-- ── 2. Helper: _infer_reservation_source ─────────────────────────────────────
--
-- Infiere el source de la reserva desde la unidad normalizada.

CREATE OR REPLACE FUNCTION public._infer_reservation_source(p_unit text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_unit
    WHEN 'YD2' THEN RETURN 'fabric_roll';
    WHEN 'FT'  THEN RETURN 'linear_bar';
    WHEN 'M'   THEN RETURN 'linear_bar';
    WHEN 'EA'  THEN RETURN 'fungible';
    ELSE             RETURN 'unknown';
  END CASE;
END;
$$;

ALTER FUNCTION public._infer_reservation_source(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public._infer_reservation_source(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._infer_reservation_source(text) TO service_role;


-- ── 3. Helper: _stable_material_line_id ──────────────────────────────────────
--
-- Genera un material_line_id determinístico para idempotencia.
-- Mismos inputs → mismo output siempre.
-- p_kind: 'mat' (materialLines) | 'fab' (fabricLines)

CREATE OR REPLACE FUNCTION public._stable_material_line_id(
  p_order_id uuid,
  p_kind     text,   -- 'mat' | 'fab'
  p_sku      text,
  p_unit     text,
  p_idx      int
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  -- Formato: {order_id}__{kind}__{idx}__{sku}__{unit}
  -- Truncar sku a 40 chars para evitar claves demasiado largas,
  -- pero mantener suficiente información para debuggear.
  RETURN p_order_id::text
      || '__' || p_kind
      || '__' || p_idx::text
      || '__' || left(replace(p_sku, ' ', '_'), 40)
      || '__' || p_unit;
END;
$$;

ALTER FUNCTION public._stable_material_line_id(uuid, text, text, text, int) OWNER TO postgres;

REVOKE ALL ON FUNCTION public._stable_material_line_id(uuid, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._stable_material_line_id(uuid, text, text, text, int) TO service_role;


-- ── 4. Helper: _extract_available_qty ────────────────────────────────────────
--
-- Lee la cantidad física disponible de inventory_items.payload según la unidad.
-- Retorna NULL si el campo no existe o no es numérico.

CREATE OR REPLACE FUNCTION public._extract_available_qty(
  p_payload jsonb,
  p_unit    text   -- unidad normalizada: 'YD2' | 'FT' | 'M' | 'EA'
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_unit
    WHEN 'YD2' THEN
      RETURN (p_payload->>'available_yd2')::numeric;
    WHEN 'FT' THEN
      RETURN (p_payload->>'length_feet')::numeric;
    WHEN 'M' THEN
      -- Convertir length_feet a metros
      RETURN (p_payload->>'length_feet')::numeric / 3.28084;
    WHEN 'EA' THEN
      RETURN COALESCE((p_payload->>'available_quantity')::numeric, 0);
    ELSE
      RETURN NULL;
  END CASE;
END;
$$;

ALTER FUNCTION public._extract_available_qty(jsonb, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public._extract_available_qty(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._extract_available_qty(jsonb, text) TO service_role;


-- ── 5. Función principal: reserve_order_inventory ────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_order_id uuid,
  p_user_id  uuid   -- mantenido para compatibilidad de firma; identidad real = auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Identidad y permisos
  v_actor_id          UUID;

  -- Estado de la orden
  v_order_status      TEXT;
  v_pr                JSONB;     -- payload->'productionReview'
  v_material_lines    JSONB;     -- finalMaterialLines array
  v_fabric_lines      JSONB;     -- finalFabricLines array

  -- Loop variables
  v_line              JSONB;
  v_sku               TEXT;
  v_qty               NUMERIC;
  v_raw_unit          TEXT;
  v_unit              TEXT;      -- normalizada
  v_source            TEXT;      -- 'fabric_roll'|'linear_bar'|'fungible'
  v_mat_line_id       TEXT;
  v_width             NUMERIC;   -- requerido para fabric_roll
  v_req_ft            NUMERIC;   -- para linear_bar en FT (conversión si unidad=M)

  -- Selección de ítem
  v_candidate         RECORD;
  v_item_id           UUID;
  v_active_sum        NUMERIC;
  v_avail             NUMERIC;
  v_reserved_qty      NUMERIC;
  v_remaining         NUMERIC;
  v_take              NUMERIC;

  -- Contadores
  v_reservations_count INT := 0;
  v_existing_count     INT;
  v_idx                INT;

  -- Para clasificar error cuando no hay rollo
  v_has_wrong_width    BOOLEAN;
BEGIN

  -- ── 1. Identidad: usar auth.uid(), nunca p_user_id ────────────────────────
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Usuario no autenticado (auth.uid() es NULL)';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: p_user_id no coincide con el usuario autenticado';
  END IF;

  -- ── 2. Verificar permiso inventory.reserve ───────────────────────────────
  IF NOT public.has_permission(v_actor_id, 'inventory.reserve') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere permiso inventory.reserve para el usuario %', v_actor_id;
  END IF;

  -- ── 3. Advisory lock por orden (serializar reservas de la misma orden) ───
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  -- ── 4. Idempotencia: si ya hay reservas active → éxito sin acción ────────
  SELECT COUNT(*) INTO v_existing_count
  FROM inventory_reservations
  WHERE order_id = p_order_id AND status = 'active';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'ok',                 true,
      'status',             'already_reserved',
      'order_id',           p_order_id,
      'reservations_count', v_existing_count
    );
  END IF;

  -- ── 5. Leer y validar la orden ────────────────────────────────────────────
  -- T17: usar columna work_orders.status (fuente canónica) — NO payload->>'status'.
  -- La columna es actualizada por process_order_inventory_tx y por el frontend.
  -- payload.status puede quedar desincronizado si la orden pasa por rutas legacy.
  SELECT wo.status, wo.payload->'productionReview'
  INTO v_order_status, v_pr
  FROM work_orders wo
  WHERE wo.id = p_order_id
    AND wo.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: La orden % no existe o fue eliminada', p_order_id;
  END IF;

  IF v_order_status <> 'ready_for_production' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: La orden % debe estar en ready_for_production (actual: %)',
      p_order_id, v_order_status;
  END IF;

  -- v_pr ya fue leído en el SELECT anterior (consolidado para evitar doble scan)

  v_material_lines := COALESCE(v_pr->'finalMaterialLines', '[]'::jsonb);
  v_fabric_lines   := COALESCE(v_pr->'finalFabricLines',   '[]'::jsonb);

  IF jsonb_array_length(v_material_lines) = 0 AND jsonb_array_length(v_fabric_lines) = 0 THEN
    RAISE EXCEPTION 'MISSING_MATERIAL_LINES: La orden % no tiene finalMaterialLines ni finalFabricLines en productionReview',
      p_order_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. Procesar finalMaterialLines (fungibles, lineales; telas si unit=YD2)
  -- ══════════════════════════════════════════════════════════════════════════

  v_idx := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_material_lines)
  LOOP
    v_sku     := trim(COALESCE(v_line->>'sku', ''));
    v_qty     := (v_line->>'quantity')::numeric;
    v_raw_unit := COALESCE(v_line->>'unit', '');
    v_unit    := public._normalize_reservation_unit(v_raw_unit);
    v_source  := public._infer_reservation_source(v_unit);

    -- Validaciones de línea
    IF v_sku = '' THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_LINE: Línea % (índice %) tiene sku vacío',
        v_sku, v_idx;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_LINE: Línea SKU=% tiene quantity inválida (%)',
        v_sku, v_qty;
    END IF;

    IF v_unit = 'UNKNOWN' THEN
      RAISE EXCEPTION 'UNSUPPORTED_UNIT: Unidad "%" no reconocida en línea SKU=%',
        v_raw_unit, v_sku;
    END IF;

    -- Generar material_line_id estable
    v_mat_line_id := public._stable_material_line_id(p_order_id, 'mat', v_sku, v_unit, v_idx);

    -- ── A. fabric_roll (materialLines con unit=YD2) ─────────────────────────
    IF v_source = 'fabric_roll' THEN

      -- Para telas desde materialLines, width_meters es obligatorio
      v_width := (v_line->>'width_meters')::numeric;
      IF v_width IS NULL OR v_width <= 0 THEN
        RAISE EXCEPTION 'MISSING_REQUIRED_WIDTH: Línea SKU=% requiere width_meters para reserva de tela (fabric_roll)',
          v_sku;
      END IF;

      v_item_id     := NULL;
      v_reserved_qty := NULL;

      FOR v_candidate IN
        SELECT id, payload
        FROM inventory_items
        WHERE category = 'fabric'
          AND kind     = 'roll'
          AND code     = v_sku
          AND status   = 'available'
          AND ABS(COALESCE((payload->>'width_meters')::numeric, -999) - v_width) <= 0.01
        ORDER BY id ASC
        FOR UPDATE
      LOOP
        SELECT COALESCE(SUM(quantity_reserved), 0)
        INTO v_active_sum
        FROM inventory_reservations
        WHERE inventory_item_id = v_candidate.id AND status = 'active';

        v_avail := COALESCE((v_candidate.payload->>'available_yd2')::numeric, 0) - v_active_sum;

        IF v_avail >= v_qty THEN
          v_item_id     := v_candidate.id;
          v_reserved_qty := v_qty;
          EXIT;
        END IF;
      END LOOP;

      IF v_item_id IS NULL THEN
        -- Distinguir WIDTH_MISMATCH de INSUFFICIENT_STOCK
        SELECT EXISTS (
          SELECT 1 FROM inventory_items
          WHERE category = 'fabric'
            AND kind     = 'roll'
            AND code     = v_sku
            AND status   = 'available'
            AND ABS(COALESCE((payload->>'width_meters')::numeric, -999) - v_width) > 0.01
        ) INTO v_has_wrong_width;

        IF v_has_wrong_width THEN
          -- mn-1: RAISE no usa printf; usar % simple o to_char para decimales
          RAISE EXCEPTION 'WIDTH_MISMATCH: No hay rollo de tela SKU=% con ancho % m (+/-0.01 m)',
            v_sku, v_width;
        ELSE
          RAISE EXCEPTION 'INSUFFICIENT_STOCK: No hay rollo de tela SKU=% con suficiente stock (necesario: % YD2)',
            v_sku, v_qty;
        END IF;
      END IF;

      INSERT INTO inventory_reservations (
        order_id, inventory_item_id, sku, material_line_id,
        required_quantity, quantity_reserved, base_unit, source, status,
        created_by, metadata
      ) VALUES (
        p_order_id, v_item_id, v_sku, v_mat_line_id,
        v_qty, v_reserved_qty, 'YD2', 'fabric_roll', 'active',
        v_actor_id,
        jsonb_build_object(
          'reservation_source',    'fabric_roll',
          'required_width_meters', v_width,
          'normalized_unit',       'YD2',
          'line_index',            v_idx,
          'line_kind',             'material'
        )
      );
      v_reservations_count := v_reservations_count + 1;

    -- ── B. linear_bar ────────────────────────────────────────────────────────
    --
    -- CR-1: almacenar siempre en FT (unidad física del campo length_feet).
    --   quantity_reserved = v_req_ft  (no v_qty en M).
    --   Así effective_avail = length_feet - SUM(quantity_reserved) es siempre en FT.
    --
    -- MED-1 (V1): excluir kind IN ('scrap','offcut') explícitamente.
    --   Si solo hay retazos disponibles para ese SKU → UNSUPPORTED_SCRAP_RESERVATION_V1.
    ELSIF v_source = 'linear_bar' THEN

      -- CR-1: convertir a FT. v_req_ft es la cantidad física a persistir.
      v_req_ft := CASE WHEN v_unit = 'M' THEN v_qty * 3.28084 ELSE v_qty END;

      v_item_id     := NULL;
      v_reserved_qty := NULL;

      FOR v_candidate IN
        SELECT id, payload
        FROM inventory_items
        WHERE category IN ('tube', 'bottom')
          AND kind   NOT IN ('scrap', 'offcut')  -- MED-1 V1: retazos no soportados
          AND code   = v_sku
          AND status = 'available'
        ORDER BY (payload->>'length_feet')::numeric ASC, id ASC
        FOR UPDATE
      LOOP
        SELECT COALESCE(SUM(quantity_reserved), 0)
        INTO v_active_sum
        FROM inventory_reservations
        WHERE inventory_item_id = v_candidate.id AND status = 'active';

        -- CR-1: disponibilidad en FT; quantity_reserved también en FT ahora
        v_avail := COALESCE((v_candidate.payload->>'length_feet')::numeric, 0) - v_active_sum;

        IF v_avail >= v_req_ft THEN
          v_item_id     := v_candidate.id;
          v_reserved_qty := v_req_ft;  -- CR-1: siempre en FT
          EXIT;
        END IF;
      END LOOP;

      IF v_item_id IS NULL THEN
        -- MED-1: ¿hay retazos/offcuts para este SKU que la lógica descartó?
        IF EXISTS (
          SELECT 1 FROM inventory_items
          WHERE category IN ('tube', 'bottom')
            AND kind IN ('scrap', 'offcut')
            AND code   = v_sku
            AND status = 'available'
        ) THEN
          RAISE EXCEPTION 'UNSUPPORTED_SCRAP_RESERVATION_V1: El SKU=% solo tiene retazos/offcuts disponibles; retazos no son reservables en V1',
            v_sku;
        ELSE
          RAISE EXCEPTION 'INSUFFICIENT_STOCK: No hay barra/tubo SKU=% con suficiente stock (necesario: % %, equivalente a % FT)',
            v_sku, v_qty, v_unit, v_req_ft;
        END IF;
      END IF;

      -- CR-1: persistir en FT (no en unidad original). La unidad original se guarda en metadata.
      INSERT INTO inventory_reservations (
        order_id, inventory_item_id, sku, material_line_id,
        required_quantity, quantity_reserved, base_unit, source, status,
        created_by, metadata
      ) VALUES (
        p_order_id, v_item_id, v_sku, v_mat_line_id,
        v_req_ft, v_req_ft, 'FT', 'linear_bar', 'active',
        v_actor_id,
        jsonb_build_object(
          'reservation_source',     'linear_bar',
          'original_quantity',      v_qty,
          'original_unit',          v_unit,
          'normalized_quantity_ft', v_req_ft,
          'line_index',             v_idx,
          'line_kind',              'material'
        )
      );
      v_reservations_count := v_reservations_count + 1;

    -- ── C. fungible (EA) ─────────────────────────────────────────────────────
    ELSIF v_source = 'fungible' THEN

      v_remaining := v_qty;

      FOR v_candidate IN
        SELECT id, payload
        FROM inventory_items
        WHERE category = 'component'
          AND code     = v_sku
          AND status   = 'available'
        ORDER BY id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;

        SELECT COALESCE(SUM(quantity_reserved), 0)
        INTO v_active_sum
        FROM inventory_reservations
        WHERE inventory_item_id = v_candidate.id AND status = 'active';

        v_avail := COALESCE((v_candidate.payload->>'available_quantity')::numeric, 0) - v_active_sum;

        IF v_avail > 0 THEN
          v_take := LEAST(v_remaining, v_avail);

          IF v_take > 0 THEN
            -- MED-2: required_quantity = v_take (porción asignada a este ítem).
            --   SUM(required_quantity) reflejará correctamente el requerimiento por ítem.
            --   line_required_quantity_total en metadata preserva el total de la línea.
            INSERT INTO inventory_reservations (
              order_id, inventory_item_id, sku, material_line_id,
              required_quantity, quantity_reserved, base_unit, source, status,
              created_by, metadata
            ) VALUES (
              p_order_id, v_candidate.id, v_sku, v_mat_line_id,
              v_take, v_take, 'EA', 'fungible', 'active',
              v_actor_id,
              jsonb_build_object(
                'reservation_source',           'fungible',
                'normalized_unit',              'EA',
                'line_required_quantity_total', v_qty,
                'split_part_quantity',          v_take,
                'line_index',                   v_idx,
                'line_kind',                    'material'
              )
            );
            v_reservations_count := v_reservations_count + 1;
            v_remaining := v_remaining - v_take;
          END IF;
        END IF;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stock fungible insuficiente para SKU=% (necesario: % EA, faltan: %)',
          v_sku, v_qty, v_remaining;
      END IF;

    ELSE
      -- source = 'unknown' → unidad no reconocida (ya debería haber fallado antes)
      RAISE EXCEPTION 'UNSUPPORTED_UNIT: Source no reconocido para unidad "%" en SKU=%',
        v_raw_unit, v_sku;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. Procesar finalFabricLines (telas con width_meters obligatorio)
  -- ══════════════════════════════════════════════════════════════════════════

  v_idx := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_fabric_lines)
  LOOP
    v_sku   := trim(COALESCE(v_line->>'sku', ''));
    v_qty   := (v_line->>'quantity')::numeric;
    v_width := (v_line->>'width_meters')::numeric;

    -- Validaciones
    IF v_sku = '' THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_LINE: Línea fabric (índice %) tiene sku vacío', v_idx;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_LINE: Línea fabric SKU=% tiene quantity inválida (%)', v_sku, v_qty;
    END IF;

    IF v_width IS NULL OR v_width <= 0 THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_WIDTH: Línea fabric SKU=% requiere width_meters > 0 (actual: %)',
        v_sku, v_width;
    END IF;

    -- Normalizar unidad: finalFabricLines puede traer 'Y2' o 'YD2'
    v_raw_unit := COALESCE(v_line->>'unit', 'Y2');
    v_unit     := public._normalize_reservation_unit(v_raw_unit);
    IF v_unit = 'UNKNOWN' THEN
      v_unit := 'YD2';  -- default seguro para fabric lines
    END IF;

    -- Generar material_line_id estable para fabric
    v_mat_line_id := public._stable_material_line_id(p_order_id, 'fab', v_sku, 'YD2', v_idx);

    -- Seleccionar rollo compatible
    v_item_id     := NULL;
    v_reserved_qty := NULL;

    FOR v_candidate IN
      SELECT id, payload
      FROM inventory_items
      WHERE category = 'fabric'
        AND kind     = 'roll'
        AND code     = v_sku
        AND status   = 'available'
        AND ABS(COALESCE((payload->>'width_meters')::numeric, -999) - v_width) <= 0.01
      ORDER BY id ASC
      FOR UPDATE
    LOOP
      SELECT COALESCE(SUM(quantity_reserved), 0)
      INTO v_active_sum
      FROM inventory_reservations
      WHERE inventory_item_id = v_candidate.id AND status = 'active';

      v_avail := COALESCE((v_candidate.payload->>'available_yd2')::numeric, 0) - v_active_sum;

      IF v_avail >= v_qty THEN
        v_item_id     := v_candidate.id;
        v_reserved_qty := v_qty;
        EXIT;
      END IF;
    END LOOP;

    IF v_item_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM inventory_items
        WHERE category = 'fabric'
          AND kind     = 'roll'
          AND code     = v_sku
          AND status   = 'available'
          AND ABS(COALESCE((payload->>'width_meters')::numeric, -999) - v_width) > 0.01
      ) INTO v_has_wrong_width;

      IF v_has_wrong_width THEN
        -- mn-1: RAISE no usa printf; % es sustitución posicional simple
        RAISE EXCEPTION 'WIDTH_MISMATCH: No hay rollo de tela SKU=% con ancho % m (+/-0.01 m) — hay rollos pero de ancho diferente',
          v_sku, v_width;
      ELSE
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: No hay rollo de tela SKU=% con suficiente stock (necesario: % YD2, ancho: % m)',
          v_sku, v_qty, v_width;
      END IF;
    END IF;

    INSERT INTO inventory_reservations (
      order_id, inventory_item_id, sku, material_line_id,
      required_quantity, quantity_reserved, base_unit, source, status,
      created_by, metadata
    ) VALUES (
      p_order_id, v_item_id, v_sku, v_mat_line_id,
      v_qty, v_reserved_qty, 'YD2', 'fabric_roll', 'active',
      v_actor_id,
      jsonb_build_object(
        'reservation_source',    'fabric_roll',
        'required_width_meters', v_width,
        'normalized_unit',       'YD2',
        'line_index',            v_idx,
        'line_kind',             'fabric'
      )
    );
    v_reservations_count := v_reservations_count + 1;

    v_idx := v_idx + 1;
  END LOOP;

  -- ── 9. Retorno de éxito ────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                 true,
    'status',             'reserved',
    'order_id',           p_order_id,
    'reservations_count', v_reservations_count
  );

END;
$$;

ALTER FUNCTION public.reserve_order_inventory(uuid, uuid) OWNER TO postgres;

-- ── 6. Grants de reserve_order_inventory ─────────────────────────────────────

-- anon: sin acceso (REVOKE explícito — el initial_schema le daba GRANT ALL)
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, uuid) FROM anon;

-- authenticated: puede invocar (sujeto a has_permission interno)
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, uuid) TO authenticated;

-- service_role: acceso completo (Edge Functions, jobs admin)
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, uuid) TO service_role;
