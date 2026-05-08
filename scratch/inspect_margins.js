import xlsx from 'xlsx';
import * as fs from 'fs';

// 1. Leer ANALISIS DE MARGENES
const margins = xlsx.readFile('./docs/ANALISIS DE MARGENES DE PRODUCCION.xlsx');
const mSheet = margins.Sheets[margins.SheetNames[0]];
const mData = xlsx.utils.sheet_to_json(mSheet, { defval: '' });

console.log('=== COLUMNAS DEL ARCHIVO DE MÁRGENES ===');
if (mData.length > 0) {
  console.log(Object.keys(mData[0]));
}
console.log(`Total filas: ${mData.length}`);
console.log('\n=== PRIMERAS 5 FILAS ===');
mData.slice(0, 5).forEach((r, i) => console.log(`Fila ${i+1}:`, JSON.stringify(r)));
