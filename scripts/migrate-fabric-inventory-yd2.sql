-- =============================================================================
-- FASE 5B.9.0: Migración de inventario de tela a yd2
-- =============================================================================

DO $$
DECLARE
    v_item RECORD;
    v_width numeric;
    v_length numeric;
    v_available_yd2 numeric;
    v_payload jsonb;
BEGIN
    FOR v_item IN 
        SELECT id, payload 
        FROM public.inventory_items 
        WHERE category = 'fabric'
    LOOP
        v_payload := v_item.payload;
        
        -- Obtener width_meters
        IF v_payload ? 'width_meters' THEN
            v_width := (v_payload->>'width_meters')::numeric;
        ELSIF v_payload ? 'widthMeters' THEN
            v_width := (v_payload->>'widthMeters')::numeric;
        ELSE
            -- Si no hay ancho, no podemos calcular yd2
            CONTINUE;
        END IF;

        -- Obtener length_meters
        IF v_payload ? 'length_meters' THEN
            v_length := (v_payload->>'length_meters')::numeric;
        ELSIF v_payload ? 'lengthMeters' THEN
            v_length := (v_payload->>'lengthMeters')::numeric;
        ELSE
            -- Si no hay largo, no podemos calcular yd2
            CONTINUE;
        END IF;

        -- Si no existe available_yd2, lo calculamos
        IF NOT (v_payload ? 'available_yd2') THEN
            v_available_yd2 := v_width * v_length * 1.1959900463;
            v_payload := jsonb_set(v_payload, '{available_yd2}', to_jsonb(v_available_yd2));
            
            UPDATE public.inventory_items
            SET payload = v_payload,
                updated_at = timezone('utc', now())
            WHERE id = v_item.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
