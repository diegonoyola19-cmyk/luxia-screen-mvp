import xlsx from 'xlsx';
import path from 'node:path';

const filePath = 'c:/Users/LAPTOP/OneDrive/Documentos/LUXIA/OrderEntrySAGE_1777137133.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetNames = workbook.SheetNames;

console.log('Hojas disponibles:', sheetNames);

const firstSheet = workbook.Sheets[sheetNames[0]];
const data = xlsx.utils.sheet_to_json(firstSheet, { range: 0, defval: '' });

console.log('Muestra de datos (primeras 5 filas):');
console.log(JSON.stringify(data.slice(0, 5), null, 2));
