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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing environment variables in Edge Function');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const options = parseReconcileOptions(url, body);

    // Invocar la RPC de reconciliación
    const { data, error } = await supabaseAdmin.rpc('reconcile_inventory_reservations', {
      p_dry_run: options.dryRun,
      p_limit: options.limit,
      p_grace_minutes: options.graceMinutes,
    });

    if (error) {
      console.error('[reconcile-inventory-reservations] RPC Error:', error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json(data);
  } catch (err: any) {
    console.error('[reconcile-inventory-reservations] Execution Error:', err);
    return json({ ok: false, error: err.message || 'Internal Server Error' }, 500);
  }
});
