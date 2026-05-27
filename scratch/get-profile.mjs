import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local manually for Node.js
const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No se encontró el archivo .env.local en la raíz del proyecto.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    envVars[key] = value.trim();
  }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseAnonKey = envVars['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const email = 'diego.hernandez@vertilux.com';
  const password = 'Di3go2026*';

  console.log(`⏳ Intentando iniciar sesión como ${email}...`);
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('❌ Error de autenticación:', authError);
      console.error('Mensaje completo:', JSON.stringify(authError, null, 2));
      process.exit(1);
    }

    console.log('✅ Autenticación exitosa! ID de usuario:', authData.user.id);

    console.log('⏳ Consultando perfiles...');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('❌ Error al consultar perfil:', profileError);
    } else if (profileData) {
      console.log('\n🔍 Perfil encontrado:');
      console.log(JSON.stringify(profileData, null, 2));
    } else {
      console.log('\n❌ No se encontró ningún perfil con ese correo.');
    }
  } catch (e) {
    console.error('❌ Excepción durante ejecución:', e);
  }
}

run();
