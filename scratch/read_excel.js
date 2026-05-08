import xlsx from 'xlsx';
import * as fs from 'fs';

try {
  const workbook = xlsx.readFile('./docs/export.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  // Let's find tubes
  const tubes = data.filter(r => r.Description && r.Description.toLowerCase().includes('tube'));
  const mechs = data.filter(r => r.Description && (r.Description.toLowerCase().includes('mech') || r.Description.toLowerCase().includes('clutch')));
  const brackets = data.filter(r => r.Description && r.Description.toLowerCase().includes('bracket'));

  fs.writeFileSync('./scratch/analysis.json', JSON.stringify({
    tubes: tubes.map(t => ({ item: t.ITEM, desc: t.Description, cost: t.MostRecentCost, width: t.WITDH, length: t.LENGHT })),
    mechs: mechs.map(t => ({ item: t.ITEM, desc: t.Description, cost: t.MostRecentCost, width: t.WITDH, length: t.LENGHT })),
    brackets: brackets.map(t => ({ item: t.ITEM, desc: t.Description, cost: t.MostRecentCost, width: t.WITDH, length: t.LENGHT }))
  }, null, 2));

} catch (err) {
  console.error(err);
}
