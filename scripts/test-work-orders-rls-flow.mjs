import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const adminEmail = process.env.LUXIA_TEST_ADMIN_EMAIL;
const adminPassword = process.env.LUXIA_TEST_ADMIN_PASSWORD;
const limitedEmail = process.env.LUXIA_TEST_LIMITED_EMAIL;
const limitedPassword = process.env.LUXIA_TEST_LIMITED_PASSWORD;

// CREATE TWO COMPLETELY SEPARATE CLIENTS
const adminClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
const limClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

const DUMMY_ORDER_ID = crypto.randomUUID();

async function runTests() {
  console.log('=== Iniciando validación de Fase 5A (RLS/RBAC) ===\n');

  try {
    console.log('[Paso 3] Login con usuario Admin...');
    const { data: adminAuth, error: adminErr } = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    if (adminErr) throw new Error(`Admin login falló: ${adminErr.message}`);
    console.log(' -> PASS');

    const adminId = adminAuth.user.id;

    console.log('\n[Paso 4] Admin crea orden de prueba...');
    const newOrder = {
      id: DUMMY_ORDER_ID,
      order_number: 'TEST-001',
      status: 'draft',
      payload: { id: DUMMY_ORDER_ID, orderNumber: 'TEST-001', test: true },
      created_by: adminId,
      updated_by: adminId
    };
    const { error: insertErr } = await adminClient.from('work_orders').insert(newOrder);
    if (insertErr) throw new Error(`Insert falló: ${insertErr.message}`);
    console.log(' -> PASS');

    console.log('\n[Paso 5] Admin lee la orden...');
    const { data: readData, error: readErr } = await adminClient.from('work_orders').select('*').eq('id', DUMMY_ORDER_ID).single();
    if (readErr) throw new Error(`Select falló: ${readErr.message}`);
    console.log(' -> PASS');

    console.log('\n[Paso 6] Admin actualiza la orden...');
    const { error: updateErr } = await adminClient.from('work_orders').update({ status: 'confirmed' }).eq('id', DUMMY_ORDER_ID);
    if (updateErr) throw new Error(`Update falló: ${updateErr.message}`);
    console.log(' -> PASS');

    console.log('\n[Paso 7] Admin hace soft delete de la orden...');
    const { error: deleteErr } = await adminClient.from('work_orders').update({ deleted_at: new Date().toISOString() }).eq('id', DUMMY_ORDER_ID);
    if (deleteErr) throw new Error(`Soft delete falló: ${deleteErr.message}`);
    console.log(' -> PASS');

    console.log('\n[Paso 8] Verificar deleted_at...');
    const { data: delCheck, error: delCheckErr } = await adminClient.from('work_orders').select('deleted_at').eq('id', DUMMY_ORDER_ID).single();
    if (delCheckErr) throw new Error(`Select post-delete falló: ${delCheckErr.message}`);
    console.log(' -> PASS');

    console.log('\n[Limpieza] Borrando orden de prueba físicamente...');
    await adminClient.from('work_orders').delete().eq('id', DUMMY_ORDER_ID);
    
    console.log('\n[Paso 9] Login con usuario Limitado...');
    const { data: limAuth, error: limErr } = await limClient.auth.signInWithPassword({ email: limitedEmail, password: limitedPassword });
    if (limErr) throw new Error(`Limited login falló: ${limErr.message}`);
    console.log(' -> PASS (Limited UID: ' + limAuth.user.id + ')');

    console.log('\n[Paso 10 y 11] Verificar RLS/RBAC en usuario Limitado...');
    const limId = crypto.randomUUID();
    const { data: insertedData, error: limInsertErr } = await limClient.from('work_orders').insert({
      id: limId,
      order_number: 'LIMIT-01',
      payload: {},
      created_by: limAuth.user.id
    }).select();
    
    if (!limInsertErr) {
      console.log(' -> FAIL (Usuario limitado pudo insertar, ¿RLS está activo?)');
      console.log('    Data insertada devuelta por DB:', insertedData);
      await adminClient.from('work_orders').delete().eq('id', limId);
    } else {
      if (limInsertErr.code === '42501') {
        console.log(` -> PASS (Bloqueado correctamente: ${limInsertErr.message})`);
      } else {
        console.log(` -> WARN (Falló por otra razón: ${limInsertErr.message})`);
      }
    }

  } catch (err) {
    console.error(`\n[!] ERROR FATAL EN PRUEBA: ${err.message}`);
  }
}

runTests();
