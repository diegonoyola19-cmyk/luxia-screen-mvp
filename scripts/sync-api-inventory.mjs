import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { mapVertiluxApiInventoryItem } from '../src/logic/mapVertiluxApiInventoryItem.ts';
import { planSyncForItem, buildUpsertPayload } from '../src/logic/syncVertiluxInventoryPlan.ts';

const args = process.argv.slice(2);
const isDryRun = !args.includes('--commit');
const limitArgIndex = args.indexOf('--limit');
const limit = limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1], 10) : Infinity;

async function main() {
  const apiKey = process.env.VERTILUX_API_KEY;
  const user = process.env.VERTILUX_API_USER;
  const password = process.env.VERTILUX_API_PASSWORD;
  const country = process.env.VERTILUX_API_COUNTRY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) throw new Error('Missing VERTILUX_API_KEY');
  if (!user) throw new Error('Missing VERTILUX_API_USER');
  if (!password) throw new Error('Missing VERTILUX_API_PASSWORD');
  if (!country) throw new Error('Missing VERTILUX_API_COUNTRY');
  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_URL');
  if (!supabaseKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Fetching data from Vertilux API...');
  const response = await fetch('http://ims.vertilux.com/api/catp/catp.php', {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      'X-USER': user,
      'X-PASSWORD': password,
      'X-COUNTRY': country,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  const dataRows = await response.json();
  console.log(`Fetched ${dataRows.length} total items from API.`);

  // We need to fetch existing inventory items that are from API (virtual rolls)
  // to avoid large payloads, we only fetch id, code, payload, and we count movements.
  console.log('Fetching existing inventory_items from Supabase...');
  const { data: existingData, error: existingError } = await supabase
    .from('inventory_items')
    .select('id, code, status, payload, inventory_movements(count)')
    .eq('category', 'fabric')
    .eq('kind', 'roll');

  if (existingError) {
    throw new Error(`Error fetching existing items: ${existingError.message}`);
  }

  // Build a map of existing items
  // We only consider virtual rolls.
  const existingMap = new Map();
  for (const item of existingData) {
    if (item.payload?.isVirtualRoll && item.payload?.source === 'vertilux_api') {
      const movementsCount = Array.isArray(item.inventory_movements)
        ? item.inventory_movements[0]?.count ?? 0
        : item.inventory_movements?.count ?? 0;
      
      existingMap.set(item.code, {
        id: item.id,
        code: item.code,
        status: item.status,
        payload: item.payload,
        movements_count: movementsCount,
      });
    }
  }

  console.log(`Found ${existingMap.size} existing virtual rolls in Supabase.`);

  const summary = {
    totalApiItems: dataRows.length,
    mappedSuccess: 0,
    skipped: 0,
    inserted: 0,
    updated: 0,
    needsReconciliation: 0,
    failed: 0,
    skippedByReason: {},
    mappedPositiveYd2: 0,
    mappedZeroYd2: 0,
  };

  let processedCount = 0;
  const syncTimestamp = new Date().toISOString();

  const mappedItemsList = [];
  const notFabricSamples = [];
  const unitAmbiguousSamples = [];
  const positiveUnits = new Map();
  const positiveWidths = new Map();

  for (const rawItem of dataRows) {
    if (processedCount >= limit) break;

    const mappedResult = mapVertiluxApiInventoryItem(rawItem, syncTimestamp);
    
    if (!mappedResult.success) {
      summary.skipped++;
      summary.skippedByReason[mappedResult.reason] = (summary.skippedByReason[mappedResult.reason] || 0) + 1;
      
      if (mappedResult.reason === 'NOT_FABRIC' && notFabricSamples.length < 10) {
        notFabricSamples.push({ code: rawItem.ITEMNO, description: rawItem.DESCRIPTION });
      } else if (mappedResult.reason === 'UNIT_AMBIGUOUS' && unitAmbiguousSamples.length < 10) {
        unitAmbiguousSamples.push({ code: rawItem.ITEMNO, description: rawItem.DESCRIPTION, unit: rawItem.UNIT });
      }
      
      continue;
    }

    summary.mappedSuccess++;
    processedCount++;

    const itemPayload = mappedResult.item.payload;
    mappedItemsList.push(mappedResult.item);

    if (itemPayload.available_yd2 > 0) {
      summary.mappedPositiveYd2++;
      positiveUnits.set(itemPayload.apiUnit, (positiveUnits.get(itemPayload.apiUnit) || 0) + 1);
      positiveWidths.set(itemPayload.width_meters, (positiveWidths.get(itemPayload.width_meters) || 0) + 1);
    } else {
      summary.mappedZeroYd2++;
    }

    const existingItem = existingMap.get(mappedResult.item.code);
    const plan = planSyncForItem(mappedResult, existingItem);
    const upsertPayload = buildUpsertPayload(plan, existingItem);

    if (plan.action === 'skip') {
      summary.skipped++;
      summary.skippedByReason[plan.reason] = (summary.skippedByReason[plan.reason] || 0) + 1;
      continue;
    }

    if (plan.action === 'insert') summary.inserted++;
    else if (plan.action === 'update') summary.updated++;
    else if (plan.action === 'reconcile') summary.needsReconciliation++;

    if (!isDryRun && upsertPayload) {
      const { error } = await supabase
        .from('inventory_items')
        .upsert(upsertPayload, { onConflict: 'id' });
      
      if (error) {
        console.error(`Error upserting ${upsertPayload.code || upsertPayload.id}:`, error.message);
        summary.failed++;
      }
    }
  }

  // Sort by highest available_yd2
  mappedItemsList.sort((a, b) => b.payload.available_yd2 - a.payload.available_yd2);
  const top20 = mappedItemsList.slice(0, 20);

  console.log('\n--- RESUMEN DE SINCRONIZACIÓN ---');
  console.log(`Modo Dry-Run: ${isDryRun ? 'SÍ (No se escribió en BD)' : 'NO (Cambios aplicados)'}`);
  console.log(`Límite procesado: ${limit === Infinity ? 'Ninguno' : limit}`);
  console.log(`Total API Items: ${summary.totalApiItems}`);
  console.log(`Mapped Success: ${summary.mappedSuccess}`);
  console.log(`  > Con Stock Positivo: ${summary.mappedPositiveYd2}`);
  console.log(`  > Con Stock Cero: ${summary.mappedZeroYd2}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Needs Reconciliation: ${summary.needsReconciliation}`);
  console.log(`Failed Upserts: ${summary.failed}`);
  
  console.log('\nRazones de salto (Skipped):');
  for (const [reason, count] of Object.entries(summary.skippedByReason)) {
    console.log(`  - ${reason}: ${count}`);
  }

  console.log('\nUnidades en items con stock > 0:');
  for (const [unit, count] of positiveUnits.entries()) {
    console.log(`  - ${unit || 'N/A'}: ${count} ítems`);
  }

  console.log('\nAnchos (metros) en items con stock > 0:');
  for (const [width, count] of positiveWidths.entries()) {
    console.log(`  - ${width}m: ${count} ítems`);
  }

  console.log('\n--- TOP 20 TELAS CON MAYOR STOCK (available_yd2) ---');
  top20.forEach((item, index) => {
    const p = item.payload;
    console.log(`${index + 1}. ${item.code} | ${p.description}`);
    console.log(`   UNIT: ${p.apiUnit} | OnHand: ${p.apiQtyOnHand} | SalOrdr: ${p.apiQtySalesOrder} | apiAvailableRaw: ${p.apiAvailableRaw}`);
    console.log(`   Width: ${p.width_meters}m | Length: ${p.length_meters.toFixed(2)}m | YD2: ${p.available_yd2.toFixed(2)}`);
    console.log(`   Family: ${p.family} | Openness: ${p.openness} | Color: ${p.color}`);
  });

  console.log('\n--- 10 MUESTRAS DE NOT_FABRIC (Podrían ser telas?) ---');
  notFabricSamples.forEach(s => console.log(`  - ${s.code}: ${s.description}`));

  console.log('\n--- 10 MUESTRAS DE UNIT_AMBIGUOUS ---');
  unitAmbiguousSamples.forEach(s => console.log(`  - ${s.code}: ${s.description} (Unit: ${s.unit})`));
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
