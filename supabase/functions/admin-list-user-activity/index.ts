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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized: Invalid token' }, 401)

    const { targetUserId, eventType, limit = 50 } = await req.json().catch(() => ({}))

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('role_id, is_active')
      .eq('id', user.id)
      .single()

    if (actorProfileError || !actorProfile) {
      return json({ error: 'No se pudo validar el perfil del usuario.' }, 403)
    }

    if (actorProfile.is_active !== true) {
      return json({ error: 'Usuario inactivo.' }, 403)
    }

    const permissionIds = await getPermissionIds(supabaseAdmin, actorProfile.role_id)
    if (!permissionIds.has('users.view') && !permissionIds.has('users.edit_roles')) {
      return json({ error: 'No tienes permisos para ver actividad administrativa.' }, 403)
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    let query = supabaseAdmin
      .from('user_activity_log')
      .select('id, actor_user_id, actor_email, target_user_id, target_email, event_type, event_label, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (targetUserId) query = query.eq('target_user_id', targetUserId)
    if (eventType) query = query.eq('event_type', eventType)

    const { data, error } = await query
    if (error) throw error

    return json({ events: data || [] }, 200)
  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return json({ error: error.message || 'Error inesperado al listar actividad.' }, 400)
  }
})

async function getPermissionIds(supabaseAdmin: any, roleId: string | null) {
  if (!roleId) return new Set<string>()
  const { data, error } = await supabaseAdmin
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId)

  if (error) throw error
  return new Set((data || []).map((row: { permission_id: string }) => row.permission_id))
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
