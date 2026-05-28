import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const adminCriticalPermissions = [
  'users.view',
  'users.create_user',
  'users.edit_roles',
  'users.disable_user',
  'production.view',
  'inventory.view',
  'orders.view',
  'settings.view',
]

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
    if (!authHeader) {
      return json({ error: 'Unauthorized: Missing token' }, 401)
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Unauthorized: Invalid token' }, 401)
    }

    const { roleId, permissionIds, confirmSensitiveChange = false } = await req.json()
    if (!roleId || !Array.isArray(permissionIds)) {
      return json({ error: 'roleId y permissionIds son obligatorios.' }, 400)
    }

    const uniquePermissionIds = [...new Set(permissionIds.filter((item) => typeof item === 'string'))]
    if (uniquePermissionIds.length !== permissionIds.length) {
      return json({ error: 'permissionIds debe contener únicamente textos válidos y sin duplicados.' }, 400)
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('email, role, role_id, is_active')
      .eq('id', user.id)
      .single()

    if (callerProfileError || !callerProfile) {
      return json({ error: 'No se pudo validar el perfil del usuario.' }, 403)
    }

    if (callerProfile.is_active !== true) {
      return json({ error: 'Usuario inactivo.' }, 403)
    }

    const { data: callerPermissions, error: callerPermissionsError } = await supabaseAdmin
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', callerProfile.role_id)

    if (callerPermissionsError) {
      return json({ error: 'No se pudieron validar los permisos del usuario.' }, 403)
    }

    const callerPermissionIds = new Set((callerPermissions || []).map((row) => row.permission_id))
    if (!callerPermissionIds.has('users.edit_roles')) {
      return json({ error: 'No tienes permisos para administrar roles.' }, 403)
    }

    const { data: targetRole, error: targetRoleError } = await supabaseAdmin
      .from('roles')
      .select('id, name')
      .eq('id', roleId)
      .maybeSingle()

    if (targetRoleError) {
      return json({ error: 'No se pudo validar el rol solicitado.' }, 400)
    }

    if (!targetRole) {
      return json({ error: 'El rol solicitado no existe.' }, 404)
    }

    if (uniquePermissionIds.length > 0) {
      const { data: validPermissions, error: validPermissionsError } = await supabaseAdmin
        .from('permissions')
        .select('id')
        .in('id', uniquePermissionIds)

      if (validPermissionsError) {
        return json({ error: 'No se pudieron validar los permisos solicitados.' }, 400)
      }

      const validPermissionIds = new Set((validPermissions || []).map((permission) => permission.id))
      const missingPermissionIds = uniquePermissionIds.filter((permissionId) => !validPermissionIds.has(permissionId))
      if (missingPermissionIds.length > 0) {
        return json({ error: `Permisos inexistentes: ${missingPermissionIds.join(', ')}` }, 400)
      }
    }

    if (targetRole.name === 'admin') {
      const missingCriticalPermissions = adminCriticalPermissions.filter((permissionId) => !uniquePermissionIds.includes(permissionId))
      if (missingCriticalPermissions.length > 0) {
        return json({ error: `El rol admin no puede perder permisos críticos: ${missingCriticalPermissions.join(', ')}` }, 400)
      }
    }

    if (callerProfile.role_id === roleId && !uniquePermissionIds.includes('users.edit_roles') && !confirmSensitiveChange) {
      return json({ error: 'Este cambio quitaría tu permiso para administrar roles. Confirma el cambio para continuar.', requiresConfirmation: true }, 409)
    }

    const { error: deleteError } = await supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)

    if (deleteError) {
      throw deleteError
    }

    if (uniquePermissionIds.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('role_permissions')
        .insert(uniquePermissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })))

      if (insertError) {
        throw insertError
      }
    }

    const { error: activityError } = await supabaseAdmin
      .from('user_activity_log')
      .insert({
        actor_user_id: user.id,
        actor_email: callerProfile.email || user.email || null,
        target_user_id: null,
        target_email: null,
        event_type: 'role.permissions_changed',
        event_label: 'Permisos de rol actualizados',
        metadata: {
          roleId,
          roleName: targetRole.name,
          permissionIds: uniquePermissionIds,
          permissionCount: uniquePermissionIds.length,
        },
      })

    if (activityError) {
      console.error('Activity log insert error:', activityError)
    }

    return json({ success: true, roleId, permissionIds: uniquePermissionIds }, 200)
  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return json({ error: error.message || 'Error inesperado al actualizar permisos.' }, 400)
  }
})

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
