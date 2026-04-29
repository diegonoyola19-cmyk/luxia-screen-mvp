import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'sb_publishable_aD8XF6Xy9tcJgkB0kealKA_Za7VCHVW';
const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 100;

async function migrateCatalog() {
  console.log('📦 Cargando catálogo local...');

  const raw = readFileSync('src/data/luxia-item-catalog.json', 'utf-8');
  const catalog = JSON.parse(raw);
  const items = catalog.items;

  console.log(`   → ${items.length} items encontrados`);

  // Verificar si ya hay datos
  const { count } = await supabase
    .from('catalog_items')
    .select('*', { count: 'exact', head: true });

  if (count > 0) {
    console.log(`⚠️  Ya existen ${count} items en Supabase.`);
    console.log('   Limpiando tabla para reimportar...');
    await supabase.from('catalog_items').delete().neq('item_code', '');
    console.log('   ✅ Tabla limpiada.');
  }

  // Preparar filas en el formato de Supabase
  const rows = items.map(item => ({
    item_code:       item.itemCode,
    sage_item_code:  item.sageItemCode ?? item.itemCode,
    description:     item.description,
    category:        item.category ?? 'other',
    color:           item.color ?? null,
    unit:            item.unit ?? 'EA',
    avg_cost:        item.avgCost ?? 0,
    image_url:       item.imageUrl ?? null,
  }));

  // Insertar en lotes de 100
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('catalog_items').insert(batch);

    if (error) {
      console.error(`❌ Error en lote ${i}-${i + BATCH_SIZE}:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    process.stdout.write(`\r   → Insertados: ${inserted}/${rows.length}`);
  }

  console.log(`\n✅ Migración completa: ${inserted} items subidos a Supabase.`);
}

migrateCatalog().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
