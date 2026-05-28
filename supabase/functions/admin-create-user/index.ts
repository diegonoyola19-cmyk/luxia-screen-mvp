import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS para peticiones preflight del navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing environment variables in Edge Function")
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Cliente con el JWT del llamador para verificar identidad
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Verificar rol en public.profiles (usamos service_role temporalmente pero filtrando ESTRICTAMENTE por el user.id validado)
    // Esto previene problemas si el RLS impide lectura. Aunque admin puede leer, garantizamos el acceso.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin' || profile.is_active !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: Solo administradores activos pueden crear usuarios.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Extraer datos del request
    const { email, password, role } = await req.json()

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'Email, password y role son obligatorios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: targetRole, error: targetRoleError } = await supabaseAdmin
      .from('roles')
      .select('id, name')
      .eq('name', role)
      .maybeSingle()

    if (targetRoleError) {
      console.error("Role lookup error:", targetRoleError)
      return new Response(JSON.stringify({ error: 'No se pudo validar el rol solicitado.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!targetRole) {
      return new Response(JSON.stringify({ error: `El rol "${role}" no existe en el catálogo dinámico.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Crear usuario en Auth usando Service Role
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
       // Mensajes amigables para el UI
       if (authError.message.includes('already exists') || authError.status === 422) {
         return new Response(JSON.stringify({ error: 'El correo electrónico ya está registrado en el sistema.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
       }
       throw authError
    }

    const newUserId = authData.user.id

    // 5. Actualizar o insertar el perfil con el rol seleccionado y activo
    // Dado que existe un trigger, el perfil podría ya existir. Usamos upsert.
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        email: email,
        role: role,
        role_id: targetRole.id,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })

    if (profileUpdateError) {
      console.error("Profile update error:", profileUpdateError)
      // No fallamos toda la request si falló la actualización del rol, 
      // pero devolvemos un warning, idealmente no debería fallar con Service Role.
      throw new Error(`Usuario creado en Auth pero falló al asignar rol: ${profileUpdateError.message}`)
    }

    return new Response(JSON.stringify({ success: true, user: authData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Edge Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
