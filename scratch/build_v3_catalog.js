import xlsx from 'xlsx';
import * as fs from 'fs';

// ─── Leer archivos ────────────────────────────────────────────────────────────
const margins   = xlsx.readFile('./docs/ANALISIS DE MARGENES DE PRODUCCION.xlsx');
const mData     = xlsx.utils.sheet_to_json(margins.Sheets[margins.SheetNames[0]], { defval: '' });
const inventory = xlsx.readFile('./docs/export.xlsx');
const invData   = xlsx.utils.sheet_to_json(inventory.Sheets[inventory.SheetNames[0]], { defval: '' });

// ─── Índice de inventario por SKU ─────────────────────────────────────────────
const invMap = {};
for (const r of invData) {
  const sku = String(r.ITEM || '').trim();
  if (sku) invMap[sku] = {
    mostRecentCost: Number(r.MostRecentCost) || 0,
    qtyOH:          Number(r.QtyOH || r.QTYOH || r['Qty On Hand'] || 0),
    uom:            String(r.UOM || '').trim(),
    family:         String(r.Family || '').trim(),
    desc:           String(r.Description || '').trim(),
  };
}

// ─── Proyectos ROLLER: identificados por descripción del encabezado ───────────
// Los proyectos Roller tienen en su descripción: ROLLUX, PREMIUM, PINPOINTE, VX, SCREEN, SOLAR
const ROLLER_KEYWORDS = ['rollux', 'premium', 'pinpointe', 'vx screen', 'vx 1', 'vx 3', 'solar screen'];
const NEOLUX_KEYWORDS = ['neolux', 'neollux', 'mykonos', 'bahia', 'glamour', 'louverlux', 'louverwood'];

function isRollerProject(description) {
  const d = description.toLowerCase();
  return ROLLER_KEYWORDS.some(k => d.includes(k)) && !NEOLUX_KEYWORDS.some(k => d.includes(k));
}

function isValidSku(val) {
  if (!val || typeof val !== 'string') return false;
  const t = val.trim();
  return /^0-\d/.test(t) || /^6-\d/.test(t);
}

// ─── Parsear proyectos ────────────────────────────────────────────────────────
const SKU_COL = 'ANALISIS DE PRODUCCION';
const DESC_COL = '__EMPTY';
const QTY_COL  = '__EMPTY_1';
const COST_COL = '__EMPTY_2';

let currentProject = '';
let isRollerCtx    = false;
const rollerSkuMap = {};   // sku -> { desc, totalQty, costAvg, projects[] }

for (const row of mData) {
  const col0 = String(row[SKU_COL] || '').trim();
  const col1 = String(row[DESC_COL] || '').trim();

  if (col0 && !isValidSku(col0) && col0 !== 'CODIGOS' && isNaN(Number(col0)) && col0 !== '') {
    currentProject = col0;
    isRollerCtx    = isRollerProject(col0) || isRollerProject(col1);
    continue;
  }

  if (!isRollerCtx) continue;
  if (!isValidSku(col0)) continue;

  const sku  = col0;
  const desc = col1;
  const qty  = Number(row[QTY_COL]) || 0;
  const cost = Number(row[COST_COL]) || 0;

  // Excluir componentes Neolux aunque estén en un proyecto roller (ej: Cassette Neolux)
  const descLow = desc.toLowerCase();
  if (NEOLUX_KEYWORDS.some(k => descLow.includes(k))) continue;
  if (descLow.includes('louverlux') || descLow.includes('louverwood')) continue;

  if (!rollerSkuMap[sku]) {
    rollerSkuMap[sku] = { sku, desc, totalQty: 0, costAvg: 0, costSum: 0, count: 0, projects: [] };
  }
  rollerSkuMap[sku].totalQty += qty;
  rollerSkuMap[sku].costSum  += cost;
  rollerSkuMap[sku].count    += 1;
  rollerSkuMap[sku].costAvg   = rollerSkuMap[sku].costSum / rollerSkuMap[sku].count;
  rollerSkuMap[sku].projects.push(currentProject);
}

// ─── Cruzar con inventario actual ─────────────────────────────────────────────
const finalCatalog = Object.values(rollerSkuMap).map(comp => {
  const live = invMap[comp.sku] || {};
  const desc = live.desc || comp.desc;
  return {
    sku:     comp.sku,
    desc:    desc.trim(),
    family:  live.family || 'Roller (Historical)',
    cost:    live.mostRecentCost > 0 ? live.mostRecentCost : comp.costAvg,
    costHistorical: parseFloat(comp.costAvg.toFixed(4)),
    qtyOH:   typeof live.qtyOH === 'number' ? live.qtyOH : 0,
    uom:     live.uom || '',
    projects: [...new Set(comp.projects)],
    usageCount: comp.count,
  };
});

fs.writeFileSync('./src/data/v3-catalog.json', JSON.stringify(finalCatalog, null, 2));

console.log(`\n✅ Catálogo V3 (Roller Only): ${finalCatalog.length} SKUs extraídos del historial real.\n`);
console.log('SKU'.padEnd(25), 'Stock'.padEnd(14), 'Costo'.padEnd(10), 'Descripción');
console.log('-'.repeat(95));
finalCatalog.forEach(c => {
  const stock = c.qtyOH > 0 ? `✅ ${c.qtyOH}` : '❌ SIN STOCK';
  console.log(
    c.sku.padEnd(25),
    stock.padEnd(14),
    `$${c.cost.toFixed(2)}`.padEnd(10),
    c.desc.slice(0, 55)
  );
});
