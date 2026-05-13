import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SavedOrder } from '../../domain/curtains/types';
import { formatNumber, formatDate } from '../format';
import { componentCatalogBySku } from '../../domain/inventory/componentCatalog';

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
 * @param order The saved order to process
 * @returns Array of aggregated lines or throws an Error if validation fails.
 */
function getAggregatedMaterials(order: SavedOrder) {
  const isV3 = order.items.some(i => i.materialLines && i.materialLines.length > 0);
  
  if (!isV3) {
    throw new Error('Esta orden fue creada con una versión anterior y no tiene materiales guardados. Reabre o reguarda la orden para generar el PDF.');
  }

  const aggregated = new Map<string, any>();
  
  for (const item of order.items) {
    if (!item.materialLines) continue;

    for (const line of item.materialLines) {
      const sku = line.sageItemCode || line.itemCode;
      
      if (!sku) {
        throw new Error('La orden contiene materiales con un código (SKU) vacío.');
      }
      
      if (/X/.test(sku)) {
        throw new Error(`La orden contiene un código (SKU) sin resolver: ${sku}. Por favor revisa el color de la orden.`);
      }

      const existing = aggregated.get(sku);
      if (existing) {
        existing.quantity = parseFloat((existing.quantity + line.quantity).toFixed(3));
      } else {
        aggregated.set(sku, {
          itemCode: sku,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

/**
 * Generates and downloads a compact PDF with the production materials for the given order.
 */
export async function generateOrderMaterialsPdf(order: SavedOrder): Promise<void> {
  const materials = getAggregatedMaterials(order);

  // Initialize PDF (A4, portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 15;

  // Header Logo
  try {
    const logo = await loadLogo();
    // Nuevo logo más ancho (VERTILUX IDEAS PARA TU ESPACIO)
    doc.addImage(logo, 'PNG', 14, 10, 50, 15);
  } catch (e) {
    console.error('Error loading logo', e);
  }

  // Header Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  // Se alinea a la derecha del logo y se centra verticalmente (Logo Y=10, Height=15 -> Centro Y=17.5)
  doc.text('SOLICITUD DE MATERIALES DE PRODUCCIÓN', 70, 17.5, { align: 'left', baseline: 'middle' });
  currentY += 15;

  // Metadata Block
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.setFillColor(250, 250, 250);
  doc.rect(14, currentY, pageWidth - 28, 22, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Orden: ${order.orderNumber}`, 18, currentY + 7);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Cortinas: ${order.items.length}`, 80, currentY + 7);
  doc.text(`Fecha Orden: ${formatDate(order.createdAt)}`, 130, currentY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('Revisado por:', 18, currentY + 16);
  doc.setDrawColor(150, 150, 150);
  doc.line(45, currentY + 16, 120, currentY + 16);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Impreso: ${formatDate(new Date().toISOString())}`, 130, currentY + 16);

  currentY += 28;

  // Alerta de Fabricación Especial
  const hasSpecialFabrication = order.items.some(
    item => item.input.specialFabrication === true && (item.input.specialFabricationReason || item.input.riskAcceptedByCustomer)
  );

  if (hasSpecialFabrication) {
    const specialItem = order.items.find(item => item.input.specialFabrication);
    doc.setFillColor(255, 235, 235);
    doc.setDrawColor(200, 0, 0);
    doc.rect(14, currentY, pageWidth - 28, 12, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text(`FABRICACIÓN ESPECIAL: ${specialItem?.input.specialFabricationReason || 'Riesgo asumido por el cliente'}`, 18, currentY + 8);
    
    doc.setTextColor(0, 0, 0);
    currentY += 16;
  }

  // Telas / Paños
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TELAS / PAÑOS', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Tela / Código', 'Origen', 'Rollo / Retazo', 'Cortinas incluidas', 'Total Y2']],
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
          areaY2 = remnant.widthMeters * remnant.heightMeters * 1.19599;
        } else if (res) {
          if (res.fabricDownloadedYd2 && res.fabricDownloadedYd2 > 0) {
            areaY2 = res.fabricDownloadedYd2;
          } else if (res.recommendedRollWidthMeters && res.cutLengthMeters) {
            areaY2 = res.recommendedRollWidthMeters * res.cutLengthMeters * 1.19599;
          }
        }
        
        const adj = order.productionReview?.fabricAdjustments?.find(a => a.curtainId === item.id);
        if (adj && adj.action !== 'removed') {
           sku = adj.actualFabricSku || adj.calculatedFabricSku || sku;
           desc = adj.actualFabricDescription || adj.calculatedFabricDescription || desc;
           origen = adj.actualSource === 'remnant' ? 'Retazo' : 'Rollo';
           if (origen === 'Retazo') {
             rolloRetazo = adj.actualRemnantSize || adj.calculatedRemnantSize || rolloRetazo;
           } else {
             rolloRetazo = adj.actualRollWidthM ? `${formatNumber(adj.actualRollWidthM)}m` : (adj.calculatedRollWidthM ? `${formatNumber(adj.calculatedRollWidthM)}m` : '—');
           }
           areaY2 = adj.actualAreaY2 || adj.calculatedAreaY2 || areaY2;
        }

        if (adj && adj.action === 'removed') return;

        const groupKey = origen === 'Retazo' ? `remnant_${sku}_${rolloRetazo}` : `roll_${sku}_${rolloRetazo}`;
        
        if (!fabricGroups.has(groupKey)) {
           fabricGroups.set(groupKey, {
              sku, desc, origen, rolloRetazo, 
              totalY2: 0,
              items: []
           });
        }
        
        const group = fabricGroups.get(groupKey)!;
        group.totalY2 += (areaY2 || 0);
        group.items.push({
           label: `#${idx + 1}`,
           medida: `${formatNumber(item.input.widthMeters)}x${formatNumber(item.input.heightMeters)}`,
           y2: areaY2
        });
      });

      return Array.from(fabricGroups.values()).map(group => {
         const telaCodigoStr = `${group.sku}\n${group.desc}`;
         const cortinasStr = group.items.map((i: any) => `${i.label} ${i.medida} — ${i.y2 ? i.y2.toFixed(2) : '—'} Y2`).join('\n');
         
         return [
           telaCodigoStr,
           group.origen,
           group.rolloRetazo,
           cortinasStr,
           `${group.totalY2.toFixed(2)} Y2`
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
      fillColor: [175, 25, 35], // Rojo vino corporativo Vertilux
      textColor: [255, 255, 255]
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248]
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // Checklist de Componentes
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CHECKLIST DE COMPONENTES CALCULADOS', 14, currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  for (const mat of materials) {
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = 20;
    }
    
    const catalogEntry = componentCatalogBySku[mat.itemCode];
    const marketName = catalogEntry?.marketName;
    const nameStr = marketName ? `${mat.description} / ${marketName}` : mat.description;

    // Draw checkbox
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(14, currentY - 3, 4, 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    const qtyText = `${mat.quantity} ${mat.unit}`;
    doc.text(qtyText, 21, currentY);
    doc.text('|', 36, currentY);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${mat.itemCode}`, 39, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.text('|', 73, currentY);
    
    const availableWidth = pageWidth - 76 - 14; 
    let finalName = nameStr;
    const splitName = doc.splitTextToSize(finalName, availableWidth);
    if (splitName.length > 1) {
       const firstLine = splitName[0];
       finalName = firstLine.length > 3 ? firstLine.substring(0, firstLine.length - 3) + '...' : firstLine;
    } else {
       finalName = splitName[0];
    }
    
    doc.text(finalName, 76, currentY);
    
    currentY += 7;
  }

  currentY += 5;

  // Footer / Cierre
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 20;
  }

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.setFillColor(250, 250, 250);
  doc.rect(14, currentY, pageWidth - 28, 30, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Observaciones generales:', 18, currentY + 6);
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(62, currentY + 6, pageWidth - 18, currentY + 6);
  doc.line(18, currentY + 13, pageWidth - 18, currentY + 13);

  doc.setLineDashPattern([], 0);
  doc.setDrawColor(100, 100, 100);

  const boxBottom = currentY + 24;
  doc.text('Entregado por:', 18, boxBottom);
  doc.line(45, boxBottom, 80, boxBottom);

  doc.text('Recibido por:', 85, boxBottom);
  doc.line(107, boxBottom, 140, boxBottom);

  doc.text('Firma/Fecha:', 145, boxBottom);
  doc.line(168, boxBottom, 192, boxBottom);

  // Total Pages Replacement
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - 35, pageHeight - 12, 30, 5, 'F');
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  // Save PDF
  doc.save(`materiales-orden-${order.orderNumber}.pdf`);
}
