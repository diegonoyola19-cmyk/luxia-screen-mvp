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

export function downloadSageOrderEntry(
  orders: SavedOrder[], 
  remainders: ReusableRemainder[] = []
): { updatedRemainders: ReusableRemainder[], orderSnapshots: Record<string, import('../domain/orders/materialReview').ProductionIssueSnapshot> } {
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
  
  if (import.meta.env.DEV) {
    console.log("[SageExport] updatedRemainders", result.updatedRemainders);
  }

  const orderSnapshots: Record<string, import('../domain/orders/materialReview').ProductionIssueSnapshot> = {};
  for (const order of orders) {
    const cutsFromRemainders = result.cutsFromRemainders.filter(c => c.sourceOrderId === order.id);
    
    const cutPlans = result.cutPlans.map(cp => {
      const bars = cp.bars.map(bar => {
        const cuts = bar.cuts.filter(cut => cut.sourceOrderId === order.id);
        if (cuts.length > 0) {
          return { ...bar, cuts };
        }
        return null;
      }).filter(Boolean) as import('../domain/orders/issueStrategies').CutPlanBar[];
      if (bars.length > 0) {
        return { ...cp, bars };
      }
      return null;
    }).filter(Boolean) as import('../domain/orders/issueStrategies').CutPlan[];

    orderSnapshots[order.id] = {
      generatedAt: new Date().toISOString(),
      snapshotStatus: 'final',
      issueLines: [], // The PDF only needs the cuts and cutPlans to determine bar usage
      cutPlans,
      cutsFromRemainders,
      createdRemainders: result.createdRemainders.filter(r => r.createdFromOrderId === order.id),
      discardedLinearRemainders: result.discardedLinearRemainders.filter(r => r.sourceOrderId === order.id)
    };
  }

  return { updatedRemainders: result.updatedRemainders, orderSnapshots };
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

    // Pre-calcular totales originales por SKU para distribuir ajustes consolidados
    const originalSkuTotals = new Map<string, number>();
    const originalSkuCounts = new Map<string, number>();
    const orderItems = Array.isArray(order?.items) ? order.items : [];

    for (const item of orderItems) {
      if (!item?.materialLines) continue;
      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        if (!originalSku) continue;
        originalSkuTotals.set(originalSku, (originalSkuTotals.get(originalSku) || 0) + mLine.quantity);
        originalSkuCounts.set(originalSku, (originalSkuCounts.get(originalSku) || 0) + 1);
      }
    }

    // Rastrear remanente asignado por SKU durante la distribución
    const remainingAdjustedQty = new Map<string, number>();
    const processedSkuCounts = new Map<string, number>();

    for (const item of orderItems) {
      if (!item?.materialLines) continue;

      for (const mLine of item.materialLines) {
        const originalSku = mLine.sageItemCode || mLine.itemCode;
        if (!originalSku) continue;
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

        if (adjustment && (adjustment.action === "quantity_adjusted" || (adjustment.action === "substituted" && adjustment.actualQuantity !== undefined)) && adjustment.actualQuantity !== undefined) {
          const totalOriginal = originalSkuTotals.get(originalSku) || 0;
          const totalCount = originalSkuCounts.get(originalSku) || 1;
          const currentCount = (processedSkuCounts.get(originalSku) || 0) + 1;
          processedSkuCounts.set(originalSku, currentCount);

          let currentRemaining = remainingAdjustedQty.has(originalSku) 
            ? remainingAdjustedQty.get(originalSku)! 
            : adjustment.actualQuantity;

          if (currentCount === totalCount) {
            // Última línea absorbe el remanente exacto para garantizar SUM(q) === actualQuantity
            finalQuantity = Math.max(0, Number(currentRemaining.toFixed(4)));
          } else {
            const share = totalOriginal > 0 ? (mLine.quantity / totalOriginal) : (1 / totalCount);
            const allocated = Number((adjustment.actualQuantity * share).toFixed(4));
            finalQuantity = allocated;
            remainingAdjustedQty.set(originalSku, currentRemaining - allocated);
          }
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