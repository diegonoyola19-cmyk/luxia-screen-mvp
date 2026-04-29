import * as XLSX from 'xlsx';
import type { ResolvedMaterialLine, SavedOrder } from '../domain/curtains/types';

const SAGE_ORDUNIQ = 'PRODUC';
const SAGE_CUSTOMER = 'PRODUC';
const SAGE_ORDER_TYPE = 1;
const SAGE_LOCATION = 1;
const SAGE_LINE_TYPE = 1;

interface SageDetailLine {
  itemCode: string;
  quantity: number;
}

export function getSageExportableLineCount(orders: SavedOrder[]) {
  return collectMaterialLines(orders).length;
}

export function downloadSageOrderEntry(orders: SavedOrder[]) {
  const materialLines = collectMaterialLines(orders);

  if (materialLines.length === 0) {
    throw new Error('No hay lineas de materiales resueltas para exportar a Sage.');
  }

  const detailLines = consolidateMaterialLines(materialLines);
  const workbook = XLSX.utils.book_new();
  const today = new Date();
  const dateTag = formatDateTag(today);

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ORDUNIQ', 'ORDNUMBER', 'CUSTOMER', 'TYPE', 'ORDDATE', 'REFERENCE'],
      [
        SAGE_ORDUNIQ,
        '*** NEW ***',
        SAGE_CUSTOMER,
        SAGE_ORDER_TYPE,
        formatSageDate(today),
        `LUXIA ${dateTag}`,
      ],
    ]),
    'Orders',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'ORDUNIQ',
        'LINENUM',
        'LINETYPE',
        'ITEM',
        'MISCCHARGE',
        'LOCATION',
        'QTYORDERED',
        'UNITPRICE',
        'EXTINVMISC',
      ],
      ...detailLines.map((line, index) => [
        SAGE_ORDUNIQ,
        (index + 1) * 32,
        SAGE_LINE_TYPE,
        line.itemCode,
        null,
        SAGE_LOCATION,
        Number(line.quantity.toFixed(4)),
        null,
        null,
      ]),
    ]),
    'Order_Details',
  );

  appendEmptySheet(workbook, 'Order_Detail_Serial_Numbers', [
    'ORDUNIQ',
    'LINENUM',
    'SERIALNUMF',
  ]);
  appendEmptySheet(workbook, 'Order_Detail_Lot_Numbers', [
    'ORDUNIQ',
    'LINENUM',
    'LOTNUMF',
  ]);
  appendEmptySheet(workbook, 'Order_Payment_Schedules', [
    'ORDUNIQ',
    'PAYMENT',
    'DUEDATE',
    'DUEAMT',
  ]);
  appendEmptySheet(workbook, 'Order_Comments_Instructions', [
    'ORDUNIQ',
    'UNIQUIFIER',
  ]);
  appendEmptySheet(workbook, 'Order_Optional_Fields', [
    'ORDUNIQ',
    'OPTFIELD',
    'VALUE',
  ]);
  appendEmptySheet(workbook, 'Order_Detail_Optional_Fields', [
    'ORDUNIQ',
    'LINENUM',
    'OPTFIELD',
    'VALUE',
  ]);

  XLSX.writeFile(workbook, `OrderEntrySAGE_LUXIA_${dateTag}.xlsx`);
}

function collectMaterialLines(orders: SavedOrder[]): ResolvedMaterialLine[] {
  return orders
    .filter((order) => order.status !== 'sent_to_sage')
    .flatMap((order) =>
      order.items.flatMap((item) => item.result.materialLines ?? item.materialLines ?? []),
    );
}

function consolidateMaterialLines(lines: ResolvedMaterialLine[]): SageDetailLine[] {
  const totals = new Map<string, number>();

  lines.forEach((line) => {
    const itemCode = line.sageItemCode || line.itemCode;

    if (!itemCode || line.quantity <= 0) {
      return;
    }

    totals.set(itemCode, (totals.get(itemCode) ?? 0) + line.quantity);
  });

  return [...totals.entries()]
    .map(([itemCode, quantity]) => ({ itemCode, quantity }))
    .sort((left, right) => left.itemCode.localeCompare(right.itemCode, 'es', { numeric: true }));
}

function appendEmptySheet(workbook: XLSX.WorkBook, name: string, headers: string[]) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), name);
}

function formatDateTag(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatSageDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}-${date.getFullYear()}`;
}
