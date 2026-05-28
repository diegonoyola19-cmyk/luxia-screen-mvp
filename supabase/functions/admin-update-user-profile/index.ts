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

    const { userId, role, isActive } = await req.json()
    if (!userId || (typeof role === 'undefined' && typeof isActive === 'undefined')) {
      return json({ error: 'userId y al menos un cambio son obligatorios.' }, 400)
    }

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role_id, is_active')
      .eq('id', user.id)
      .single()

    if (actorProfileError || !actorProfile) {
      return json({ error: 'No se pudo validar el perfil del usuario.' }, 403)
    }

    if (actorProfile.is_active !== true) {
      return json({ error: 'Usuario inactivo.' }, 403)
    }

    const actorPermissionIds = await getPermissionIds(supabaseAdmin, actorProfile.role_id)

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, role_id, is_active')
      .eq('id', userId)
      .single()

    if (targetProfileError || !targetProfile) {
      return json({ error: 'No se pudo encontrar el usuario solicitado.' }, 404)
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const events: Array<{ event_type: string; event_label: string; metadata: Record<string, unknown> }> = []

    if (typeof role !== 'undefined') {
      if (!actorPermissionIds.has('users.edit_roles')) {
        return json({ error: 'No tienes permisos para editar roles.' }, 403)
      }

      const { data: targetRole, error: targetRoleError } = await supabaseAdmin
        .from('roles')
        .select('id, name')
        .eq('name', role)
        .maybeSingle()

      if (targetRoleError || !targetRole) {
        return json({ error: 'El rol solicitado no existe.' }, 400)
      }

      updates.role = targetRole.name
      updates.role_id = targetRole.id

      if (targetProfile.role !== targetRole.name) {
        events.push({
          event_type: 'user.role_changed',
          event_label: 'Cambio de rol',
          metadata: {
            previousRole: targetProfile.role,
            nextRole: targetRole.name,
          },
        })
      }
    }

    if (typeof isActive !== 'undefined') {
      if (!actorPermissionIds.has('users.disable_user')) {
        return json({ error: 'No tienes permisos para activar o desactivar usuarios.' }, 403)
      }

      if (userId === user.id) {
        return json({ error: 'No puedes cambiar el estado de tu propia cuenta.' }, 400)
      }

      updates.is_active = Boolean(isActive)

      if (targetProfile.is_active !== Boolean(isActive)) {
        events.push({
          event_type: Boolean(isActive) ? 'user.activated' : 'user.deactivated',
          event_label: Boolean(isActive) ? 'Usuario activado' : 'Usuario desactivado',
          metadata: {
            previousStatus: targetProfile.is_active,
            nextStatus: Boolean(isActive),
          },
        })
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (updateError) throw updateError

    for (const event of events) {
      await logActivity(supabaseAdmin, {
        actor_user_id: user.id,
        actor_email: actorProfile.email || user.email || null,
        target_user_id: targetProfile.id,
        target_email: targetProfile.email,
        ...event,
      })
    }

    return json({ success: true }, 200)
  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return json({ error: error.message || 'Error inesperado al actualizar usuario.' }, 400)
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

async function logActivity(supabaseAdmin: any, event: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('user_activity_log').insert(event)
  if (error) console.error('Activity log insert error:', error)
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
