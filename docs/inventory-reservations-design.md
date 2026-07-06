# LUXIA — Diseño Técnico de Reservas Transaccionales de Inventario

> **Versión:** 2.1 — Bloque 3A.2 (correcciones finales pre-commit)  
> **Estado:** APROBADO PARA COMMIT.  
> **Commit de referencia:** `17177a1`  
> **Fecha:** 2026-07-06  
> **Cambios v2.0:** CR-1..4, MED-1..2, advisory lock, process_order_inventory_tx legacy.  
> **Cambios v2.1:** MED-A seed SQL schema real, MED-B fusión finalFabricLines, MED-C guard doble descuento, mn-1 release best-effort failures.

---

## A. Resumen Ejecutivo

El sistema LUXIA tiene un modelo de datos de `inventory_reservations` ya desplegado en producción (incluido en `initial_schema`), con tres funciones RPC stub (`reserve_order_inventory`, `release_order_inventory`, `process_order_inventory_tx`) que actualmente lanzan `RAISE EXCEPTION 'Not implemented yet'` o consumen inventario ignorando reservas.

Este documento v2.0 corrige el diseño de implementación completa de esas RPCs y la capa TypeScript que las invoca, garantizando:
- Atomicidad completa: reservar → producir → consumir sin leaks de stock
- Idempotencia: reintentos seguros sin duplicados
- Seguridad: `auth.uid()` — no confiar en `p_user_id` recibido
- Concurrencia: `SELECT ... FOR UPDATE` previene reservas dobles
- Disponibilidad real: leída desde `inventory_items.payload`, no desde BOM

---

## B. Modelo de Datos Actual

### Tabla `inventory_reservations`

```sql
CREATE TABLE public.inventory_reservations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  sku               TEXT NOT NULL CHECK (length(trim(sku)) > 0),
  material_line_id  TEXT NULL,           -- ID de línea BOM (idempotencia — ver §D.0)
  required_quantity NUMERIC NOT NULL CHECK (required_quantity > 0),
  quantity_reserved NUMERIC NOT NULL CHECK (quantity_reserved > 0
                                            AND quantity_reserved <= required_quantity),
  base_unit         TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
  source            TEXT NULL,           -- 'fabric_roll' | 'linear_bar' | 'scrap' | 'fungible'
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'released', 'consumed')),
  metadata          JSONB NOT NULL DEFAULT '{}',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by        UUID NULL REFERENCES auth.users(id),

  released_at       TIMESTAMPTZ NULL,
  released_by       UUID NULL REFERENCES auth.users(id),
  release_reason    TEXT NULL,

  consumed_at       TIMESTAMPTZ NULL,
  consumed_by       UUID NULL REFERENCES auth.users(id)
);
```

### Constraints de Estado

| Constraint | Regla |
|---|---|
| `chk_active_data` | Si `status='active'` → `released_at IS NULL AND consumed_at IS NULL` |
| `chk_released_data` | Si `status='released'` → `released_at IS NOT NULL` |
| `chk_consumed_data` | Si `status='consumed'` → `consumed_at IS NOT NULL` |

### Índices

| Índice | Tipo | Propósito |
|---|---|---|
| `idx_inventory_reservations_idempotency` | UNIQUE parcial `WHERE status='active'` en `(order_id, inventory_item_id, COALESCE(material_line_id,'**unknown**'))` | Evitar reservas duplicadas activas |
| `idx_inventory_reservations_order_id` | B-tree | Lookup por orden |
| `idx_inventory_reservations_inventory_item_id` | B-tree | Lookup por ítem |
| `idx_inventory_reservations_status` | B-tree | Filtro por estado |
| `idx_inventory_reservations_sku` | B-tree | Búsqueda por SKU |
| `idx_inventory_reservations_status_order` | B-tree compuesto | Listado por orden+estado |
| `idx_inventory_reservations_status_item` | B-tree compuesto | SUM reservas activas por ítem |
| `idx_inventory_reservations_active_items` | B-tree parcial `WHERE status='active'` en `inventory_item_id` | Cálculo rápido de disponibilidad efectiva |

### Policies RLS

| Policy | Acción | Regla |
|---|---|---|
| `reservations_select_rbac` | SELECT | `has_permission(uid, 'inventory.view') OR has_permission(uid, 'orders.view')` |
| `reservations_insert_rbac` | INSERT | `WITH CHECK (false)` — **BLOQUEADO** |
| `reservations_update_rbac` | UPDATE | `USING (false)` — **BLOQUEADO** |
| `reservations_delete_rbac` | DELETE | `USING (false)` — **BLOQUEADO** |

### RPCs existentes

| Función | Firma | Estado |
|---|---|---|
| `reserve_order_inventory` | `(p_order_id uuid, p_user_id uuid) → boolean` | **Stub** — `RAISE EXCEPTION 'Not implemented'` |
| `release_order_inventory` | `(p_order_id uuid, p_user_id uuid, p_reason text) → boolean` | **Stub** — `RAISE EXCEPTION 'Not implemented'` |
| `process_order_inventory_tx` | `(p_order_payload jsonb, p_consumption_plan jsonb)` | **PRODUCTIVO LEGACY** — consume `inventory_items` ignorando reservas |

> ⚠️ **`process_order_inventory_tx` es legacy.** Consume directamente `inventory_items` sin consultar `inventory_reservations`. A partir de 3B, las órdenes con reservas activas deben usar `consume_order_inventory_reservations`. `process_order_inventory_tx` queda desactivado para esas órdenes hasta que sea envuelto o sustituido (ver §D.4 y §J).

---

## C. Brechas del Modelo Actual

| ID | Brecha | Impacto |
|---|---|---|
| **B-1** | `reserve_order_inventory` es stub. Nunca reserva nada. | **CRÍTICO** |
| **B-2** | `process_order_inventory_tx` no valida reservas activas antes de consumir | **CRÍTICO** — race condition en producción concurrente |
| **B-3** | No existe función `consume_order_inventory_reservations` | **ALTO** — ciclo reserva→consumo no está cerrado |
| **B-4** | `inventory_reservations` no tiene FK a `inventory_movements` | **MEDIO** — sin trazabilidad reserva→movimiento |
| **B-5** | `validateOrderInventoryAvailability` no descuenta reservas `active` de otros pedidos | **CRÍTICO** — sobreestima disponibilidad |
| **B-6** | `process_order_inventory_tx` usa barras virtuales de 19 FT | **ALTO** — `inventory_reservations` exige `inventory_item_id` FK; reserva sobre virtual es imposible |
| **B-7** | `material_line_id` puede ser NULL → COALESCE a `'**unknown**'` colapsa líneas distintas | **MEDIO** |
| **B-8** | `quantity_reserved <= required_quantity` pero sin `effective_quantity_consumed` | **MENOR** — diferencias de corte no registradas |

---

## D. Diseño RPC Propuesto (Corregido v2.0)

### D.0 — Prerequisito: `material_line_id` determinístico

> **CR corregido:** No permitir `material_line_id = NULL` en reservas.

Antes de invocar `reserve_order_inventory`, cada línea del BOM **debe** tener un `material_line_id` estable. Si la línea no lo trae nativamente, la capa TypeScript lo genera así:

```typescript
// src/lib/supabaseReservations.ts (Bloque 3E)
function stableMaterialLineId(
  orderId: string,
  idx: number,
  sku: string,
  unit: string,
  requiredQty: number
): string {
  // Determinístico: mismo input → mismo ID siempre
  return `${orderId}__${idx}__${sku}__${unit}__${requiredQty}`;
}
```

La RPC SQL **rechaza** líneas sin `material_line_id`:

```sql
IF v_line->>'material_line_id' IS NULL OR trim(v_line->>'material_line_id') = '' THEN
  RAISE EXCEPTION 'MISSING_MATERIAL_LINE_ID: línea % no tiene material_line_id', v_line->>'sku';
END IF;
```

Esto previene que dos líneas distintas sin ID colapsen al mismo slot del índice único.

---

### D.1 — `reserve_order_inventory(p_order_id, p_user_id)`

#### CR-1 Corregido: Fuente de Líneas de Materiales

Las líneas BOM se leen desde `work_orders.payload`, **no** desde una columna `production_review` que no existe en el schema real:

```sql
-- INCORRECTO (v1.0):
-- wo.production_review->'finalMaterialLines'

-- CORRECTO (v2.0):
SELECT payload->'productionReview'->'finalMaterialLines'
INTO v_material_lines
FROM work_orders
WHERE id = p_order_id;
```

Si `finalMaterialLines` no existe en el payload, se intenta `finalFabricLines` como complemento. Si ambos son nulos o vacíos, la función falla con `MISSING_MATERIAL_LINES`.

#### CR-4 Corregido: Seguridad de Identidad

No se confía en `p_user_id` recibido del cliente. El actor real se deriva de `auth.uid()`:

```sql
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_order_id UUID,
  p_user_id  UUID  -- mantenido para compatibilidad de firma con versión anterior
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id       UUID;
  v_order_status   TEXT;
  v_material_lines JSONB;
  v_line           JSONB;
  v_line_id        TEXT;
  v_item_id        UUID;
  v_active_sum     NUMERIC;
  v_available_net  NUMERIC;
  v_avail_qty      NUMERIC;
  v_item_payload   JSONB;
BEGIN

  -- ── 1. Identidad: usar auth.uid(), nunca confiar en p_user_id externo ──────
  v_actor_id := auth.uid();

  -- Si se recibe p_user_id y no coincide con auth.uid(), denegar
  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: p_user_id no coincide con el usuario autenticado';
  END IF;

  -- ── 2. Verificar permiso inventory.reserve ─────────────────────────────────
  IF NOT public.has_permission(v_actor_id, 'inventory.reserve') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere permiso inventory.reserve';
  END IF;

  -- ── 3. Advisory lock por order_id (serializar operaciones de la misma orden) ─
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  -- ── 4. Idempotencia: ya tiene reservas active → éxito sin acción ──────────
  IF EXISTS (
    SELECT 1 FROM inventory_reservations
    WHERE order_id = p_order_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('status', 'already_reserved', 'order_id', p_order_id);
  END IF;

  -- ── 5. Validar estado de la orden ─────────────────────────────────────────
  SELECT payload->>'status'
  INTO v_order_status
  FROM work_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_order_id;
  END IF;

  IF v_order_status != 'ready_for_production' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: La orden debe estar en ready_for_production, actual: %', v_order_status;
  END IF;

  -- ── 6. CR-1 + MED-B: Fusionar finalMaterialLines + finalFabricLines ─────────
  --
  -- Las telas se almacenan en finalFabricLines (con width_meters, YD2, etc.).
  -- Los materiales fungibles y lineales van en finalMaterialLines.
  -- Ambas fuentes se fusionan en v_material_lines antes del loop.
  -- Fuente: work_orders.payload->'productionReview', NO columna production_review.
  DECLARE
    v_fabric_lines JSONB;
    v_fabric_line  JSONB;
    v_idx          INT := 0;
  BEGIN
    SELECT
      payload->'productionReview'->'finalMaterialLines',
      payload->'productionReview'->'finalFabricLines'
    INTO v_material_lines, v_fabric_lines
    FROM work_orders
    WHERE id = p_order_id;

    -- Normalizar NULLs a arrays vacíos
    v_material_lines := COALESCE(v_material_lines, '[]'::jsonb);
    v_fabric_lines   := COALESCE(v_fabric_lines,   '[]'::jsonb);

    -- Mapear finalFabricLines → líneas reservables (source='fabric_roll')
    -- y concatenarlas a v_material_lines
    FOR v_fabric_line IN SELECT * FROM jsonb_array_elements(v_fabric_lines)
    LOOP
      -- Cada fabric line se convierte en una línea estándar para el loop de reserva:
      -- sku, required_quantity (YD2), base_unit='YD2', source='fabric_roll',
      -- requiredWidthMeters desde width_meters, material_line_id determinístico.
      v_material_lines := v_material_lines || jsonb_build_array(
        jsonb_build_object(
          'sku',                 v_fabric_line->>'sku',
          'description',         v_fabric_line->>'description',
          'required_quantity',   v_fabric_line->>'quantity',
          'base_unit',           'YD2',
          'source',              'fabric_roll',
          'requiredWidthMeters', v_fabric_line->>'width_meters',
          'material_line_id',    COALESCE(
                                   v_fabric_line->>'material_line_id',
                                   -- Generado si ausente: estable por índice
                                   p_order_id::text || '__fabric__' || v_idx::text
                                 )
        )
      );
      v_idx := v_idx + 1;
    END LOOP;
  END;

  IF jsonb_array_length(v_material_lines) = 0 THEN
    RAISE EXCEPTION 'MISSING_MATERIAL_LINES: La orden % no tiene finalMaterialLines ni finalFabricLines en el payload', p_order_id;
  END IF;

  -- ── 7. Por cada línea de material (incluye telas mapeadas desde fabricLines) ──
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_material_lines)
  LOOP
    -- Validar material_line_id obligatorio
    v_line_id := v_line->>'material_line_id';
    IF v_line_id IS NULL OR trim(v_line_id) = '' THEN
      RAISE EXCEPTION 'MISSING_MATERIAL_LINE_ID: línea SKU=% sin material_line_id', v_line->>'sku';
    END IF;

    -- Delegar selección de ítem + reserva al helper por tipo
    PERFORM _reserve_single_line(p_order_id, v_actor_id, v_line);

  END LOOP;

  RETURN jsonb_build_object('status', 'reserved', 'order_id', p_order_id);
END;
$$;
```

---

### D.2 — Helper: `_reserve_single_line(order_id, actor_id, line)`

#### CR-2 Corregido: Disponibilidad desde `inventory_items.payload`

La disponibilidad real **nunca** se toma de las líneas BOM. Se lee desde `inventory_items.payload`:

```sql
-- CR-2: Leer disponibilidad real del ítem físico
SELECT id, payload
INTO v_item_id, v_item_payload
FROM inventory_items
WHERE id = v_specific_item_id  -- o según algoritmo de selección §D.3
  AND status = 'available'
FOR UPDATE;  -- bloqueo a nivel fila

-- Luego calcular stock efectivo según tipo:
-- tela:     available_yd2 o (width_meters * length_meters * 1.19599)
-- lineal:   length_feet o (length_meters * 3.28084)
-- fungible: available_quantity
```

#### CR-3 Corregido: Algoritmo de Selección por Tipo

##### A. Tela / Rollo (unit = `YD2`)

```sql
-- 1. Si hay specificInventoryItemId en la línea → usar ese ítem directamente
-- 2. Si no, buscar y bloquear candidatos:
SELECT id, payload
FROM inventory_items
WHERE code = v_sku
  AND status = 'available'
  AND (payload->>'available_yd2')::numeric IS NOT NULL
  AND ABS((payload->>'width_meters')::numeric - v_required_width) <= 0.01  -- ±1 cm
ORDER BY id ASC  -- orden determinístico para evitar deadlocks
FOR UPDATE;      -- bloquear todas las candidatas

-- 3. Para cada candidata, calcular disponibilidad efectiva:
SELECT COALESCE(SUM(quantity_reserved), 0)
INTO v_active_sum
FROM inventory_reservations
WHERE inventory_item_id = v_candidate_id AND status = 'active';

v_available_yd2 := (v_item_payload->>'available_yd2')::numeric - v_active_sum;

-- 4. Elegir la primera candidata con available_yd2 efectivo >= requerido
-- (primera en ORDER BY id ASC → determinístico entre transacciones)

-- 5. Si ninguna califica → RAISE EXCEPTION 'INSUFFICIENT_STOCK'
```

##### B. Lineales / Barras (unit = `FT` o `M`)

```sql
-- Regla: UNA SOLA pieza física debe cubrir el corte
-- NO sumar múltiples piezas

-- 1. Si hay specificInventoryItemId → usar ese ítem (y validar largo)
-- 2. Si no, buscar pieza única con largo suficiente:
SELECT id, payload
FROM inventory_items
WHERE code = v_sku
  AND status = 'available'
  AND (payload->>'length_feet')::numeric >= v_required_ft
ORDER BY (payload->>'length_feet')::numeric ASC, id ASC  -- Best-fit, determinístico
FOR UPDATE SKIP LOCKED;  -- No esperar a ítems bloqueados por otra TX

-- 3. Calcular disponibilidad efectiva:
v_active_sum := SUM(quantity_reserved WHERE inventory_item_id=v_item AND status='active');
v_available_ft := (payload->>'length_feet')::numeric - v_active_sum;

-- 4. Si available_ft < required → RAISE EXCEPTION 'INSUFFICIENT_STOCK'

-- Nota: barras virtuales (sin inventory_item real) están EXCLUIDAS de reservas V1.
-- Si no existe ítem físico → falla controlada. Ver §D.6.
```

##### C. Retazos (`scrap`, unit = `YD2` o `FT`)

```sql
-- Un retazo se reserva por inventory_item_id específico (nunca por SKU genérico)
-- La línea BOM DEBE tener specificInventoryItemId

IF v_specific_item_id IS NULL THEN
  RAISE EXCEPTION 'RETAZO_SIN_ITEM_ID: Los retazos requieren specificInventoryItemId';
END IF;

SELECT id, payload
INTO v_item_id, v_item_payload
FROM inventory_items
WHERE id = v_specific_item_id
  AND status = 'available'
FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'ITEM_NOT_AVAILABLE: Retazo % no disponible', v_specific_item_id;
END IF;

-- Disponibilidad efectiva (no fraccionable: reservar la pieza entera)
-- Un retazo no puede ser reservado parcialmente por dos órdenes al mismo tiempo.
-- El índice de idempotencia garantiza que solo hay una reserva active por retazo.
v_available := calcular_disponibilidad_retazo(v_item_payload);  -- área o longitud
IF v_available < v_required THEN
  RAISE EXCEPTION 'INSUFFICIENT_SCRAP: % disponible %', v_sku, v_available;
END IF;
```

##### D. Fungibles EA (unit = `EA`, `UN`, `PZ`)

```sql
-- Permitir sumar disponibilidad de múltiples ítems del mismo SKU
-- Pero reservar contra ítems concretos (no sku-only)

DECLARE
  v_remaining NUMERIC := v_required_qty;
  v_candidate RECORD;
BEGIN
  -- Bloquear candidatos en orden determinístico (ORDER BY id ASC)
  FOR v_candidate IN
    SELECT id, (payload->>'available_quantity')::numeric AS avail
    FROM inventory_items
    WHERE code = v_sku AND status = 'available'
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    -- Descontar reservas activas de este ítem
    SELECT COALESCE(SUM(quantity_reserved), 0) INTO v_active_sum
    FROM inventory_reservations
    WHERE inventory_item_id = v_candidate.id AND status = 'active';

    v_item_available := v_candidate.avail - v_active_sum;
    IF v_item_available <= 0 THEN CONTINUE; END IF;

    v_to_reserve := LEAST(v_remaining, v_item_available);

    -- Reservar la fracción de este ítem
    INSERT INTO inventory_reservations ( ... ) VALUES ( ... , v_to_reserve, ...);
    v_remaining := v_remaining - v_to_reserve;

    IF v_remaining <= 0 THEN EXIT; END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNGIBLE: SKU % faltan %', v_sku, v_remaining;
  END IF;
END;
```

---

### D.3 — `release_order_inventory(p_order_id, p_user_id, p_reason)`

```sql
CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_order_id UUID,
  p_user_id  UUID,
  p_reason   TEXT
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  -- CR-4: Derivar identidad real
  v_actor_id := auth.uid();
  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: user_id mismatch';
  END IF;

  IF NOT public.has_permission(v_actor_id, 'inventory.reserve') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere inventory.reserve para liberar reservas';
  END IF;

  -- Advisory lock: serializar con reserve y consume de la misma orden
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  -- Liberar reservas active (idempotente: si ya released, UPDATE afecta 0 filas)
  UPDATE inventory_reservations
  SET status         = 'released',
      released_at    = timezone('utc', now()),
      released_by    = v_actor_id,
      release_reason = p_reason
  WHERE order_id = p_order_id
    AND status   = 'active';

  RETURN true;
END;
$$;
```

---

### D.4 — `consume_order_inventory_reservations(p_order_id, p_user_id)`

**Propósito:** Consumir las reservas `active` de una orden al completarse producción.  
**Relación con `process_order_inventory_tx`:** Esta función es la ruta V1 de consumo controlado. `process_order_inventory_tx` **NO debe ejecutarse** para órdenes que tienen reservas activas (haría doble descuento). Ver §D.5.

```sql
CREATE OR REPLACE FUNCTION public.consume_order_inventory_reservations(
  p_order_id UUID,
  p_user_id  UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id UUID;
  v_res      RECORD;
  v_consumed INT := 0;
BEGIN
  -- CR-4: Identidad real
  v_actor_id := auth.uid();
  IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: user_id mismatch';
  END IF;

  IF NOT public.has_permission(v_actor_id, 'inventory.consume') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere inventory.consume';
  END IF;

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  -- Idempotencia: si ya consumed, retornar éxito
  IF NOT EXISTS (
    SELECT 1 FROM inventory_reservations
    WHERE order_id = p_order_id AND status = 'active'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM inventory_reservations
      WHERE order_id = p_order_id AND status = 'consumed'
    ) THEN
      RETURN jsonb_build_object('status', 'already_consumed', 'order_id', p_order_id);
    ELSE
      RAISE EXCEPTION 'NO_ACTIVE_RESERVATIONS: La orden % no tiene reservas activas para consumir', p_order_id;
    END IF;
  END IF;

  -- Consumir cada reserva active
  FOR v_res IN
    SELECT * FROM inventory_reservations
    WHERE order_id = p_order_id AND status = 'active'
    FOR UPDATE  -- bloqueo para prevenir release simultáneo
  LOOP
    UPDATE inventory_reservations
    SET status      = 'consumed',
        consumed_at = timezone('utc', now()),
        consumed_by = v_actor_id
    WHERE id = v_res.id;

    -- Registrar movimiento en inventory_movements
    INSERT INTO inventory_movements (
      inventory_item_id, order_id, category, action,
      item_code, quantity, unit, notes, created_by
    ) VALUES (
      v_res.inventory_item_id,
      p_order_id,
      (SELECT category FROM inventory_items WHERE id = v_res.inventory_item_id),
      'consume',
      v_res.sku,
      v_res.quantity_reserved,
      v_res.base_unit,
      'Consumo vía reserva ' || v_res.id::text,
      v_actor_id
    );

    v_consumed := v_consumed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'consumed',
    'order_id', p_order_id,
    'reservations_consumed', v_consumed
  );
END;
$$;
```

---

### D.5 — Relación con `process_order_inventory_tx` (Legacy)

> **Decisión explícita V1:**

| Escenario | Función a usar |
|---|---|
| Orden **sin** reservas activas (legacy, producción anterior a 3B) | `process_order_inventory_tx` (sin cambios) |
| Orden **con** reservas activas (producción nueva, post-3B) | `consume_order_inventory_reservations` |
| Ambas en la misma orden | **PROHIBIDO** — doble descuento |

La capa TypeScript (`src/lib/supabaseReservations.ts`) detectará si la orden tiene reservas activas antes de completarla:

```typescript
// Pseudocódigo Bloque 3E
async function completeOrder(orderId: string) {
  const hasActiveReservations = await checkActiveReservations(orderId);
  if (hasActiveReservations) {
    await supabase.rpc('consume_order_inventory_reservations', { p_order_id: orderId, p_user_id: userId });
  } else {
    // legacy path — no llamar a process_order_inventory_tx si tiene reservas
    await supabase.rpc('process_order_inventory_tx', { ... });
  }
}
```

`process_order_inventory_tx` queda **congelado** — no se modifica en Bloque 3B-3E. Su sustitución completa queda en Bloque 3G o posterior.

> ⚠️ **MED-C — Límite de garantía del doble descuento en V1:**
>
> En V1 (Bloques 3B–3F), la prevención del doble descuento depende **únicamente de la capa TypeScript/workflow**. La función `process_order_inventory_tx` a nivel SQL **no tiene un guard** que le impida ejecutarse si ya existen reservas `active` o `consumed` para la orden. Esto significa que:
> - Si la capa TypeScript falla o es bypasseada, `process_order_inventory_tx` puede consumir inventario que ya fue reservado → **doble descuento**.
> - Esta situación no está cubierta por la BD en V1.
>
> **Mitigación obligatoria en Bloque 3G:** Antes de producción final, `process_order_inventory_tx` (o una versión envolvente) debe incluir un guard SQL:
> ```sql
> -- Guard a agregar en Bloque 3G:
> IF EXISTS (
>   SELECT 1 FROM inventory_reservations
>   WHERE order_id = p_order_id
>     AND status IN ('active', 'consumed')
> ) THEN
>   RAISE EXCEPTION 'RESERVATION_CONFLICT: La orden % tiene reservas activas/consumidas. Usar consume_order_inventory_reservations.', p_order_id;
> END IF;
> ```
> Hasta que este guard esté implementado, el doble descuento es posible si se bypasea la capa TypeScript.

---

### D.6 — Barras Virtuales 19 FT (Exclusión V1)

> **MED-2 Resuelto:** La tabla `inventory_reservations` exige `inventory_item_id NOT NULL` con FK a `inventory_items`. Por lo tanto **es imposible** reservar una barra virtual inexistente.

**Decisión V1:**

- Si una línea BOM requiere un lineal y no existe ningún `inventory_item` físico con ese SKU y largo suficiente → la reserva **falla controladamente** con `INSUFFICIENT_STOCK`.
- El usuario debe dar de alta la barra física en inventario antes de reservar.
- La lógica de "cortar de barra nueva de 19 FT" que existe en `process_order_inventory_tx` **no aplica** en el flujo de reservas.
- Materializar barras virtuales automáticamente queda fuera de V1 y se documentará como deuda técnica en Bloque 3G.

---

## E. Flujo de Estados

```
ORDEN:
  draft ──→ ready_for_production ──────────────────────────→ in_production ──→ completed
                │                                                  │                │
                │           ←──────── [CANCELAR] ─────────────────┘                │
                ↓                         ↓                                         ↓
         (sin reservas)            release_order             consume_order_inventory
                                   _inventory()              _reservations()
                                        │                         │
                                        ↓                         ↓
RESERVAS:      active ────────→ released               active ────→ consumed
               (reserva OK)    (cancelado)             (producción)  (completado)
```

### Puntos de Integración con `orderWorkflow.ts`

| Evento de workflow | RPC a llamar | Momento | Si falla |
|---|---|---|---|
| `ready_for_production → in_production` | `reserve_order_inventory` | **ANTES** de cambiar estado | Estado no cambia |
| `cualquier estado → cancelled` | `release_order_inventory` | **DESPUÉS** de cambiar estado (best-effort) | Log, no bloquea UI |
| `in_production → completed` | `consume_order_inventory_reservations` | **ANTES** de marcar completed | Estado no cambia |

> ⚠️ **mn-1 — Release best-effort: riesgo de reservas huérfanas:**
>
> El release al cancelar se ejecuta **después** de cambiar el estado de la orden para no bloquear la UI. Esto implica:
>
> - Si `release_order_inventory` falla (red, timeout, permiso expirado), la orden quedará en estado `cancelled` **pero con reservas `active` huérfanas** en `inventory_reservations`.
> - Las reservas huérfanas comprometen stock de `inventory_items` que en realidad debería estar disponible para otras órdenes.
>
> **Mitigaciones obligatorias antes de producción:**
> 1. **Reintento automático:** La capa TypeScript (`src/lib/supabaseReservations.ts`) debe reintentar el release al menos 3 veces con backoff exponencial antes de loguear fallo definitivo.
> 2. **Advertencia en UI:** Si el release falla después de reintentos, la UI debe mostrar un aviso visible al usuario: _"No se pudo liberar el inventario reservado. Notifique a administración."_
> 3. **Job de reconciliación (Bloque 3G):** Implementar un job o Edge Function que detecte y libere reservas `active` cuya orden esté en estado `cancelled` o `completed` con más de N minutos de antigüedad.
> 4. **Release es idempotente:** La función `release_order_inventory` es segura de re-ejecutar: `UPDATE WHERE status='active'` afecta 0 filas si ya se liberó, sin error.

---

## F. Reglas por Tipo de Material

### F.1 — Tela / Rollo (`fabric_roll`, unit = `YD2`)

- `inventory_item_id` **OBLIGATORIO** (o seleccionado automáticamente por algoritmo §D.2.A)
- Disponibilidad: `(payload->>'available_yd2')::numeric - SUM(quantity_reserved WHERE status='active' AND item_id=X)`
- Validar `(payload->>'width_meters')::numeric` compatible con `requiredWidthMeters` del BOM (±0.01 m)
- Bloquear candidatos con `SELECT ... FOR UPDATE ORDER BY id ASC`
- Una reserva = un ítem físico (no mezclar rollos)

### F.2 — Retazo (`scrap`, unit = `YD2` o `FT`)

- `inventory_item_id` **OBLIGATORIO** — nunca SKU-only
- Línea BOM debe tener `specificInventoryItemId`
- Validar área (`width_meters × length_meters × 1.19599` en YD2) o longitud según unidad
- Reservar pieza completa (no fraccionable)
- Consumo marcará `inventory_items.status = 'used'`

### F.3 — Lineales / Barras (`linear_bar`, unit = `FT` o `M`)

- `inventory_item_id` **OBLIGATORIO** (ítem físico real — no virtual)
- Una sola pieza física debe cubrir el corte (no sumar barras)
- Disponibilidad: `(payload->>'length_feet')::numeric - SUM(quantity_reserved WHERE status='active' AND item_id=X)`
- Selección: Best-fit ascendente (`ORDER BY length_feet ASC`) para minimizar desperdicio
- Si no hay ítem físico disponible → falla controlada (sin barras virtuales en V1)

### F.4 — Fungibles EA (`fungible_ea`, unit = `EA`, `UN`, `PZ`)

- `inventory_item_id` asignado por ítem concreto en el INSERT de reserva (no sku-only en la reserva)
- Disponibilidad: `(payload->>'available_quantity')::numeric - SUM(quantity_reserved WHERE status='active' AND item_id=X)`
- Puede repartir entre múltiples ítems del mismo SKU (algoritmo §D.2.D)
- El consumo descuenta del ítem concreto asignado en la reserva

---

## G. Concurrencia

### G.1 — Dos Niveles de Bloqueo

| Nivel | Mecanismo | Protege |
|---|---|---|
| **Nivel 1: por orden** | `pg_advisory_xact_lock(hashtext(order_id::text))` | Operaciones de la misma orden no se solapan (reserve + release + consume serializadas) |
| **Nivel 2: por ítem** | `SELECT ... FOR UPDATE` sobre `inventory_items` | Dos órdenes distintas no reservan el mismo ítem en paralelo |

### G.2 — Mecanismos por Problema

| Problema | Mecanismo |
|---|---|
| Dos órdenes reservan el mismo rollo | `FOR UPDATE` en ítem + `SUM` dentro de TX |
| Dos órdenes consumen la misma reserva | `UPDATE WHERE status='active' FOR UPDATE` |
| Reintento duplicado de reserva | Advisory lock + índice único parcial + `ON CONFLICT DO NOTHING` |
| Cancelación mientras producción consume | Advisory lock serializa ambas en la misma orden |
| Deadlock entre TX que bloquean múltiples ítems | `ORDER BY id ASC` → orden determinístico |
| Fungible EA fragmentado entre ítems | `FOR UPDATE` de todos los candidatos al inicio, en orden |

### G.3 — Orden de Bloqueo (prevenir deadlocks)

```sql
-- SIEMPRE bloquear ítems en orden ascendente de UUID:
SELECT id, payload
FROM inventory_items
WHERE id = ANY(ARRAY[...item_ids...]) AND status = 'available'
ORDER BY id ASC   -- ← CRÍTICO: determinístico
FOR UPDATE;
```

---

## H. RLS / Permisos

### H.1 — División de Responsabilidades

| Actor | Permitido | Bloqueado |
|---|---|---|
| **Frontend (authenticated)** | `SELECT` con `has_permission` | INSERT / UPDATE / DELETE directo |
| **RPC SECURITY DEFINER** | Todo dentro de TX | N/A |
| **service_role** (Edge Functions) | Todo | Solo por Edge Functions controladas |
| **anon** | Nada | Revocado explícitamente (ver §H.3) |

### H.2 — Policies RLS (sin cambios — ya correctas)

- `INSERT WITH CHECK (false)` ✅
- `UPDATE USING (false)` ✅  
- `DELETE USING (false)` ✅
- `SELECT` con `has_permission` ✅

### H.3 — GRANT/REVOKE de RPCs (nuevo en Bloque 3B)

Las RPCs de reservas deben revocar EXECUTE para `anon`:

```sql
-- Bloque 3B: agregar a migración
REVOKE EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_order_inventory(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) FROM anon;

-- Solo authenticated puede intentar llamarlas (validación interna por has_permission)
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_inventory_reservations(uuid, uuid) TO authenticated;
```

### H.4 — search_path Seguro

Todas las RPCs deben tener:

```sql
SECURITY DEFINER
SET search_path TO 'public'  -- previene search_path injection
```

### H.5 — Permiso `inventory.reserve` (MED-1 Resuelto)

**Decisión: Opción A** — crear permiso `inventory.reserve` separado de `inventory.consume`.

Justificación: reservar y consumir son acciones con perfiles de riesgo distintos. Un operador de almacén puede necesitar ver reservas (`inventory.view`) sin poder consumirlas.

**Prerequisito de Bloque 3B:**

```sql
-- Migración 3B: seed del permiso usando el schema real
-- (columnas reales: id, module, action, label, description)
INSERT INTO permissions (id, module, action, label, description)
VALUES (
  'inventory.reserve',
  'inventory',
  'reserve',
  'Reservar inventario',
  'Permite crear reservas transaccionales de inventario antes de producción'
)
ON CONFLICT (id) DO NOTHING;

-- Asignar a roles autorizados (admin, produccion, bodega)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, 'inventory.reserve'
FROM roles r
WHERE r.name IN ('admin', 'produccion', 'bodega')
ON CONFLICT DO NOTHING;
```

> ⚠️ **MED-A — Verificar schema real antes de 3B:**
> La tabla `permissions` debe tener las columnas `(id, module, action, label, description)` y la PK debe ser `id TEXT`.
> La tabla `role_permissions` debe tener `(role_id, permission_id)` con `permission_id TEXT`.
> Confirmar con `\d permissions` en el local de Supabase antes de escribir la migración.

---

## I. Tests Obligatorios (Ampliados v2.0)

### I.1 — Tests de RPC (Supabase local, post-3B)

| ID | Test |
|---|---|
| `T-R1` | Reserva exitosa de tela: orden con rollo compatible → reserva `active` creada |
| `T-R2` | Reserva fallida por stock insuficiente → EXCEPTION, sin reservas creadas (TX revertida) |
| `T-R3` | Reserva fallida por ancho incompatible → EXCEPTION `WIDTH_MISMATCH` |
| `T-R4` | Reserva idempotente: doble llamada → una sola reserva `active` |
| `T-R5` | Doble reserva concurrente mismo rollo: TX2 bloqueada hasta que TX1 libera |
| `T-R6` | Reserva de tela sin `specificInventoryItemId` → selecciona rollo por ancho ±0.01 m |
| `T-R7` | Reserva fungible EA reparte entre 2+ ítems (stock insuficiente en uno solo) |
| `T-R8` | Stock leído desde `inventory_items.payload`, no desde línea BOM |
| `T-R9` | Dos líneas sin `material_line_id` → EXCEPTION antes de reservar |
| `T-R10` | Barra virtual sin inventory_item físico → falla controlada `INSUFFICIENT_STOCK` |
| `T-L1` | Liberación al cancelar → `released_at` y `released_by` = `auth.uid()` |
| `T-L2` | Liberación idempotente: doble release → sin error, segunda no cambia filas |
| `T-C1` | Consumo de reserva propia → `consumed_at` poblado + `inventory_movement` creado |
| `T-C2` | Consumo sin reserva active → EXCEPTION `NO_ACTIVE_RESERVATIONS` |
| `T-C3` | Idempotencia de consumo: ya consumed → `already_consumed` sin acción |
| `T-C4` | Release y consume simultáneos misma orden → serializados por advisory lock |
| `T-S1` | RLS: `authenticated` sin permiso no puede INSERT directo → error |
| `T-S2` | RLS: `authenticated` sin `inventory.view` no puede SELECT |
| `T-S3` | `anon` no puede ejecutar `reserve_order_inventory` → PERMISSION_DENIED |
| `T-S4` | `p_user_id` distinto de `auth.uid()` → EXCEPTION `user_id mismatch` |
| `T-S5` | Usuario sin `inventory.reserve` no puede reservar |
| `T-S6` | Disponibilidad descuenta reservas activas de otra orden (no ve stock comprometido) |
| `T-D1` | `supabase db reset` aplica `initial_schema` + `inventory_reservations` + seed `inventory.reserve` sin errores |

### I.2 — Tests TypeScript (src/, Bloque 3E)

| ID | Test |
|---|---|
| `T-TS1` | `createOrderReservations()` llama RPC y retorna resultado estructurado |
| `T-TS2` | `releaseOrderReservations()` llama RPC con `reason` correcto |
| `T-TS3` | `consumeOrderReservations()` llama RPC y maneja errores |
| `T-TS4` | Workflow: `sendToProduction()` llama reserva **antes** de cambiar estado |
| `T-TS5` | Workflow: si reserva falla, estado no cambia |
| `T-TS6` | Workflow: cancelación llama release; si falla, solo loguea |
| `T-TS7` | `stableMaterialLineId()` es determinístico: mismo input → mismo ID |
| `T-AV1` | `validateOrderInventoryAvailability` descuenta reservas activas existentes (Bloque 3C) |

---

## J. Plan de Implementación por Bloques (Actualizado v2.0)

| Bloque | Descripción | Prerequisitos |
|---|---|---|
| **3B** | Migración: seed `inventory.reserve`, REVOKE `anon`, helpers SQL de unidad/disponibilidad. Implementar `reserve_order_inventory` con `auth.uid()`, `FOR UPDATE`, algoritmos §D.2. | 3A.1 aprobado |
| **3C** | Actualizar `validateOrderInventoryAvailability` para descontar reservas `active` via Supabase query | 3B |
| **3D** | Implementar `release_order_inventory` con advisory lock | 3B |
| **3E** | `consume_order_inventory_reservations`. Wrapper TypeScript `src/lib/supabaseReservations.ts`. `stableMaterialLineId()`. | 3B, 3D |
| **3F** | Tests de concurrencia y RLS (locales, con Supabase `db reset`) | 3B-3E |
| **3G** | Integración workflow: `sendToProduction` → reserva ANTES de cambiar estado. Cancelación → release. Completar → consume. Deshabilitar `process_order_inventory_tx` para órdenes con reservas. | 3E |

---

## Riesgos Restantes Post-Corrección

### Críticos (requieren acción pre-3B)

| ID | Riesgo | Acción |
|---|---|---|
| **R-C1 → RESUELTO** | `validateOrderInventoryAvailability` sobreestima disponibilidad | Resolver en Bloque 3C |
| **R-C2 → RESUELTO** | `process_order_inventory_tx` no valida reservas | Decisión legacy tomada §D.5 |
| **R-C3 → RESUELTO** | Barras virtuales no reservables | Exclusión V1 documentada §D.6 |

### Medios (documentados, resueltos en plan)

| ID | Riesgo | Acción |
|---|---|---|
| **R-M1 → RESUELTO** | `inventory.reserve` puede no existir | Prerequisito de 3B §H.5 |
| **R-M2 → RESUELTO** | `material_line_id` NULL colapsa líneas | `stableMaterialLineId()` en §D.0 |
| **R-M3** | Sin FK `inventory_reservations → inventory_movements` | Deuda técnica — post-3G |

### Menores

| ID | Riesgo |
|---|---|
| **R-m1** | LF/CRLF en `initial_schema.sql` — cosmético |
| **R-m2** | `metadata JSONB` sin schema enforcement |
| **R-m3** | Sin `updated_at` genérico en `inventory_reservations` |
