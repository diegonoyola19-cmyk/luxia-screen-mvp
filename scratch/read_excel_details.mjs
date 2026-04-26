import xlsx from 'xlsx';
import path from 'node:path';

const filePath = 'c:/Users/LAPTOP/OneDrive/Documentos/LUXIA/OrderEntrySAGE_1777137133.xlsx';
const workbook = xlsx.readFile(filePath);

const sheetName = 'Order_Details';
const sheet = workbook.Sheets[sheetName];

if (sheet) {
    const data = xlsx.utils.sheet_to_json(sheet, { range: 0, defval: '' });
    console.log(`Muestra de datos de "${sheetName}" (primeras 5 filas):`);
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
} else {
    console.log(`No se encontró la hoja "${sheetName}"`);
}
