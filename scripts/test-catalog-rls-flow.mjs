import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.VITE_SUPABASE_TEST_EMAIL;
const TEST_PASSWORD = process.env.VITE_SUPABASE_TEST_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Faltan variables de entorno para la prueba RLS.');
  process.exit(1);
}

const TABLES = [
  'catalog_items',
  'curtain_recipes',
  'recipe_components',
  'fabric_tone_rules'
];

async function runTests() {
  console.log('--- Iniciando prueba de RLS en Catálogos ---\n');

  // 1. Cliente Anónimo
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[Anon] Probando acceso sin autenticación...');

  for (const table of TABLES) {
    const { data: anonSelect, error: anonSelectError } = await anonClient.from(table).select('*').limit(1);
    if (anonSelectError) {
      console.log(`✅ [Anon] Bloqueado SELECT en ${table} (Esperado): ${anonSelectError.message}`);
    } else if (anonSelect?.length === 0) {
      console.log(`✅ [Anon] Bloqueado SELECT en ${table} (Devolvió 0 filas por RLS).`);
    } else {
      console.error(`❌ [Anon] ERROR: SELECT en ${table} devolvió datos. Se esperaba bloqueo RLS.`);
    }

    const { error: anonInsertError } = await anonClient.from(table).insert({ id: 'dummy', item_code: 'dummy' }).select();
    if (anonInsertError) {
      console.log(`✅ [Anon] Bloqueado INSERT en ${table} (Esperado): ${anonInsertError.message}`);
    } else {
      console.error(`❌ [Anon] ERROR: INSERT exitoso en ${table}. Se esperaba bloqueo RLS.`);
    }
  }

  // 2. Cliente Autenticado
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error('❌ [Auth] No se pudo iniciar sesión:', authError?.message);
    process.exit(1);
  }

  console.log('\n[Auth] Sesión iniciada con éxito. Probando acceso autenticado...');

  for (const table of TABLES) {
    const { data: authSelect, error: authSelectError } = await authClient.from(table).select('*').limit(1);
    if (authSelectError) {
      console.error(`❌ [Auth] ERROR: SELECT falló en ${table}:`, authSelectError.message);
    } else {
      console.log(`✅ [Auth] SELECT exitoso en ${table}.`);
    }

    const { error: authInsertError } = await authClient.from(table).insert({ id: 'dummy', item_code: 'dummy' }).select();
    if (authInsertError) {
      console.log(`✅ [Auth] Bloqueado INSERT en ${table} (Esperado): ${authInsertError.message}`);
    } else {
      console.error(`❌ [Auth] ERROR: INSERT exitoso en ${table}. Se esperaba bloqueo RLS.`);
    }
  }

  console.log('\n--- Pruebas RLS finalizadas ---');
  process.exit(0);
}

runTests().catch(console.error);
