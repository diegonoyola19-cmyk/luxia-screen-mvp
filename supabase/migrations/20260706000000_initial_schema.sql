


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role_type" AS ENUM (
    'admin',
    'produccion',
    'bodega',
    'consulta'
);


ALTER TYPE "public"."user_role_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    'consulta',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("user_id" "uuid", "req_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    user_role_id uuid;
    has_perm boolean;
BEGIN
    IF user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Obtener el role_id del usuario
    SELECT role_id INTO user_role_id
    FROM public.profiles
    WHERE id = user_id;

    IF user_role_id IS NULL THEN
        RETURN false;
    END IF;

    -- Verificar si el rol tiene el permiso
    SELECT EXISTS (
        SELECT 1
        FROM public.role_permissions
        WHERE role_id = user_role_id
          AND permission_id = req_permission
    ) INTO has_perm;

    RETURN has_perm;
END;
$$;


ALTER FUNCTION "public"."has_permission"("user_id" "uuid", "req_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  admin_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id
      AND role = 'admin'
      AND is_active = true
  )
  INTO admin_exists;

  RETURN admin_exists;
END;
$$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    v_req_qty_ft numeric;
    
    v_inv_item_id uuid;
    v_inv_length numeric;
    v_inv_available_yd2 numeric;
    v_inv_payload jsonb;
    v_inv_qty numeric;
    v_inv_status text;
BEGIN
    -- 1. Validar auth
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Usuario no autenticado';
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

                v_inv_available_yd2 := v_inv_available_yd2 - v_req_qty;
                v_inv_length := v_inv_available_yd2 / (v_width_meters * 1.1959900463);
                
                v_inv_payload := jsonb_set(v_inv_payload, '{available_yd2}', to_jsonb(v_inv_available_yd2));
                v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length));
                
                UPDATE public.inventory_items
                SET payload = v_inv_payload,
                    updated_at = timezone('utc', now()),
                    updated_by = v_user_id
                WHERE id = v_inv_item_id;

                INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                VALUES (v_inv_item_id, v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);

            ELSE
                IF v_category IN ('tube', 'bottom') THEN
                    v_req_qty_ft := v_req_qty;
                    IF v_unit = 'm' THEN
                        v_req_qty_ft := v_req_qty * 3.28084;
                    END IF;

                    SELECT id, (payload->>'length_feet')::numeric, payload
                    INTO v_inv_item_id, v_inv_length, v_inv_payload
                    FROM public.inventory_items
                    WHERE category = v_category
                      AND code = v_item_code 
                      AND status = 'available'
                      AND (payload->>'length_feet')::numeric >= v_req_qty_ft
                    ORDER BY (payload->>'length_feet')::numeric ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED;

                    IF v_inv_item_id IS NOT NULL THEN
                        v_inv_length := v_inv_length - v_req_qty_ft;
                        
                        IF v_inv_length >= 1.0 THEN 
                            v_inv_payload := jsonb_set(v_inv_payload, '{length_feet}', to_jsonb(v_inv_length));
                            v_inv_payload := jsonb_set(v_inv_payload, '{length_meters}', to_jsonb(v_inv_length / 3.28084));
                            UPDATE public.inventory_items
                            SET payload = v_inv_payload, updated_at = timezone('utc', now()), updated_by = v_user_id
                            WHERE id = v_inv_item_id;
                        ELSE
                            UPDATE public.inventory_items
                            SET status = 'used', updated_at = timezone('utc', now()), updated_by = v_user_id
                            WHERE id = v_inv_item_id;
                        END IF;

                        INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                        VALUES (v_inv_item_id, v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                    ELSE
                        INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                        VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, 'Corte de barra nueva 19ft: ' || COALESCE(v_item->>'notes', ''), v_user_id);
                        
                        v_inv_length := 19.0 - v_req_qty_ft;
                        IF v_inv_length >= 1.0 THEN
                            INSERT INTO public.inventory_items (category, kind, code, status, payload, created_from_order_id, source, created_by)
                            VALUES (
                                v_category, 
                                'unit', 
                                v_item_code, 
                                'available', 
                                jsonb_build_object(
                                    'length_feet', v_inv_length,
                                    'length_meters', v_inv_length / 3.28084,
                                    'available_quantity', 1,
                                    'unit', 'FT',
                                    'source_order', v_order_number
                                ),
                                v_order_id, 
                                'production_cut',
                                v_user_id
                            ) RETURNING id INTO v_inv_item_id;

                            INSERT INTO public.inventory_movements (inventory_item_id, order_id, category, action, item_code, quantity, unit, notes, created_by)
                            VALUES (v_inv_item_id, v_order_id, v_category, 'create_scrap', v_item_code, v_inv_length, 'ft', 'Sobrante automático de barra 19ft', v_user_id);
                        END IF;
                    END IF;
                ELSE
                    INSERT INTO public.inventory_movements (order_id, category, action, item_code, quantity, unit, notes, created_by)
                    VALUES (v_order_id, v_category, 'consume', v_item_code, v_req_qty, v_unit, v_item->>'notes', v_user_id);
                END IF;
            END IF;

        ELSIF v_action = 'use_scrap' THEN
            v_specific_id := (v_item->>'specificInventoryItemId')::uuid;
            IF v_specific_id IS NULL THEN
                RAISE EXCEPTION 'INVALID_CONSUMPTION_PLAN: use_scrap requiere specificInventoryItemId';
            END IF;

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
            INSERT INTO public.inventory_items (category, kind, code, status, payload, created_from_order_id, source, created_by)
            VALUES (
                v_category, 
                'scrap', 
                v_item_code, 
                'available', 
                (COALESCE(v_item->'payload', '{}'::jsonb) || jsonb_build_object(
                    'width_meters', v_width_meters, 
                    'length_meters', v_req_qty / (v_width_meters * 1.1959900463),
                    'available_yd2', v_req_qty,
                    'area_meters', v_width_meters * (v_req_qty / (v_width_meters * 1.1959900463)),
                    'source_order', v_order_number
                )),
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
$$;


ALTER FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid", "p_reason" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Stub de liberación
    RAISE EXCEPTION 'Not implemented yet (Fase 4C)';
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."release_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Validar permisos de manera explícita (Stub)
    IF NOT public.has_permission(p_user_id, 'inventory.consume') THEN
        RAISE EXCEPTION 'Permisos insuficientes para reservar inventario.';
    END IF;
    -- Lógica futura en Fase 4C:
    -- 1. Verificar si ya hay reservas activas (Idempotencia RPC)
    -- 2. Obtener finalMaterialLines de la orden
    -- 3. SELECT FOR UPDATE de inventory_items ordenados por ID (prevenir deadlocks)
    -- 4. Inserción masiva en inventory_reservations
    -- 5. Manejar retazos o unidades vacías estrictamente
    RAISE EXCEPTION 'Not implemented yet (Fase 4C)';
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reserve_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."catalog_items" (
    "item_code" "text" NOT NULL,
    "sage_item_code" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "color" "text",
    "unit" "text" DEFAULT 'EA'::"text" NOT NULL,
    "avg_cost" numeric(10,4) DEFAULT 0 NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curtain_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "curtain_type" "text" DEFAULT 'screen'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."curtain_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fabric_tone_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family" "text" NOT NULL,
    "openness" "text" NOT NULL,
    "color" "text" NOT NULL,
    "tone_group" "text" NOT NULL
);


ALTER TABLE "public"."fabric_tone_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "code" "text" NOT NULL,
    "status" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_from_order_id" "uuid",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "inventory_items_category_check" CHECK (("category" = ANY (ARRAY['fabric'::"text", 'tube'::"text", 'bottom'::"text", 'component'::"text"]))),
    CONSTRAINT "inventory_items_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'used'::"text", 'discarded'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_item_id" "uuid",
    "order_id" "uuid",
    "category" "text" NOT NULL,
    "action" "text" NOT NULL,
    "item_code" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "notes" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "inventory_movements_action_check" CHECK (("action" = ANY (ARRAY['import'::"text", 'adjust'::"text", 'reserve'::"text", 'consume'::"text", 'create_scrap'::"text", 'use_scrap'::"text", 'discard'::"text", 'transfer'::"text", 'rollback'::"text"]))),
    CONSTRAINT "inventory_movements_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "material_line_id" "text",
    "required_quantity" numeric NOT NULL,
    "quantity_reserved" numeric NOT NULL,
    "base_unit" "text" NOT NULL,
    "source" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    "released_at" timestamp with time zone,
    "released_by" "uuid",
    "release_reason" "text",
    "consumed_at" timestamp with time zone,
    "consumed_by" "uuid",
    CONSTRAINT "chk_active_data" CHECK (((("status" = 'active'::"text") AND ("released_at" IS NULL) AND ("consumed_at" IS NULL)) OR ("status" <> 'active'::"text"))),
    CONSTRAINT "chk_consumed_data" CHECK (((("status" = 'consumed'::"text") AND ("consumed_at" IS NOT NULL)) OR ("status" <> 'consumed'::"text"))),
    CONSTRAINT "chk_released_data" CHECK (((("status" = 'released'::"text") AND ("released_at" IS NOT NULL)) OR ("status" <> 'released'::"text"))),
    CONSTRAINT "inventory_reservations_quantity_reserved_check" CHECK (("quantity_reserved" >= (0)::numeric)),
    CONSTRAINT "inventory_reservations_required_quantity_check" CHECK (("required_quantity" >= (0)::numeric)),
    CONSTRAINT "inventory_reservations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'released'::"text", 'consumed'::"text"])))
);


ALTER TABLE "public"."inventory_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "text" NOT NULL,
    "module" "text" NOT NULL,
    "action" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role_type" DEFAULT 'consulta'::"public"."user_role_type" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role_id" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "category" "text" NOT NULL,
    "quantity_mode" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "fixed_quantity" numeric(10,4) DEFAULT 1 NOT NULL,
    "item_code_white" "text",
    "item_code_grey" "text",
    "item_code_ivory" "text",
    "item_code_bronze" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."recipe_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "text" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "target_user_id" "uuid",
    "target_email" "text",
    "event_type" "text" NOT NULL,
    "event_label" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entity_type" "text",
    "entity_id" "text"
);


ALTER TABLE "public"."user_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_orders" (
    "id" "uuid" NOT NULL,
    "order_number" "text",
    "client_name" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "payload" "jsonb",
    "source" "text" DEFAULT 'luxia'::"text",
    "local_migrated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("item_code");



ALTER TABLE ONLY "public"."curtain_recipes"
    ADD CONSTRAINT "curtain_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fabric_tone_rules"
    ADD CONSTRAINT "fabric_tone_rules_family_openness_color_key" UNIQUE ("family", "openness", "color");



ALTER TABLE ONLY "public"."fabric_tone_rules"
    ADD CONSTRAINT "fabric_tone_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_activity_log"
    ADD CONSTRAINT "user_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_inventory_items_category" ON "public"."inventory_items" USING "btree" ("category");



CREATE INDEX "idx_inventory_items_code" ON "public"."inventory_items" USING "btree" ("code");



CREATE INDEX "idx_inventory_items_created_from_order_id" ON "public"."inventory_items" USING "btree" ("created_from_order_id");



CREATE INDEX "idx_inventory_items_deleted_at" ON "public"."inventory_items" USING "btree" ("deleted_at");



CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");



CREATE INDEX "idx_inventory_movements_action" ON "public"."inventory_movements" USING "btree" ("action");



CREATE INDEX "idx_inventory_movements_created_at" ON "public"."inventory_movements" USING "btree" ("created_at");



CREATE INDEX "idx_inventory_movements_inventory_item_id" ON "public"."inventory_movements" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_inventory_movements_order_id" ON "public"."inventory_movements" USING "btree" ("order_id");



CREATE INDEX "idx_inventory_reservations_active_items" ON "public"."inventory_reservations" USING "btree" ("inventory_item_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "idx_inventory_reservations_idempotency" ON "public"."inventory_reservations" USING "btree" ("order_id", "inventory_item_id", COALESCE("material_line_id", ''::"text")) WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_inventory_reservations_inventory_item_id" ON "public"."inventory_reservations" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_inventory_reservations_order_id" ON "public"."inventory_reservations" USING "btree" ("order_id");



CREATE INDEX "idx_inventory_reservations_sku" ON "public"."inventory_reservations" USING "btree" ("sku");



CREATE INDEX "idx_inventory_reservations_status" ON "public"."inventory_reservations" USING "btree" ("status");



CREATE INDEX "idx_inventory_reservations_status_item" ON "public"."inventory_reservations" USING "btree" ("status", "inventory_item_id");



CREATE INDEX "idx_inventory_reservations_status_order" ON "public"."inventory_reservations" USING "btree" ("status", "order_id");



CREATE INDEX "idx_user_activity_log_created_at" ON "public"."user_activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_activity_log_event_type" ON "public"."user_activity_log" USING "btree" ("event_type");



CREATE INDEX "idx_user_activity_log_target_user_id" ON "public"."user_activity_log" USING "btree" ("target_user_id");



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_from_order_id_fkey" FOREIGN KEY ("created_from_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_consumed_by_fkey" FOREIGN KEY ("consumed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."inventory_reservations"
    ADD CONSTRAINT "inventory_reservations_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_item_code_bronze_fkey" FOREIGN KEY ("item_code_bronze") REFERENCES "public"."catalog_items"("item_code");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_item_code_grey_fkey" FOREIGN KEY ("item_code_grey") REFERENCES "public"."catalog_items"("item_code");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_item_code_ivory_fkey" FOREIGN KEY ("item_code_ivory") REFERENCES "public"."catalog_items"("item_code");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_item_code_white_fkey" FOREIGN KEY ("item_code_white") REFERENCES "public"."catalog_items"("item_code");



ALTER TABLE ONLY "public"."recipe_components"
    ADD CONSTRAINT "recipe_components_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."curtain_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity_log"
    ADD CONSTRAINT "user_activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_activity_log"
    ADD CONSTRAINT "user_activity_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow select for self and admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "Allow update for admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Authenticated users can read catalog_items" ON "public"."catalog_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read curtain_recipes" ON "public"."curtain_recipes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read fabric_tone_rules" ON "public"."fabric_tone_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read recipe_components" ON "public"."recipe_components" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."catalog_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."curtain_recipes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."fabric_tone_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."recipe_components" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Only service role can insert user activity log" ON "public"."user_activity_log" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curtain_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fabric_tone_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_delete_rbac" ON "public"."inventory_items" FOR DELETE USING ("public"."has_permission"("auth"."uid"(), 'inventory.delete'::"text"));



CREATE POLICY "inventory_items_insert_rbac" ON "public"."inventory_items" FOR INSERT WITH CHECK (("public"."has_permission"("auth"."uid"(), 'inventory.adjust'::"text") OR "public"."has_permission"("auth"."uid"(), 'inventory.import'::"text") OR "public"."has_permission"("auth"."uid"(), 'inventory.consume'::"text")));



CREATE POLICY "inventory_items_select_rbac" ON "public"."inventory_items" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), 'inventory.view'::"text"));



CREATE POLICY "inventory_items_update_rbac" ON "public"."inventory_items" FOR UPDATE USING (("public"."has_permission"("auth"."uid"(), 'inventory.adjust'::"text") OR "public"."has_permission"("auth"."uid"(), 'inventory.consume'::"text")));



ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_movements_delete_rbac" ON "public"."inventory_movements" FOR DELETE USING ("public"."has_permission"("auth"."uid"(), 'inventory.delete'::"text"));



CREATE POLICY "inventory_movements_insert_rbac" ON "public"."inventory_movements" FOR INSERT WITH CHECK (("public"."has_permission"("auth"."uid"(), 'inventory.adjust'::"text") OR "public"."has_permission"("auth"."uid"(), 'inventory.import'::"text") OR "public"."has_permission"("auth"."uid"(), 'inventory.consume'::"text")));



CREATE POLICY "inventory_movements_select_rbac" ON "public"."inventory_movements" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), 'inventory.view'::"text"));



CREATE POLICY "inventory_movements_update_rbac" ON "public"."inventory_movements" FOR UPDATE USING ("public"."has_permission"("auth"."uid"(), 'inventory.delete'::"text"));



ALTER TABLE "public"."inventory_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_select_authenticated" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_delete_rbac" ON "public"."inventory_reservations" FOR DELETE USING (false);



CREATE POLICY "reservations_insert_rbac" ON "public"."inventory_reservations" FOR INSERT WITH CHECK (false);



CREATE POLICY "reservations_select_rbac" ON "public"."inventory_reservations" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), 'inventory.view'::"text") OR "public"."has_permission"("auth"."uid"(), 'orders.view'::"text")));



CREATE POLICY "reservations_update_rbac" ON "public"."inventory_reservations" FOR UPDATE USING (false);



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_select_authenticated" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select_authenticated" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."user_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_orders_delete_rbac" ON "public"."work_orders" FOR DELETE USING ("public"."has_permission"("auth"."uid"(), 'orders.delete'::"text"));



CREATE POLICY "work_orders_insert_rbac" ON "public"."work_orders" FOR INSERT WITH CHECK ("public"."has_permission"("auth"."uid"(), 'production.create_order'::"text"));



CREATE POLICY "work_orders_select_rbac" ON "public"."work_orders" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), 'orders.view'::"text"));



CREATE POLICY "work_orders_update_rbac" ON "public"."work_orders" FOR UPDATE USING ("public"."has_permission"("auth"."uid"(), 'orders.edit'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), 'orders.edit'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."role_permissions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_activity_log";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_permission"("user_id" "uuid", "req_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("user_id" "uuid", "req_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("user_id" "uuid", "req_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_order_inventory_tx"("p_order_payload" "jsonb", "p_consumption_plan" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_order_inventory"("p_order_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."curtain_recipes" TO "anon";
GRANT ALL ON TABLE "public"."curtain_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."curtain_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."fabric_tone_rules" TO "anon";
GRANT ALL ON TABLE "public"."fabric_tone_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."fabric_tone_rules" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_reservations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_components" TO "anon";
GRANT ALL ON TABLE "public"."recipe_components" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_components" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."user_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created_create_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();


