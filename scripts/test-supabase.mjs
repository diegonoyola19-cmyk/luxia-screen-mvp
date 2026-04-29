import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'sb_publishable_aD8XF6Xy9tcJgkB0kealKA_Za7VCHVW';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Probando conexión a Supabase...');

const { data, error } = await supabase.from('catalog_items').select('count').limit(1);

if (error) {
  console.error('❌ Error de conexión:', error.message);
  console.error('Detalle:', error);
} else {
  console.log('✅ Conexión exitosa!');
  console.log('Tablas accesibles. catalog_items está lista.');
}

// Verificar las demás tablas
const tables = ['curtain_recipes', 'recipe_components', 'fabric_tone_rules'];
for (const table of tables) {
  const { error: err } = await supabase.from(table).select('count').limit(1);
  if (err) {
    console.error(`❌ ${table}: ${err.message}`);
  } else {
    console.log(`✅ ${table}: OK`);
  }
}
