import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://cisxgxttmfpxoslepybp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDI5NDUsImV4cCI6MjA5Mjk3ODk0NX0.CZNypNOAjp5QBJsPFBgq03V1cvNdvJtxRf4TBuVS5Kc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Load JSON catalog
  const raw = fs.readFileSync('src/data/luxia-item-catalog.json', 'utf8');
  const catalog = JSON.parse(raw);
  const items = catalog.items;

  console.log(`Uploading ${items.length} items to Supabase...`);

  // Map camelCase -> snake_case for Supabase
  const rows = items.map((item) => ({
    item_code:          item.itemCode,
    sage_item_code:     item.sageItemCode,
    description:        item.description,
    unit:               item.unit,
    avg_cost:           item.avgCost,
    sale_price:         item.salePrice,
    image_url:          item.imageUrl,
    category:           item.category,
    suggested_category: item.suggestedCategory,
    color:              item.color,
    suggested_color:    item.suggestedColor,
  }));

  // Upsert in batches of 200
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('catalog_items')
      .upsert(batch, { onConflict: 'item_code' });

    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  ✓ ${inserted}/${rows.length}`);
  }

  console.log('Done!');
}

main().catch(console.error);
