import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const testEmail = process.env.LUXIA_TEST_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL;
const testPassword = process.env.LUXIA_TEST_ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD;

const testLimitedEmail = process.env.LUXIA_TEST_LIMITED_EMAIL || process.env.TEST_LIMITED_EMAIL;
const testLimitedPassword = process.env.LUXIA_TEST_LIMITED_PASSWORD || process.env.TEST_LIMITED_PASSWORD;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan credenciales VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en entorno.');
  process.exit(1);
}

if (!testEmail || !testPassword) {
  console.error('❌ Faltan credenciales de Admin (LUXIA_TEST_ADMIN_EMAIL / LUXIA_TEST_ADMIN_PASSWORD).');
  process.exit(1);
}

if (!testLimitedEmail || !testLimitedPassword) {
  console.error('❌ Faltan credenciales Limitadas (LUXIA_TEST_LIMITED_EMAIL / LUXIA_TEST_LIMITED_PASSWORD).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log('Iniciando QA script para process_order_inventory_tx con YD2...');
  
  // ==========================================
  // PRUEBA DE USUARIO LIMITADO (SIN PERMISOS)
  // ==========================================
  console.log('\n--- Probando Rol Limitado ---');
  const { data: limitedAuth, error: limitedAuthError } = await supabase.auth.signInWithPassword({
    email: testLimitedEmail,
    password: testLimitedPassword,
  });

  if (limitedAuthError) {
    console.error('❌ Error de login limitado:', limitedAuthError.message);
    process.exit(1);
  }
  console.log('✅ Autenticado como limitado:', limitedAuth.user.email);

  const testOrderIdLimited = crypto.randomUUID();
  const testPayloadLimited = {
    id: testOrderIdLimited,
    orderNumber: `TEST-ORD-LIMITED-${Date.now()}`,
    status: 'ready_for_production',
    createdAt: new Date().toISOString()
  };
  const testPlanLimited = { items: [] };

  console.log('Llamando a RPC process_order_inventory_tx como limitado...');
  const { error: rpcErrorLimited } = await supabase.rpc('process_order_inventory_tx', {
    p_order_payload: testPayloadLimited,
    p_consumption_plan: testPlanLimited
  });

  if (rpcErrorLimited) {
    console.log('✅ Bloqueo correcto para usuario limitado. Error recibido:', rpcErrorLimited.message);
  } else {
    console.error('❌ FALLO CRITICO: El usuario limitado logró ejecutar el RPC de consumo sin error.');
    process.exit(1);
  }
  
  await supabase.auth.signOut();

  // ==========================================
  // PRUEBA DE USUARIO ADMIN (FLUJO YD2)
  // ==========================================
  console.log('\n--- Probando Rol Admin (yd2) ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('❌ Error de login Admin:', authError.message);
    process.exit(1);
  }
  console.log('✅ Autenticado como Admin:', authData.user.email);

  // 1. Crear item de prueba
  const fabricCode = 'TEST-FAB-YD2';
  const widthMeters = 2.5;
  const initialLengthMeters = 10;
  const initialAvailableYd2 = widthMeters * initialLengthMeters * 1.1959900463; // 29.89975

  const { data: rollData, error: rollError } = await supabase
    .from('inventory_items')
    .insert({
      category: 'fabric',
      kind: 'roll',
      code: fabricCode,
      status: 'available',
      payload: {
        width_meters: widthMeters,
        length_meters: initialLengthMeters,
        available_yd2: initialAvailableYd2
      },
      source: 'qa_script_yd2'
    })
    .select('id')
    .single();

  if (rollError) {
    console.error('❌ Error creando rollo de prueba:', rollError);
    process.exit(1);
  }
  console.log('✅ Rollo de prueba creado, ID:', rollData.id);

  // 2. Preparar payload de orden y plan (consumo en yd2)
  const testOrderId = crypto.randomUUID();
  const testOrderPayload = {
    id: testOrderId,
    orderNumber: `TEST-ORD-YD2-${Date.now()}`,
    status: 'ready_for_production',
    createdAt: new Date().toISOString()
  };

  const consumedAreaYd2 = 5.0; // 5 yd2 a consumir
  const testConsumptionPlan = {
    orderId: testOrderId,
    generatedAt: new Date().toISOString(),
    items: [
      {
        action: 'consume',
        category: 'fabric',
        itemCode: fabricCode,
        requiredQuantity: consumedAreaYd2,
        unit: 'yd2',
        widthMeters: widthMeters,
        source: 'qa_script_yd2',
        notes: 'Test QA YD2',
        payload: {
          consumedAreaYd2,
          rollWidthMeters: widthMeters
        }
      }
    ],
    warnings: []
  };

  // 3. Ejecutar RPC
  console.log('Llamando a RPC process_order_inventory_tx como Admin con yd2...');
  const { error: rpcError } = await supabase.rpc('process_order_inventory_tx', {
    p_order_payload: testOrderPayload,
    p_consumption_plan: testConsumptionPlan
  });

  if (rpcError) {
    console.error('❌ Error ejecutando RPC:', rpcError);
    process.exit(1);
  }
  console.log('✅ RPC ejecutado exitosamente.');

  // 4. Validar resultados en inventory_items
  const { data: updatedRoll } = await supabase
    .from('inventory_items')
    .select('payload')
    .eq('id', rollData.id)
    .single();

  const expectedYd2 = initialAvailableYd2 - consumedAreaYd2;
  const expectedLength = expectedYd2 / (widthMeters * 1.1959900463);
  
  console.log(`- available_yd2 esperado: ${expectedYd2}, actual: ${updatedRoll.payload.available_yd2}`);
  console.log(`- length_meters esperado: ${expectedLength}, actual: ${updatedRoll.payload.length_meters}`);

  if (Math.abs(updatedRoll.payload.available_yd2 - expectedYd2) > 0.001) {
    console.error('❌ Error: available_yd2 no se actualizó correctamente.');
    process.exit(1);
  }
  
  if (Math.abs(updatedRoll.payload.length_meters - expectedLength) > 0.001) {
    console.error('❌ Error: length_meters no se actualizó correctamente.');
    process.exit(1);
  }
  console.log('✅ Inventario actualizado correctamente en base a yd2.');

  // 5. Validar movements
  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('order_id', testOrderId);

  if (!movements || movements.length === 0) {
    console.error('❌ Error: No se generó inventory_movement.');
    process.exit(1);
  }

  const mov = movements[0];
  console.log(`- Movement quantity esperado: ${consumedAreaYd2}, actual: ${mov.quantity}`);
  console.log(`- Movement unit esperado: yd2, actual: ${mov.unit}`);

  if (Number(mov.quantity) !== consumedAreaYd2 || mov.unit !== 'yd2') {
    console.error('❌ Error: El movement no tiene quantity o unit correcta.');
    process.exit(1);
  }
  console.log('✅ Movimiento registrado correctamente en yd2.');

  // 6. Limpieza
  console.log('\nLimpiando datos de prueba...');
  await supabase.from('inventory_movements').delete().eq('order_id', testOrderId);
  await supabase.from('work_orders').delete().eq('id', testOrderId);
  await supabase.from('inventory_items').delete().eq('id', rollData.id);
  console.log('✅ Datos de prueba limpiados.');

  console.log('\n🚀 QA SCRIPT COMPLETADO CON ÉXITO');
}

runTest().catch(console.error);
