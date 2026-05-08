import xlsx from 'xlsx';
import * as fs from 'fs';

const wb = xlsx.readFile('./docs/reglas nuevas.xlsx');
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

// ─── Parsear el rango min/max a número ────────────────────────────────────────
function parseM(v) {
  return parseFloat(String(v).replace(/[^\d.]/g, '')) || 0;
}

// ─── Detectar color_key a partir del SKU base ─────────────────────────────────
function getColorKey(skuBase) {
  if (!/X/i.test(skuBase)) return null;
  if (skuBase.includes('AL-CL'))  return 'bottomrail'; // CL[X]19
  if (skuBase.includes('CH-'))    return 'cadena';      // CH-[XXX]H0
  if (skuBase.includes('CL-V'))   return 'control';     // CL-V20[XX]
  if (skuBase.includes('CA-001')) return 'pesa';        // CA-001[XX]
  if (skuBase.includes('RE-'))    return 'tapaderas';   // RE-[XXX]00
  if (skuBase.includes('CA-100')) return 'topes';       // CA-100[XX]
  return null;
}

// ─── Detectar unidad de medida ────────────────────────────────────────────────
function getUnidad(tipo) {
  if (tipo === 'Descuento (mm)' || tipo === 'Factor (alto)') return 'm';
  return 'EA';
}

// ─── Agrupar por rango ────────────────────────────────────────────────────────
const rangoMap = new Map();

for (const row of rows) {
  const minStr = String(row['Rango_Ancho_Min'] || '').trim();
  const maxStr = String(row['Rango_Ancho_Max'] || '').trim();
  const key    = `${minStr}|${maxStr}`;

  if (!rangoMap.has(key)) {
    rangoMap.set(key, {
      categoria:   String(row['Categoria'] || 'Roller').trim(),
      rango_min_m: parseM(minStr),
      rango_max_m: parseM(maxStr),
      componentes: [],
    });
  }

  const skuBase    = String(row['SKU_Sugerido']   || '').trim();
  const tipo       = String(row['Tipo']            || '').trim();
  const componente = String(row['Componente_Tipo'] || '').trim();
  const valor      = Number(row['Valor'])          || 0;
  const reglas     = String(row['Reglas_Adicionales'] || '').trim();
  const colorKey   = getColorKey(skuBase);
  const unidad     = getUnidad(tipo);

  rangoMap.get(key).componentes.push({
    componente_tipo: componente,
    sku_base:        skuBase,
    valor,
    tipo_calculo:    tipo,
    unidad,
    color_key:       colorKey,
    reglas,
  });
}

const output = Array.from(rangoMap.values());

fs.writeFileSync('./src/data/roller-bom-rules.json', JSON.stringify(output, null, 2));

console.log(`\n✅ roller-bom-rules.json generado: ${output.length} rangos\n`);
output.forEach(r => {
  console.log(`  ${r.rango_min_m}m – ${r.rango_max_m}m: ${r.componentes.length} componentes`);
  r.componentes.forEach(c => console.log(`    ${c.componente_tipo.padEnd(40)} SKU: ${c.sku_base}  color_key: ${c.color_key ?? 'null'}`));
  console.log('');
});
