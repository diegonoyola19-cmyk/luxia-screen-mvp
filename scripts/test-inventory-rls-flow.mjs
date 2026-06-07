import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually since we are in a raw Node script
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach((line) => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('FAIL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const adminEmail = process.env.LUXIA_TEST_ADMIN_EMAIL;
const adminPassword = process.env.LUXIA_TEST_ADMIN_PASSWORD;
const limitedEmail = process.env.LUXIA_TEST_LIMITED_EMAIL;
const limitedPassword = process.env.LUXIA_TEST_LIMITED_PASSWORD;

if (!adminEmail || !adminPassword || !limitedEmail || !limitedPassword) {
  console.error('FAIL: Faltan variables de entorno de prueba.');
  console.error('Por favor provee:');
  console.error('- LUXIA_TEST_ADMIN_EMAIL');
  console.error('- LUXIA_TEST_ADMIN_PASSWORD');
  console.error('- LUXIA_TEST_LIMITED_EMAIL');
  console.error('- LUXIA_TEST_LIMITED_PASSWORD');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TEST_ITEM_ID = '00000000-0000-0000-0000-000000001001';
const TEST_MOVEMENT_ID = '00000000-0000-0000-0000-000000001002';

async function runTest() {
  console.log('\n=== Iniciando validación de Fase 5B.1 (RLS/RBAC Inventario) ===\n');

  try {
    // 1. Limpieza inicial forzada (solo por seguridad, requiere admin)
    await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    await supabase.from('inventory_movements').delete().eq('id', TEST_MOVEMENT_ID);
    await supabase.from('inventory_items').delete().eq('id', TEST_ITEM_ID);
    await supabase.auth.signOut();

    // 2. Login Admin
    console.log('[Paso 1] Login con usuario Admin...');
    const { data: adminData, error: adminErr } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (adminErr) throw new Error(`Admin login failed: ${adminErr.message}`);
    console.log(' -> PASS');

    // 3. Crear Item (Admin)
    console.log('\n[Paso 2] Admin crea item de inventario de prueba...');
    const { error: insertErr } = await supabase.from('inventory_items').insert({
      id: TEST_ITEM_ID,
      category: 'fabric',
      kind: 'roll',
      code: 'TEST-FABRIC-001',
      status: 'available',
      payload: { test: true }
    });
    if (insertErr) throw new Error(`Insert item failed: ${insertErr.message}`);
    console.log(' -> PASS');

    // 4. Crear Movement (Admin)
    console.log('\n[Paso 3] Admin crea movimiento de prueba...');
    const { error: moveErr } = await supabase.from('inventory_movements').insert({
      id: TEST_MOVEMENT_ID,
      inventory_item_id: TEST_ITEM_ID,
      category: 'fabric',
      action: 'import',
      item_code: 'TEST-FABRIC-001',
      quantity: 10,
      unit: 'm'
    });
    if (moveErr) throw new Error(`Insert movement failed: ${moveErr.message}`);
    console.log(' -> PASS');

    // 5. Leer Item (Admin)
    console.log('\n[Paso 4] Admin lee el item...');
    const { data: readData, error: readErr } = await supabase.from('inventory_items').select('*').eq('id', TEST_ITEM_ID);
    if (readErr || !readData || readData.length === 0) throw new Error(`Read failed: ${readErr?.message || 'No data'}`);
    console.log(' -> PASS');

    // 6. Actualizar Item (Admin)
    console.log('\n[Paso 5] Admin actualiza el item...');
    const { error: updateErr } = await supabase.from('inventory_items').update({ status: 'reserved' }).eq('id', TEST_ITEM_ID);
    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);
    console.log(' -> PASS');

    // 7. Soft Delete (Admin) -> Actually we just test update of deleted_at since delete is physical only for admin.
    console.log('\n[Paso 6] Admin hace soft delete del item...');
    const { error: delErr } = await supabase.from('inventory_items').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('id', TEST_ITEM_ID);
    if (delErr) throw new Error(`Soft delete failed: ${delErr.message}`);
    console.log(' -> PASS');

    await supabase.auth.signOut();

    // 8. Login Limitado
    console.log('\n[Paso 7] Login con usuario Limitado...');
    const { data: limitData, error: limitErr } = await supabase.auth.signInWithPassword({
      email: limitedEmail,
      password: limitedPassword,
    });
    if (limitErr) throw new Error(`Limited login failed: ${limitErr.message}`);
    console.log(` -> PASS (Limited UID: ${limitData.user.id})`);

    // 9. Verificar bloqueo RLS en Insert Limitado
    console.log('\n[Paso 8] Verificar RLS/RBAC en usuario Limitado (Insertando)...');
    const { error: limitInsErr } = await supabase.from('inventory_items').insert({
      id: '00000000-0000-0000-0000-000000001003',
      category: 'tube',
      kind: 'bar',
      code: 'TEST-FAIL-001',
      status: 'available'
    });
    
    if (!limitInsErr) {
       console.error(' -> FAIL (Usuario limitado pudo insertar. ¿RLS está activo?)');
       throw new Error('RLS bypass detectado');
    } else if (limitInsErr.code === '42501') {
       console.log(` -> PASS (Bloqueado correctamente: ${limitInsErr.message})`);
    } else {
       console.warn(` -> WARNING (Bloqueado por otro motivo: ${limitInsErr.message})`);
    }

    // 10. Limpieza (Admin)
    console.log('\n[Limpieza] Borrando datos de prueba físicamente...');
    await supabase.auth.signOut();
    await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    await supabase.from('inventory_movements').delete().eq('id', TEST_MOVEMENT_ID);
    await supabase.from('inventory_items').delete().eq('id', TEST_ITEM_ID);
    await supabase.auth.signOut();
    console.log(' -> Limpieza OK');

    console.log('\n✅ RESULTADO: TODO PASS. RLS y tablas funcionan correctamente.');
  } catch (error) {
    console.error(`\n❌ ERROR EN EL TEST: ${error.message}`);
    process.exit(1);
  }
}

runTest();
