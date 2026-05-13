const fs = require('fs');
let c = fs.readFileSync('src/lib/sageExport.ts', 'utf8');

c = c.replace(
  "import type { SageMaterialLine } from '../domain/orders/materialReview';",
  "import type { SageMaterialLine } from '../domain/orders/materialReview';\nimport { calculateIssueLines, IssueEngineInputLine, ReusableRemainder } from '../domain/orders/issueStrategies';"
);

c = c.replace(
  "interface SageDetailLine {\n  itemCode: string;\n  quantity: number;\n}",
  ""
);

c = c.replace(
  "export function getSageExportableLineCount(orders: SavedOrder[]) {",
  "export function getSageExportableLineCount(orders: SavedOrder[], remainders: ReusableRemainder[] = []) {\n  const lines = collectMaterialLines(orders);\n  const inputLines: IssueEngineInputLine[] = lines.map(l => ({ sku: l.sku, description: l.description, quantity: l.quantity, unit: l.unit }));\n  const result = calculateIssueLines(inputLines, remainders);\n  return result.sageLines.length;\n}\n\nfunction old_getSageExportableLineCount(orders: SavedOrder[]) {"
);

c = c.replace(
  "export function downloadSageOrderEntry(orders: SavedOrder[]) {",
  "export function downloadSageOrderEntry(orders: SavedOrder[], remainders: ReusableRemainder[] = []): ReusableRemainder[] {"
);

c = c.replace(
  "  const detailLines = consolidateMaterialLines(materialLines);",
  "  const inputLines: IssueEngineInputLine[] = materialLines.map(l => ({ sku: l.sku, description: l.description, quantity: l.quantity, unit: l.unit }));\n  const result = calculateIssueLines(inputLines, remainders);\n  const detailLines = result.sageLines;"
);

c = c.replace(
  "  XLSX.writeFile(workbook, `luxia_orders_${dateTag}.xlsx`);\n}",
  "  XLSX.writeFile(workbook, `luxia_orders_${dateTag}.xlsx`);\n  return result.updatedRemainders;\n}"
);

fs.writeFileSync('src/lib/sageExport.ts', c);
