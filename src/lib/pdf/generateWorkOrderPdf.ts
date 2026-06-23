import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SavedOrder, ProjectCurtainItem } from '../../domain/curtains/types';
import { formatDate, formatNumber } from '../format';

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

// Helper to group identical items
interface GroupedItem {
  indices: number[]; // e.g. [0, 1] means curtain 1 and 2
  count: number;
  item: ProjectCurtainItem;
}

function groupOrderItems(items: ProjectCurtainItem[]): GroupedItem[] {
  const groups: GroupedItem[] = [];
  items.forEach((item, index) => {
    const existingGroup = groups.find(g => {
      const gItem = g.item;
      // Group if Type, Fabric Family, Fabric Color, Width, Height are the same
      if (gItem.result?.curtainType !== item.result?.curtainType) return false;
      if (gItem.input.widthMeters !== item.input.widthMeters) return false;
      if (gItem.input.heightMeters !== item.input.heightMeters) return false;
      if (gItem.result?.selectedFabric?.family !== item.result?.selectedFabric?.family) return false;
      if (gItem.result?.selectedFabric?.color !== item.result?.selectedFabric?.color) return false;
      return true;
    });

    if (existingGroup) {
      existingGroup.count += 1;
      existingGroup.indices.push(index);
    } else {
      groups.push({
        indices: [index],
        count: 1,
        item: item
      });
    }
  });
  return groups;
}

export async function generateWorkOrderPdf(order: SavedOrder) {
  const doc = new jsPDF({ orientation: 'landscape', format: 'letter' });
  const margin = 10;
  
  // Header
  let logoWidth = 0;
  try {
    const logo = await loadLogo();
    doc.addImage(logo, 'PNG', margin, margin, 40, 15);
    logoWidth = 45;
  } catch (e) {
    // logo failed, ignore
  }

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Orden de Producción', margin + logoWidth, margin + 6);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generales del Cliente', margin + logoWidth, margin + 11);
  
  doc.setFontSize(14);
  doc.setTextColor(200, 0, 0);
  doc.text(`Nº ${order.orderNumber || order.id.slice(0, 6)}`, doc.internal.pageSize.width - margin - 40, margin + 6);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Fecha: ${formatDate(order.createdAt)}`, doc.internal.pageSize.width - margin - 40, margin + 11);
  
  // Optional client info line
  doc.setLineWidth(0.2);
  doc.line(margin + logoWidth, margin + 13, margin + logoWidth + 60, margin + 13);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('VTX WINDOW COVERING, S.A. de C.V.', margin + logoWidth + 90, margin + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('VENTA AL POR MAYOR DE OTROS ARTÍCULOS TEXTILES', margin + logoWidth + 90, margin + 10);

  // Table
  const groupedItems = groupOrderItems(order.items);
  
  const tableData = groupedItems.map((group) => {
    const item = group.item;
    const itemRefs = group.indices.map(i => i + 1).join(', '); // e.g. "1, 2"
    const tipo = item.result?.curtainType === 'screen' ? 'Roller (Screen)' : item.result?.curtainType || '';
    const family = item.result?.selectedFabric?.family || '';
    const code = item.result?.selectedFabric?.color || ''; // Color is effectively the ref/code
    const width = formatNumber(item.input.widthMeters);
    const height = formatNumber(item.input.heightMeters);
    
    return [
      itemRefs,           // Item
      group.count.toString(), // Cant
      '',                 // Ubicacion
      tipo,               // Tipo
      family,             // Materiales
      code,               // Color/Referencia
      width,              // Ancho
      height,             // Alto
      '',                 // Mando (I / AC / D / M)
      '',                 // Largo Ctrl
      '',                 // Paneles
      (item.input as any).notes || '' // Otras observaciones
    ];
  });

  autoTable(doc, {
    startY: margin + 25,
    head: [['Item', 'Cant.', 'Ubicación', 'Tipo', 'Materiales', 'Color/Ref.', 'Ancho', 'Alto', 'Mando', 'Largo Ctrl', 'Paneles', 'Otras Observaciones']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontSize: 9, halign: 'center', lineWidth: 0.1, lineColor: [150, 150, 150] },
    bodyStyles: { fontSize: 9, valign: 'middle', lineWidth: 0.1, lineColor: [150, 150, 150] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'center', cellWidth: 12 },
      2: { cellWidth: 20 },
      3: { cellWidth: 18 },
      4: { cellWidth: 35 },
      5: { cellWidth: 30 },
      6: { halign: 'center', cellWidth: 15 },
      7: { halign: 'center', cellWidth: 15 },
      8: { cellWidth: 20 }, // Mando
      9: { cellWidth: 20 }, // Alto Mando
      10: { cellWidth: 15 }, // Paneles
      11: { cellWidth: 'auto' } // Notas
    },
    styles: { minCellHeight: 12 }
  });

  doc.save(`Orden_Trabajo_${order.orderNumber || order.id.slice(0, 6)}.pdf`);
}
