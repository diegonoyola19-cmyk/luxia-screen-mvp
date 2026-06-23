import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Missing environment variables in Edge Function')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized: Missing token' }, 401)

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Validate real session from token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized: Invalid token' }, 401)

    // 2. Parse payload safely
    const payload = await req.json().catch(() => ({}))
    const { event_type, entity_type, entity_id, metadata = {} } = payload

    if (!event_type) {
      return json({ error: 'event_type es obligatorio' }, 400)
    }

    // 3. Get actor email (safe, from admin)
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single()

    if (actorProfile && actorProfile.is_active === false) {
      return json({ error: 'Usuario inactivo.' }, 403)
    }

    // 4. Insert log using admin client (bypasses RLS for inserting, highly secure as we control actor_user_id)
    const { error: insertError } = await supabaseAdmin
      .from('user_activity_log')
      .insert([
        {
          actor_user_id: user.id, // Enforced securely
          actor_email: user.email || null,
          event_type: event_type,
          event_label: event_type,
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          metadata: metadata
        }
      ])

    if (insertError) {
      throw insertError
    }

    return json({ success: true }, 200)

  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return json({ error: error.message || 'Error inesperado al registrar actividad.' }, 400)
  }
})

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
