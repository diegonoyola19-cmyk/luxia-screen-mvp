import * as XLSX from 'xlsx';
import type { SavedOrder } from '../domain/curtains/types';
import type { SageMaterialLine } from '../domain/orders/materialReview';
import { calculateIssueLines, IssueEngineInputLine, ReusableRemainder } from '../domain/orders/issueStrategies';
import { componentCatalogBySku } from '../domain/inventory/componentCatalog';

const SAGE_ORDUNIQ = 'PRODUC';
const SAGE_CUSTOMER = 'PRODUC';
const SAGE_ORDER_TYPE = 1;
const SAGE_LOCATION = 1;
const SAGE_LINE_TYPE = 1;

interface SageDetailLine {
  itemCode: string;
  quantity: number;
}

export function getSageExportableLineCount(orders: SavedOrder[], remainders: ReusableRemainder[] = []) {
  const inputLines = collectIssueEngineInputs(orders);
  const result = calculateIssueLines(inputLines, remainders);
  return result.sageLines.length;
}

export function downloadSageOrderEntry(orders: SavedOrder[], remainders: ReusableRemainder[] = []): ReusableRemainder[] {
  const inputLines = collectIssueEngineInputs(orders);

  if (inputLines.length === 0) {
    throw new Error('No hay lineas de materiales resueltas para exportar a Sage.');
  }

  const result = calculateIssueLines(inputLines, remainders);
  const detailLines = result.sageLines;
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
  return result.updatedRemainders;
}

function collectIssueEngineInputs(orders: SavedOrder[]): IssueEngineInputLine[] {
  const result: IssueEngineInputLine[] = [];

  for (const order of orders) {
    if (order.status === 'sent_to_sage') continue;

    // 1. Telas: salen directo de finalFabricLines
    if (order.productionReview?.finalFabricLines) {
      for (const line of order.productionReview.finalFabricLines) {
        result.push({
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          orderId: order.id
        });
      }
    }

    // 2. Componentes individuales de las cortinas
    const adjustments = order.productionReview?.adjustments || [];
    
    // Mapeamos los ajustes por SKU original (calculatedSku)
    const adjMap = new Map<string, any>();
    for (const adj of adjustments) {
      if (adj.calculatedSku && adj.action !== "added") {
        adjMap.set(adj.calculatedSku, adj);
      }
    }

    for (const item of order.items) {
      if (!item.materialLines) continue;

      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        const adjustment = adjMap.get(originalSku);

        // Si fue removido en la revisión, se ignora
        if (adjustment?.action === "removed") continue;

        let finalSku = originalSku;
        let finalQuantity = mLine.quantity;
        let finalDescription = mLine.description;
        let finalUnit = mLine.unit;

        if (adjustment && adjustment.action === "substituted" && adjustment.actualSku) {
          finalSku = adjustment.actualSku;
          finalDescription = adjustment.actualDescription || finalDescription;
        }

        if (adjustment && adjustment.action === "quantity_adjusted" && adjustment.actualQuantity !== undefined) {
          // Nota: Si hay múltiples cortes de este mismo SKU en la orden, 
          // usar actualQuantity en cada uno no es ideal, pero quantity_adjusted 
          // rara vez se usa en cortes, más en EA. Lo usamos de todos modos.
          finalQuantity = adjustment.actualQuantity;
        }

        result.push({
          sku: finalSku,
          description: finalDescription,
          quantity: finalQuantity,
          unit: finalUnit,
          orderId: order.id,
          itemId: item.id,
          curtainRef: item.title || item.id
        });
      }
    }

    // 3. Componentes agregados manualmente en la revisión
    const addedAdjustments = adjustments.filter(adj => adj.action === "added" && adj.actualSku);
    for (const add of addedAdjustments) {
      result.push({
        sku: add.actualSku!,
        description: add.actualDescription || add.actualSku!,
        quantity: add.actualQuantity || 1,
        unit: add.actualUnit || 'EA',
        orderId: order.id
      });
    }
  }

  // Convertir a la unidad requerida por Sage según el catálogo
  for (const line of result) {
    const catalogEntry = componentCatalogBySku[line.sku];
    const targetUnit = catalogEntry?.sageUnit?.toUpperCase();
    
    if (targetUnit === 'FT' && line.unit.toLowerCase() === 'm') {
      line.quantity = line.quantity * 3.28084;
      line.unit = 'FT';
    } else if (targetUnit === 'M' && line.unit.toLowerCase() === 'ft') {
      line.quantity = line.quantity / 3.28084;
      line.unit = 'M';
    }
  }

  return result;
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