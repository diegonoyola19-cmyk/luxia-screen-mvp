import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SavedOrder, ProductionInventory, InventoryMovement } from '../../domain/curtains/types';
import { formatNumber, formatDate } from '../format';
import { componentCatalogBySku } from '../../domain/inventory/componentCatalog';
import { determineIssueMode } from '../../domain/orders/issueStrategies';

export function formatCurtainRefs(refs: number[] | string[]): string {
  if (!refs || refs.length === 0) return '';
  const nums = refs.map(r => typeof r === 'string' ? parseInt(r.replace('#', ''), 10) : r)
                   .filter(n => !isNaN(n))
                   .sort((a, b) => a - b);
                   
  if (nums.length === 0) return refs.join(', ');

  const ranges: string[] = [];
  let start = nums[0];
  let end = nums[0];

  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1 || nums[i] === end) {
      end = nums[i];
    } else {
      ranges.push(start === end ? `#${start}` : `#${start}–#${end}`);
      start = nums[i];
      end = nums[i];
    }
  }
  ranges.push(start === end ? `#${start}` : `#${start}–#${end}`);
  return ranges.join(', ');
}

async function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'test') {
      return reject(new Error('Skip image loading in tests'));
    }
    const img = new Image();
    img.src = '/vertilux-logo.png';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
}

/**
 * Validates the order and aggregates the BOM lines using ONLY the saved materialLines.
 */
function getAggregatedMaterials(order: SavedOrder) {
  const isV3 = order.items.some(i => i.materialLines && i.materialLines.length > 0);
  
  if (!isV3) {
    throw new Error('Esta orden fue creada con una versión anterior y no tiene materiales guardados. Reabre o reguarda la orden para generar el PDF.');
  }

  const doubleBracketGroups: number[][] = [];
  const pendingDoubleBrackets = new Map<number, number[]>();

  order.items.forEach((item, idx) => {
    const mounting = item.input.mountingSystem ?? 'standard';
    const width = item.input.widthMeters;
    
    if (mounting === 'double_bracket') {
      const existing = pendingDoubleBrackets.get(width) || [];
      existing.push(idx + 1);
      if (existing.length === 2) {
        doubleBracketGroups.push(existing);
        pendingDoubleBrackets.delete(width);
      } else {
        pendingDoubleBrackets.set(width, existing);
      }
    }
  });

  for (const [width, items] of pendingDoubleBrackets.entries()) {
    doubleBracketGroups.push(items);
  }

  const getGroupOf = (curtainIndex: number) => doubleBracketGroups.find(g => g.includes(curtainIndex));

  const aggregated = new Map<string, any>();
  
  for (let idx = 0; idx < order.items.length; idx++) {
    const item = order.items[idx];
    if (!item.materialLines) continue;

    const curtainIndex = idx + 1;
    const group = getGroupOf(curtainIndex);

    for (const line of item.materialLines) {
      const sku = line.sageItemCode || line.itemCode;
      
      if (!sku) {
        throw new Error('La orden contiene materiales con un código (SKU) vacío.');
      }
      
      if (/X/.test(sku)) {
        throw new Error(`La orden contiene un código (SKU) sin resolver: ${sku}. Por favor revisa el color de la orden.`);
      }

      const key = `${sku}_${line.unit || ''}`;
      
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity = parseFloat((existing.quantity + line.quantity).toFixed(3));
        
        if (group) {
          const groupStr = group.join('+');
          if (!existing.groups.some((g: number[]) => g.join('+') === groupStr)) {
             existing.groups.push(group);
          }
        } else {
          if (!existing.curtains.includes(curtainIndex)) {
             existing.curtains.push(curtainIndex);
          }
        }
        existing.individualCuts.push({ curtainRef: curtainIndex, quantity: line.quantity, unit: line.unit });

      } else {
        aggregated.set(key, {
          itemCode: sku,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          curtains: group ? [] : [curtainIndex],
          groups: group ? [group] : [],
          individualCuts: [{ curtainRef: curtainIndex, quantity: line.quantity, unit: line.unit }]
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

/**
 * Builds compact subLines (3 lines max) for full_piece_with_remainders materials.
 * Format:
 *   Line 0: "Tomar: X piezas de 19 ft | Cortar: #1–#13"
 *   Line 1: "Dist.: P1 #1–#5 · P2 #6–#10 · P3 #11–#13"
 *   Line 2: "Guardar: X ft útil | Descartar: Y ft"
 */
function buildFullPieceSubLines(
  mat: any,
  snapshot: any,
  cutPlan: any,
  remainders: any[]
): string[] {
  const lines: string[] = [];

  const numNewBars = cutPlan?.bars?.length || 0;
  const usedRemainders = remainders;

  // ── Case A: snapshot with new bars only ─────────────────────────────────────
  if (snapshot && numNewBars > 0 && usedRemainders.length === 0) {
    const allRefsRaw = cutPlan.bars.flatMap((b: any) => b.cuts.map((c: any) => c.curtainRef || c.orderIndex));
    const allRefs = formatCurtainRefs(allRefsRaw);
    lines.push(`Tomar: ${numNewBars} pieza${numNewBars > 1 ? 's' : ''} de 19 ft | Cortar: ${allRefs || '—'}`);

    const distParts = cutPlan.bars.map((b: any, i: number) => {
      const refs = formatCurtainRefs(b.cuts.map((c: any) => c.curtainRef || c.orderIndex));
      return `P${i + 1} ${refs}`;
    });
    if (distParts.length > 0) lines.push(`Dist.: ${distParts.join(' · ')}`);

    let usefulFt = 0, discardFt = 0;
    cutPlan.bars.forEach((bar: any) => {
      if (bar.remainingFt >= 3.28084) usefulFt += bar.remainingFt;
      else discardFt += bar.remainingFt;
    });
    if (usefulFt > 0 || discardFt > 0) {
      lines.push(`Guardar: ${usefulFt.toFixed(2)} ft útil | Descartar: ${discardFt.toFixed(2)} ft`);
    }
    return lines;
  }

  // ── Case B: snapshot, only from remainders ───────────────────────────────────
  if (snapshot && numNewBars === 0 && usedRemainders.length > 0) {
    const ids = Array.from(new Set(usedRemainders.map((r: any) => r.usedRemainderId))).join(', ');
    lines.push(`Tomar: sobrante ${ids} | Cortar: —`);
    return lines;
  }

  // ── Case C: snapshot, mixed ──────────────────────────────────────────────────
  if (snapshot && numNewBars > 0 && usedRemainders.length > 0) {
    const ids = Array.from(new Set(usedRemainders.map((r: any) => r.usedRemainderId))).join(', ');
    const allRefsRaw = cutPlan?.bars?.flatMap((b: any) => b.cuts.map((c: any) => c.curtainRef || c.orderIndex)) || [];
    const allRefs = formatCurtainRefs(allRefsRaw);
    lines.push(`Tomar: ${numNewBars} pieza${numNewBars > 1 ? 's' : ''} de 19 ft + sobrante ${ids} | Cortar: ${allRefs || '—'}`);

    const sumFt = usedRemainders.reduce((a: number, c: any) => a + c.usedRemainderLengthFt, 0);
    let usefulFt = 0, discardFt = 0;
    cutPlan?.bars?.forEach((bar: any) => {
      if (bar.remainingFt >= 3.28084) usefulFt += bar.remainingFt;
      else discardFt += bar.remainingFt;
    });
    if (usefulFt > 0 || discardFt > 0) {
      lines.push(`Guardar: ${usefulFt.toFixed(2)} ft útil | Descartar: ${discardFt.toFixed(2)} ft`);
    }
    return lines;
  }

  // ── Fallback: no snapshot, use FFD from individualCuts ─────────────────────
  if (mat.individualCuts && mat.individualCuts.length > 0) {
    const cuts = mat.individualCuts.map((c: any) => {
      const ft = c.unit.toUpperCase() === 'M' ? c.quantity * 3.28084 : c.quantity;
      return { ...c, ft };
    });
    cuts.sort((a: any, b: any) => b.ft - a.ft);

    const bars: { cuts: any[]; usedFt: number; remainingFt: number }[] = [];
    let exceededLimit = false;

    for (const cut of cuts) {
      if (cut.ft > 19) exceededLimit = true;
      let placed = false;
      for (const bar of bars) {
        if (bar.remainingFt >= cut.ft) {
          bar.cuts.push(cut);
          bar.usedFt += cut.ft;
          bar.remainingFt -= cut.ft;
          placed = true;
          break;
        }
      }
      if (!placed) {
        bars.push({ cuts: [cut], usedFt: cut.ft, remainingFt: 19 - cut.ft });
      }
    }

    const pieces = bars.length;
    const allRefsStr = formatCurtainRefs(bars.flatMap(b => b.cuts.map(c => c.curtainRef)));
    lines.push(`Tomar: ${pieces} pieza${pieces > 1 ? 's' : ''} de 19 ft | Cortar: ${allRefsStr || '—'}`);

    if (exceededLimit) lines.push(`ADVERTENCIA: Corte excede pieza de 19 ft`);

    const distParts = bars.map((b, i) => {
      const refs = formatCurtainRefs(b.cuts.map(c => c.curtainRef));
      return `P${i + 1} ${refs}`;
    });
    if (distParts.length > 0) lines.push(`Dist.: ${distParts.join(' · ')}`);

    let usefulFt = 0, discardFt = 0;
    bars.forEach(b => {
      if (b.remainingFt >= 3.28084) usefulFt += b.remainingFt;
      else discardFt += b.remainingFt;
    });
    if (usefulFt > 0 || discardFt > 0) {
      lines.push(`Guardar: ${usefulFt.toFixed(2)} ft útil | Descartar: ${discardFt.toFixed(2)} ft`);
    }
    return lines;
  }

  // ── Last resort: only total ──────────────────────────────────────────────────
  const totalFt = mat.unit === 'M' ? mat.quantity * 3.28084 : mat.quantity;
  const pieces = Math.ceil(totalFt / 19) || 1;
  const leftoverFt = pieces * 19 - totalFt;
  lines.push(`Tomar: ${pieces} pieza${pieces > 1 ? 's' : ''} de 19 ft | Cortar: —`);
  if (leftoverFt > 0) {
    lines.push(`Guardar: ${leftoverFt.toFixed(2)} ft útil | Descartar: 0.00 ft`);
  }
  return lines;
}

/**
 * Generates and downloads a compact PDF with the production materials for the given order.
 */
export async function generateOrderMaterialsPdf(
  order: SavedOrder, 
  productionInventory?: ProductionInventory,
  inventoryMovements?: InventoryMovement[]
): Promise<void> {
  const materials = getAggregatedMaterials(order);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 15;

  // ── Logo ────────────────────────────────────────────────────────────────────
  try {
    const logo = await loadLogo();
    doc.addImage(logo, 'PNG', 14, 10, 50, 15);
  } catch (e) {
    console.error('Error loading logo', e);
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SOLICITUD DE MATERIALES DE PRODUCCIÓN', 70, 17.5, { align: 'left', baseline: 'middle' });
  currentY += 15;

  // ── Metadata block (20 mm tall, compact) ────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.setFillColor(250, 250, 250);
  doc.rect(14, currentY, pageWidth - 28, 20, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Orden: ${order.orderNumber}`, 18, currentY + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Cortinas: ${order.items.length}`, 80, currentY + 6);
  doc.text(`Fecha Orden: ${formatDate(order.createdAt)}`, 130, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Revisado por:', 18, currentY + 14);
  doc.setDrawColor(150, 150, 150);
  doc.line(45, currentY + 14, 120, currentY + 14);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Impreso: ${formatDate(new Date().toISOString())}`, 130, currentY + 14);

  currentY += 25;

  // ── Special fabrication alert ────────────────────────────────────────────────
  const hasSpecialFabrication = order.items.some(
    item => item.input.specialFabrication === true && (item.input.specialFabricationReason || item.input.riskAcceptedByCustomer)
  );

  if (hasSpecialFabrication) {
    const specialItem = order.items.find(item => item.input.specialFabrication);
    doc.setFillColor(255, 235, 235);
    doc.setDrawColor(200, 0, 0);
    doc.rect(14, currentY, pageWidth - 28, 10, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text(`FABRICACIÓN ESPECIAL: ${specialItem?.input.specialFabricationReason || 'Riesgo asumido por el cliente'}`, 18, currentY + 7);
    doc.setTextColor(0, 0, 0);
    currentY += 14;
  }

  // ── Telas / Paños ────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TELAS / PAÑOS', 14, currentY);
  currentY += 3;

  let generatedScrapsList: string[] = [];
  if (productionInventory) {
    const scraps = productionInventory.fabrics.filter(f => 
      f.kind === 'scrap' && 
      (f.orderNumber === order.orderNumber || 
       f.createdFromOrderNumber === order.orderNumber || 
       f.createdFromOrderId === order.id)
    );
    generatedScrapsList = scraps.map(r => {
      const skuText = r.fabricSku ? ` | SKU: ${r.fabricSku}` : ` | Tela: ${r.code}`;
      const areaText = r.areaMeters ? ` (${formatNumber(r.areaMeters)} m²)` : '';
      return `- ${r.code} | ${formatNumber(r.widthMeters)}m × ${formatNumber(r.lengthMeters)}m${areaText}${skuText} | Disponible`;
    });
    if (generatedScrapsList.length === 0) {
      console.log(`[PDF] fabric scraps for order ${order.orderNumber}: []`);
    }
  }

  autoTable(doc, {
    startY: currentY,
    head: [['Tela / Código', 'Origen', 'Rollo / Retazo', 'Corte total Y2', 'Cortinas obtenidas']],
    body: (() => {
      const fabricGroups = new Map<string, any>();
      
      order.items.forEach((item, idx) => {
        let sku = item.result.selectedFabric?.itemCode || '—';
        let desc = item.result.selectedFabric 
          ? `${item.result.selectedFabric.family} ${item.result.selectedFabric.color}`
          : '—';
        let rollWidthM = item.result.recommendedRollWidthMeters;
        let remnant = item.reusedWastePiece;
        let isReused = remnant != null;
        let origen = isReused ? 'Retazo' : 'Rollo';
        let rolloRetazo = isReused ? `${formatNumber(remnant!.widthMeters)}x${formatNumber(remnant!.heightMeters)}m` : (rollWidthM ? `${formatNumber(rollWidthM)}m` : '—');
        
        let areaY2: number | undefined = undefined;
        const res = item.result as any;
        
        if (isReused && remnant) {
          areaY2 = remnant.widthMeters * remnant.heightMeters * 1.2;
        } else if (res) {
          if (res.recommendedRollWidthMeters && res.cutLengthMeters) {
            areaY2 = res.recommendedRollWidthMeters * res.cutLengthMeters * 1.2;
          } else if (res.fabricDownloadedYd2 && res.fabricDownloadedYd2 > 0) {
            areaY2 = res.fabricDownloadedYd2;
          }
        }
        
        const adj = order.productionReview?.fabricAdjustments?.find(a => a.curtainId === item.id);
        if (adj && adj.action !== 'removed') {
           sku = adj.actualFabricSku || adj.calculatedFabricSku || sku;
           desc = adj.actualFabricDescription || adj.calculatedFabricDescription || desc;
           origen = adj.actualSource === 'remnant' ? 'Retazo' : 'Rollo';
           if (origen === 'Retazo') {
             rolloRetazo = adj.actualRemnantSize || adj.calculatedRemnantSize || rolloRetazo;
             rolloRetazo = rolloRetazo.replace('Retazo\n', '');
           } else {
             rolloRetazo = adj.actualRollWidthM ? `${formatNumber(adj.actualRollWidthM)}m` : (adj.calculatedRollWidthM ? `${formatNumber(adj.calculatedRollWidthM)}m` : '—');
           }
           areaY2 = adj.actualAreaY2 || adj.calculatedAreaY2 || areaY2;
        }

        if (adj && adj.action === 'removed') return;

        const groupKey = origen === 'Retazo' 
          ? `remnant_${sku}_${isReused ? remnant!.id : idx}` 
          : `roll_${sku}_${rollWidthM || 'none'}`;
        
        if (!fabricGroups.has(groupKey)) {
           fabricGroups.set(groupKey, {
              sku, desc, origen, rolloRetazo, 
              totalY2: 0,
              items: [],
              sourceItems: []
           });
        }
        
        const group = fabricGroups.get(groupKey)!;
        group.totalY2 += (areaY2 || 0);
         group.items.push({
          label: idx + 1,
          medida: `${formatNumber(item.input.widthMeters)} × ${formatNumber(item.input.heightMeters)} m${item.result?.oversizedRotated ? ' (Rotada)' : item.result?.forcedRotatedByRollLimit ? ' (Rotada por ancho de rollo disponible)' : ''}`,
          y2: areaY2
        });
        group.sourceItems.push(item);
      });

      return Array.from(fabricGroups.values()).map(group => {
         const telaCodigoStr = `${group.sku}\n${group.desc}`;
         
         const groupedByMeasure = new Map<string, number[]>();
         for (const i of group.items) {
             if (!groupedByMeasure.has(i.medida)) groupedByMeasure.set(i.medida, []);
             groupedByMeasure.get(i.medida)!.push(i.label);
         }

         const cortinasStr = Array.from(groupedByMeasure.entries()).map(([medida, labels]) => {
             const count = labels.length;
             return `${formatCurtainRefs(labels)} | ${medida} | ${count} unidad${count > 1 ? 'es' : ''}`;
         }).join('\n');
         
         return [
           telaCodigoStr,
           group.origen,
           group.rolloRetazo,
           `${group.totalY2.toFixed(2)} Y2`,
           cortinasStr
         ];
      });
    })(),
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [175, 25, 35],
      textColor: [255, 255, 255]
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248]
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // ── Retazos de tela ──────────────────────────────────────────────────────────
  if (currentY > pageHeight - 30) { doc.addPage(); currentY = 20; }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('RETAZOS DE TELA GENERADOS PARA BODEGA', 14, currentY);
  currentY += 4;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (generatedScrapsList.length > 0) {
    for (const line of generatedScrapsList) {
       doc.text(line, 14, currentY);
       currentY += 3.5;
    }
  } else {
    doc.text('Retazos de tela generados: —', 14, currentY);
    currentY += 3.5;
  }
  doc.setTextColor(0, 0, 0);
  currentY += 3;

  // ── Pre-compute sobrantes (for checklist display and end-of-page detail) ─────
  const snapshot = order.productionReview?.issueSnapshot;

  const fallbackLinearRemainders: any[] = [];
  if (!snapshot) {
    for (const mat of materials) {
      if (determineIssueMode(mat.itemCode, mat.unit) === 'full_piece_with_remainders') {
        if (mat.individualCuts && mat.individualCuts.length > 0) {
          const cuts = mat.individualCuts.map((c: any) => {
            const ft = c.unit.toUpperCase() === 'M' ? c.quantity * 3.28084 : c.quantity;
            return { ...c, ft };
          });
          cuts.sort((a: any, b: any) => b.ft - a.ft);
          const bars: { remainingFt: number }[] = [];
          for (const cut of cuts) {
            let placed = false;
            for (const bar of bars) {
              if (bar.remainingFt >= cut.ft) { bar.remainingFt -= cut.ft; placed = true; break; }
            }
            if (!placed) bars.push({ remainingFt: 19 - cut.ft });
          }
          bars.forEach((b, i) => {
            if (b.remainingFt > 0) {
              fallbackLinearRemainders.push({
                id: `Barra ${i + 1}`,
                remainingLengthFt: b.remainingFt,
                type: mat.itemCode.includes('TU') ? 'tube' : 'bottomrail',
                sku: mat.itemCode
              });
            }
          });
        }
      }
    }
  }

  const usefulRemainders = [
    ...(snapshot?.createdRemainders || []),
    ...fallbackLinearRemainders.filter((r: any) => r.remainingLengthFt >= 3.28084)
  ].filter((r: any) => r.status !== 'consumed');

  const discardedRemainders = [
    ...(snapshot?.discardedLinearRemainders || []),
    ...fallbackLinearRemainders.filter((r: any) => r.remainingLengthFt < 3.28084)
  ];

  // ── Checklist de Componentes ─────────────────────────────────────────────────
  if (currentY > pageHeight - 40) { doc.addPage(); currentY = 20; }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('CHECKLIST DE COMPONENTES CALCULADOS', 14, currentY);
  currentY += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  for (const mat of materials) {
    if (currentY > pageHeight - 35) { doc.addPage(); currentY = 20; }
    
    const catalogEntry = componentCatalogBySku[mat.itemCode];
    const marketName = catalogEntry?.marketName;
    const nameStr = marketName ? `${mat.description} / ${marketName}` : mat.description;

    // Checkbox
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(14, currentY - 3, 4, 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    const matSnapshot = order.productionReview?.issueSnapshot;
    const cutPlan = matSnapshot?.cutPlans?.find((cp: any) => cp.sku === mat.itemCode);
    const remainders = matSnapshot?.cutsFromRemainders?.filter((cr: any) => cr.sku === mat.itemCode) || [];
    const isLinear = !!(cutPlan || remainders.length > 0);

    const isFullPiece = determineIssueMode(mat.itemCode, mat.unit) === 'full_piece_with_remainders';

    let startX = 21;

    if (isFullPiece) {
      // Bold header: NAME | SKU
      doc.setFont('helvetica', 'bold');
      const mainTxt = `${nameStr.toUpperCase()} | ${mat.itemCode}`;
      doc.text(mainTxt, startX, currentY);
      doc.setFont('helvetica', 'normal');
      currentY += 4;

      // Build compact sublines
      const subLines = buildFullPieceSubLines(mat, matSnapshot, cutPlan, remainders);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      for (const line of subLines) {
        // If the line is too long, split it; otherwise print as-is
        const split = doc.splitTextToSize(line, pageWidth - 35);
        for (const l of split) {
          doc.text(l, 21, currentY);
          currentY += 3.5;
        }
      }
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      currentY += 3;

    } else {
      // Standard non-linear material
      let qtyText = `${mat.quantity} ${mat.unit}`;

      doc.text(qtyText, startX, currentY);
      startX += doc.getTextWidth(qtyText) + 2;
      doc.text('|', startX, currentY);
      startX += doc.getTextWidth('|') + 2;
      
      doc.setFont('helvetica', 'bold');
      doc.text(`${mat.itemCode}`, startX, currentY);
      startX += doc.getTextWidth(`${mat.itemCode}`) + 2;
      
      doc.setFont('helvetica', 'normal');
      doc.text('|', startX, currentY);
      startX += doc.getTextWidth('|') + 2;

      const refParts = [];
      if (mat.groups && mat.groups.length > 0) {
        for (const g of mat.groups) refParts.push(`Grupo: ${formatCurtainRefs(g)}`);
      }
      if (mat.curtains && mat.curtains.length > 0) {
        refParts.push(`Ref: ${formatCurtainRefs(mat.curtains)}`);
      }
      let refStr = refParts.length > 0 ? refParts.join(', ') : 'Ref: —';

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      let actualRefWidth = doc.getTextWidth(refStr);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      let nameAvailableWidth = pageWidth - startX - 14 - actualRefWidth - 2;
      if (nameAvailableWidth < 40) {
        nameAvailableWidth = 40;
        const leftForRef = pageWidth - startX - 14 - 40 - 2;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        refStr = doc.splitTextToSize(refStr, leftForRef)[0];
        actualRefWidth = doc.getTextWidth(refStr);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
      }

      let finalName = nameStr;
      const splitName = doc.splitTextToSize(finalName, nameAvailableWidth);
      finalName = splitName.length > 1
        ? (splitName[0].length > 3 ? splitName[0].substring(0, splitName[0].length - 3) + '...' : splitName[0])
        : splitName[0];

      doc.setTextColor(0, 0, 0);
      doc.text(finalName, startX, currentY);

      // Ref on the right
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(130, 130, 130);
      doc.text(refStr, pageWidth - 14, currentY, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      currentY += 4;

      // Sub-lines for non-full-piece (snapshot info if any)
      if (!matSnapshot && (mat.unit === 'FT' || mat.unit === 'M')) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(130, 130, 130);
        doc.text('Sin snapshot físico de consumo.', 21, currentY);
        doc.setTextColor(0, 0, 0);
        currentY += 3.5;
      }
      currentY += 2;
    }
  }

  currentY += 3;

  // ── Space Calculation & Detalle Sobrantes ────────────────────────────────────
  const adjustments = order.productionReview?.adjustments || [];
  const numRows = Math.max(3, adjustments.length);
  const cambiosSigHeight = 16 + (numRows * 6) + 12; // Title + rows + signatures

  if (usefulRemainders.length > 0 || discardedRemainders.length > 0) {
    // If we can't fit both Detalle and Cambios/Sig, we omit Detalle
    const spaceForBoth = currentY + 20 + cambiosSigHeight < pageHeight - 8;

    if (spaceForBoth) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('DETALLE SOBRANTES:', 14, currentY);
      currentY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);

      const types: Array<'tube' | 'bottomrail'> = ['tube', 'bottomrail'];
      for (const type of types) {
        const typeUseful = usefulRemainders.filter(r =>
          r.type === type ||
          (type === 'tube' && r.sku?.includes('TU')) ||
          (type === 'bottomrail' && r.sku && !r.sku.includes('TU'))
        );
        const typeDiscarded = discardedRemainders.filter(r =>
          r.type === type || r.materialKind === type ||
          (type === 'tube' && r.sku?.includes('TU')) ||
          (type === 'bottomrail' && r.sku && !r.sku.includes('TU'))
        );

        if (typeUseful.length > 0 || typeDiscarded.length > 0) {
          const usefulParts = typeUseful.map(r =>
            `${r.barIndex ? `B${r.barIndex}` : (r.id || 'N/A')} ${r.remainingLengthFt.toFixed(2)} ft útil`
          );
          const discParts = typeDiscarded.map(r => {
            const ftVal = r.remainingLengthFt || r.lengthFt || 0;
            return `${r.barIndex ? `B${r.barIndex}` : (r.id || 'N/A')} ${ftVal.toFixed(2)} ft`;
          });
          let finalLine = `${type === 'tube' ? 'Tubo' : 'Bottomrail'}: `;
          if (usefulParts.length > 0) finalLine += usefulParts.join(', ');
          else finalLine += '0 útil';
          if (discParts.length > 0) finalLine += ` | Desc. ${discParts.join(', ')}`;
          
          const lineSplit = doc.splitTextToSize(finalLine, pageWidth - 28);
          for (const l of lineSplit) {
            if (currentY > pageHeight - cambiosSigHeight - 8) break; 
            doc.text(l, 14, currentY);
            currentY += 3.5;
          }
        }
      }
      doc.setTextColor(0, 0, 0);
      currentY += 2;
    } else {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('Detalle de sobrantes disponible en Bodega.', 14, currentY);
      doc.setTextColor(0, 0, 0);
      currentY += 4;
    }
  }

  // ── Cambios / Sustituciones & Signatures Block ───────────────────────────────
  if (currentY + cambiosSigHeight > pageHeight - 8) {
    doc.addPage();
    currentY = 20;
  }

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.setFillColor(250, 250, 250);
  doc.rect(14, currentY, pageWidth - 28, cambiosSigHeight, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('CAMBIOS / SUSTITUCIONES', 18, currentY + 6);

  doc.setFontSize(8);
  doc.text('Código calculado', 18, currentY + 12);
  doc.text('Código usado', 70, currentY + 12);
  doc.text('Motivo', 120, currentY + 12);

  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([1, 1], 0);
  
  let lineY = currentY + 18;
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < numRows; i++) {
    const adj = adjustments[i];
    if (adj) {
      let calcStr = doc.splitTextToSize(adj.calculatedSku || '', 45)[0] || '';
      let actStr = doc.splitTextToSize(adj.actualSku || '', 45)[0] || '';
      let reasonStr = doc.splitTextToSize(adj.reason || adj.action || '', pageWidth - 18 - 120)[0] || '';
      
      doc.text(calcStr, 18, lineY - 1.5);
      doc.text(actStr, 70, lineY - 1.5);
      doc.text(reasonStr, 120, lineY - 1.5);
    }
    
    doc.line(18, lineY, 65, lineY);
    doc.line(70, lineY, 115, lineY);
    doc.line(120, lineY, pageWidth - 18, lineY);
    lineY += 6;
  }
  doc.setLineDashPattern([], 0);

  const sigY = currentY + cambiosSigHeight - 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);

  doc.text('Entregado por:', 18, sigY + 4);
  doc.line(42, sigY + 4, 78, sigY + 4);

  doc.text('Recibido por:', 82, sigY + 4);
  doc.line(104, sigY + 4, 144, sigY + 4);

  doc.text('Firma/Fecha:', 148, sigY + 4);
  doc.line(168, sigY + 4, pageWidth - 18, sigY + 4);

  currentY += cambiosSigHeight + 4;

  // ── Page numbers ─────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - 35, pageHeight - 12, 30, 5, 'F');
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  doc.save(`materiales-orden-${order.orderNumber}.pdf`);
}
