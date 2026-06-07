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
  console.log('iniciando QA script para process_order_inventory_tx...');
  
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
  // PRUEBA DE USUARIO ADMIN (FLUJO COMPLETO)
  // ==========================================
  console.log('\n--- Probando Rol Admin ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('❌ Error de login Admin:', authError.message);
    process.exit(1);
  }
  console.log('✅ Autenticado como Admin:', authData.user.email);

  // 2. Preparar un item de inventario de prueba (Rollo de tela)
  const fabricCode = 'TEST-FAB-01';
  const widthMeters = 3.0;
  
  const { data: rollData, error: rollError } = await supabase
    .from('inventory_items')
    .insert({
      category: 'fabric',
      kind: 'roll',
      code: fabricCode,
      status: 'available',
      payload: {
        width_meters: widthMeters,
        length_meters: 50.0
      }
    })
    .select()
    .single();

  if (rollError) {
    console.error('❌ Error creando rollo de prueba:', rollError);
    process.exit(1);
  }
  const testRollId = rollData.id;
  console.log('✅ Rollo de prueba creado con 50m:', testRollId);

  // 3. Preparar retazo de prueba para 'use_scrap'
  const { data: scrapData, error: scrapError } = await supabase
    .from('inventory_items')
    .insert({
      category: 'fabric',
      kind: 'scrap',
      code: fabricCode,
      status: 'available',
      payload: {
        width_meters: 1.5,
        length_meters: 1.0
      }
    })
    .select()
    .single();

  if (scrapError) {
    console.error('❌ Error creando retazo de prueba:', scrapError);
    process.exit(1);
  }
  const testScrapId = scrapData.id;
  console.log('✅ Retazo de prueba creado:', testScrapId);

  // 4. Preparar Payload y Consumption Plan
  const orderId = crypto.randomUUID();
  const orderPayload = {
    id: orderId,
    orderNumber: `TEST-ORD-${Date.now()}`,
    status: 'ready_for_production',
    createdAt: new Date().toISOString()
  };

  const consumptionPlan = {
    items: [
      {
        action: 'consume',
        category: 'fabric',
        itemCode: fabricCode,
        requiredQuantity: 10.0,
        unit: 'm',
        widthMeters: 3.0,
        notes: 'Consumo normal de rollo'
      },
      {
        action: 'use_scrap',
        category: 'fabric',
        itemCode: fabricCode,
        requiredQuantity: 1.0,
        unit: 'pcs',
        specificInventoryItemId: testScrapId,
        notes: 'Consumo de retazo'
      },
      {
        action: 'create_scrap',
        category: 'fabric',
        itemCode: fabricCode,
        requiredQuantity: 1.2,
        unit: 'm',
        widthMeters: 1.0,
        notes: 'Sobrante generado'
      }
    ]
  };

  console.log('Llamando a RPC process_order_inventory_tx como Admin...');
  const { error: rpcError } = await supabase.rpc('process_order_inventory_tx', {
    p_order_payload: orderPayload,
    p_consumption_plan: consumptionPlan
  });

  let passAdmin = false;

  if (rpcError) {
    console.error('❌ Error llamando a RPC:', rpcError);
  } else {
    console.log('✅ RPC ejecutado correctamente.');
    passAdmin = true;
    
    // Verificaciones
    const { data: updatedRoll } = await supabase.from('inventory_items').select('payload').eq('id', testRollId).single();
    if (updatedRoll?.payload?.length_meters === 40) {
      console.log('✅ Stock de rollo descontado correctamente (quedan 40m).');
    } else {
      console.error('❌ Stock de rollo incorrecto:', updatedRoll);
      passAdmin = false;
    }

    const { data: updatedScrap } = await supabase.from('inventory_items').select('status').eq('id', testScrapId).single();
    if (updatedScrap?.status === 'used') {
      console.log('✅ Retazo marcado como usado.');
    } else {
      console.error('❌ Estado del retazo incorrecto:', updatedScrap);
      passAdmin = false;
    }

    const { data: movements } = await supabase.from('inventory_movements').select('*').eq('order_id', orderId);
    if (movements && movements.length === 3) {
      console.log('✅ 3 movimientos de inventario creados correctamente.');
      const createScrapMov = movements.find(m => m.action === 'create_scrap');
      if (createScrapMov) {
        console.log('✅ create_scrap registrado en movimientos.');
      } else {
        passAdmin = false;
      }
    } else {
      console.error('❌ Movimientos generados incorrectos:', movements);
      passAdmin = false;
    }
    
    const { data: newScraps } = await supabase.from('inventory_items').select('*').eq('created_from_order_id', orderId);
    if (newScraps && newScraps.length === 1) {
      console.log('✅ Retazo sobrante (create_scrap) insertado en inventory_items correctamente.');
    } else {
      console.error('❌ Error: No se creó el retazo sobrante en inventory_items.');
      passAdmin = false;
    }

    console.log('Probando idempotencia (doble consumo)...');
    const { error: rpcError2 } = await supabase.rpc('process_order_inventory_tx', {
      p_order_payload: orderPayload,
      p_consumption_plan: consumptionPlan
    });
    if (rpcError2) {
      console.log('❌ Falló idempotencia:', rpcError2);
      passAdmin = false;
    } else {
      console.log('✅ RPC es idempotente, no generó error.');
      const { data: doubleMovements } = await supabase.from('inventory_movements').select('*').eq('order_id', orderId);
      if (doubleMovements && doubleMovements.length === 3) {
        console.log('✅ No hubo duplicación de movimientos.');
      } else {
        console.error('❌ Se duplicaron movimientos.');
        passAdmin = false;
      }
    }
  }

  // 5. Cleanup
  console.log('\nLimpiando datos de prueba...');
  await supabase.from('inventory_movements').delete().eq('order_id', orderId);
  await supabase.from('inventory_items').delete().eq('created_from_order_id', orderId);
  await supabase.from('inventory_items').delete().eq('id', testScrapId);
  await supabase.from('inventory_items').delete().eq('id', testRollId);
  await supabase.from('work_orders').delete().eq('id', orderId);
  console.log('✅ Limpieza completada.');

  if (!passAdmin) {
    console.error('❌ Pruebas de Admin fallaron.');
    process.exit(1);
  }

  console.log('\n🚀 TODAS LAS PRUEBAS QA COMPLETADAS EXITOSAMENTE 🚀');
}

runTest().catch(console.error);
