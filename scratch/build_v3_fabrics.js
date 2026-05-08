import xlsx from 'xlsx';
import * as fs from 'fs';

// ─── Fuentes ──────────────────────────────────────────────────────────────────
const inventory = xlsx.readFile('./docs/export.xlsx');
const invData   = xlsx.utils.sheet_to_json(inventory.Sheets[inventory.SheetNames[0]], { defval: '' });

// ─── Extraer telas Rollux con stock ──────────────────────────────────────────
// SUBFAMILY válidas: "Roller Fabrics Blackouts", "Roller Fabrics Solar", etc.
// PRODUCT: GROLLERSHADE
// Excluir: Neolux, Vertical, Louverlux, Solar VX (que son Screen separado)
const FABRIC_PRODUCT = ['GROLLERSHADE'];
const FABRIC_SUBFAM  = ['roller fabrics blackouts', 'roller fabrics solar', 'roller fabrics', 'roller shade'];
const BLOCKED_DESC   = ['neolux', 'vertical', 'louver', 'bindercard', 'di rollux', 'solar entry'];

const fabrics = invData.filter(r => {
  const product = (r.PRODUCT || '').toLowerCase();
  const subfam  = (r.SUBFAMILY || '').toLowerCase();
  const desc    = (r.Description || '').toLowerCase();
  const qtyOH   = Number(r.QtyOH || 0);

  // Solo GROLLERSHADE con stock
  if (!FABRIC_PRODUCT.includes(r.PRODUCT)) return false;
  if (qtyOH <= 0) return false;
  if (BLOCKED_DESC.some(b => desc.includes(b))) return false;

  return true;
}).map(r => {
  // CROSSW = ancho en metros del rollo (ya viene en metros)
  // WITDH  = ancho del producto cortado en metros
  // LENGHT = largo del rollo en metros
  const crossW = Number(r.CROSSW) || 0;  // Ancho neto del rollo en metros
  return {
    sku:       r.ITEM,
    desc:      String(r.Description || '').trim(),
    subfamily: String(r.SUBFAMILY || '').trim(),
    color:     String(r.COLOR || '').trim(),
    unit:      String(r.UNIT || 'SQYD').trim(),
    crossW,                              // Ancho del rollo (metros)
    rollLength: Number(r.LENGHT) || 0,  // Largo del rollo (metros)
    cost:       Number(r.MostRecentCost) || 0,
    qtyOH:      Number(r.QtyOH) || 0,
    qtyTotal:   Number(r.QtyHandTotal) || 0,
  };
});

fs.writeFileSync('./src/data/v3-fabrics.json', JSON.stringify(fabrics, null, 2));

console.log(`✅ Catálogo de Telas V3: ${fabrics.length} telas con stock.\n`);
fabrics.slice(0, 20).forEach(f => {
  console.log(`[${f.sku}] ${f.desc.slice(0,50).padEnd(52)} CROSSW:${f.crossW}m  QtyOH:${f.qtyOH} SQYD  $${f.cost}/SQYD`);
});
