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

// Get arguments
const args = process.argv.slice(2);
const email = args[0];
const password = args[1];

if (!email || !password) {
  console.log('\n📖 Uso del Script:');
  console.log('node scratch/create-first-user.mjs <correo> <contraseña>\n');
  console.log('Ejemplo:');
  console.log('node scratch/create-first-user.mjs administrador@luxia.com MiClaveSegura123\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log(`⏳ Registrando cuenta para: ${email}...`);
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('❌ Error de registro en Supabase:', error.message);
    process.exit(1);
  }

  if (data?.user) {
    console.log('\n======================================================');
    console.log('✅ ¡Cuenta creada exitosamente en Supabase Auth!');
    console.log(`📧 Usuario: ${email}`);
    console.log('======================================================\n');
    console.log('👉 NOTA IMPORTANTE (ASIGNACIÓN DE ROL):');
    console.log('Por defecto, el usuario se ha registrado con el rol "consulta" (solo lectura).');
    console.log('Para elevar tu cuenta a "admin", por favor ejecuta esta consulta SQL en el panel de Supabase:');
    console.log(`\n  update public.profiles set role = 'admin' where email = '${email}';\n`);
  }
}

run();
