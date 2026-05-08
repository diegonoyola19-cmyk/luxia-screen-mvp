import xlsx from 'xlsx';
import * as fs from 'fs';

const workbook = xlsx.readFile('./docs/export.xlsx');
const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

// Ver todas las columnas disponibles
console.log('=== COLUMNAS DISPONIBLES ===');
if (data.length > 0) console.log(Object.keys(data[0]));

// Ver una fila de tela para saber los nombres exactos
const fabricRow = data.find(r => (r.Description || '').toLowerCase().includes('rollux') && (r.CROSSW || r.Width || r.WIDTH));
console.log('\n=== FILA DE TELA EJEMPLO ===');
console.log(JSON.stringify(fabricRow, null, 2));

// Ver si existe CROSSW o similar
const crosswKeys = Object.keys(data[0] || {}).filter(k => k.toLowerCase().includes('cross') || k.toLowerCase().includes('width') || k.toLowerCase().includes('witdh') || k.toLowerCase().includes('lenght'));
console.log('\n=== COLUMNAS DE ANCHO/LARGO ===', crosswKeys);

// Telas Rollux con stock
const fabrics = data.filter(r => {
  const desc = (r.Description || '').toLowerCase();
  const hasRollux = desc.includes('rollux') && !desc.includes('di rollux') && !desc.includes('bindercard');
  const hasStock = Number(r.QtyOH || 0) > 0;
  return hasRollux && hasStock;
}).slice(0, 5);

console.log('\n=== TELAS CON STOCK (muestra) ===');
fabrics.forEach(f => console.log(JSON.stringify(f)));
