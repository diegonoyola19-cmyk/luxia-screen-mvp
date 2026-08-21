import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseReconcileOptions } from './validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing environment variables in Edge Function');
    }

    // 1. Verificación de Autenticación / Autorización
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ ok: false, error: 'Unauthorized: Missing Authorization header' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const options = parseReconcileOptions(url, body);

    // 2. Invocar la RPC de reconciliación
    const { data, error } = await supabaseAdmin.rpc('reconcile_inventory_reservations', {
      p_dry_run: options.dryRun,
      p_limit: options.limit,
      p_grace_minutes: options.graceMinutes,
    });

    const durationMs = Date.now() - startTime;

    if (error) {
      console.error('[reconcile-inventory-reservations] RPC Error:', error.message);
      return json({ ok: false, error: error.message, duration_ms: durationMs }, 500);
    }

    console.log(
      `[reconcile-inventory-reservations] Executed: dryRun=${options.dryRun}, scanned=${data?.scanned ?? 0}, released=${data?.released ?? 0}, duration=${durationMs}ms`
    );

    return json({
      ...data,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[reconcile-inventory-reservations] Execution Error:', err.message || err);
    return json({ ok: false, error: err.message || 'Internal Server Error', duration_ms: durationMs }, 500);
  }
});
