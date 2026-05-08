import xlsx from 'xlsx';
import * as fs from 'fs';

try {
  const workbook = xlsx.readFile('./docs/ANALISIS DE MARGENES DE PRODUCCION.xlsx');
  console.log('Sheet Names:', workbook.SheetNames);

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  console.log('Total Rows:', data.length);
  if (data.length > 0) {
    fs.writeFileSync('./scratch/analysis_margenes.json', JSON.stringify(data, null, 2));
  }
} catch (err) {
  console.error(err);
}
