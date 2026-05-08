import xlsx from 'xlsx';
import * as fs from 'fs';

const margins = xlsx.readFile('./docs/ANALISIS DE MARGENES DE PRODUCCION.xlsx');
const mData   = xlsx.utils.sheet_to_json(margins.Sheets[margins.SheetNames[0]], { defval: '' });

const SKU_COL  = 'ANALISIS DE PRODUCCION';
const DESC_COL = '__EMPTY';
const QTY_COL  = '__EMPTY_1';
const COST_COL = '__EMPTY_2';

function isValidSku(val) {
  if (!val || typeof val !== 'string') return false;
  const t = val.trim();
  return /^[0-9]+-/.test(t) || /^[A-Z]{2,}-/.test(t) || /^6-/.test(t);
}

// Leer todos los proyectos con sus componentes
let currentProject = '';
const projects = {};

for (const row of mData) {
  const col0 = String(row[SKU_COL] || '').trim();
  const col1 = String(row[DESC_COL] || '').trim();

  if (col0 && !isValidSku(col0) && col0 !== 'CODIGOS' && isNaN(Number(col0)) && col0 !== '') {
    currentProject = col0;
    if (!projects[currentProject]) projects[currentProject] = { items: [], description: col1 };
    continue;
  }

  if (!isValidSku(col0)) continue;
  if (!projects[currentProject]) continue;
  projects[currentProject].items.push({ sku: col0, desc: col1 });
}

console.log('=== PROYECTOS ENCONTRADOS ===');
Object.entries(projects).forEach(([name, data]) => {
  console.log(`\n📦 ${name}: ${data.description}`);
  data.items.slice(0, 3).forEach(i => console.log(`  - ${i.sku} | ${i.desc.slice(0, 60)}`));
  if (data.items.length > 3) console.log(`  ... y ${data.items.length - 3} más`);
});
