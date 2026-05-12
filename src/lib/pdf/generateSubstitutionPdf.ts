import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '../format';

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
 * Generates and downloads a generic Substitution PDF.
 * This document is independent of any specific order and contains blank rows for manual entry.
 */
export async function generateSubstitutionPdf(): Promise<void> {
  // Initialize PDF (A4, landscape)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 15;

  // Add Vertilux Logo
  try {
    const logo = await loadLogo();
    doc.addImage(logo, 'PNG', 14, 10, 50, 15);
  } catch (e) {
    console.error('Error loading logo', e);
  }

  // Header Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('HOJA GENERAL DE SUSTITUCIONES Y DIFERENCIAS', pageWidth / 2, currentY + 5, { align: 'center' });
  currentY += 20;

  // Header Metadata Box (Blank fields for manual entry)
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.setFillColor(248, 248, 248);
  doc.rect(14, currentY, pageWidth - 28, 16, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  doc.text('Fecha:', 18, currentY + 10);
  doc.setDrawColor(150, 150, 150);
  doc.line(32, currentY + 10, 80, currentY + 10);

  doc.text('Responsable:', 90, currentY + 10);
  doc.line(116, currentY + 10, 190, currentY + 10);

  doc.text('Área / Producción:', 200, currentY + 10);
  doc.line(232, currentY + 10, pageWidth - 18, currentY + 10);

  currentY += 24;

  // Main Blank Table
  const blankRows = Array(15).fill(['', '', '', '', '', '', '']);

  autoTable(doc, {
    startY: currentY,
    head: [['Orden', 'Código Calculado', 'Código Usado Realmente', 'Cant. Usada', 'Motivo', 'Observaciones', 'Autorizado por']],
    body: blankRows,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 4,
      minCellHeight: 16, // Generous space for handwriting
      valign: 'middle',
      lineColor: [180, 180, 180],
      lineWidth: 0.1
    },
    headStyles: {
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fillColor: [175, 25, 35], // Wine red Vertilux
      halign: 'center'
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 40 },
      2: { cellWidth: 45 },
      3: { cellWidth: 20 },
      4: { cellWidth: 40 },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 35 }
    },
    didDrawPage: (data) => {
      // Add page number at the bottom right
      const str = `Página ${data.pageNumber}`;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(str, pageWidth - 20, pageHeight - 10, { align: 'right' });
      doc.setTextColor(0, 0, 0); // reset
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Leyenda de Motivos
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Motivos sugeridos:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text('Falta de stock  |  Sustitución autorizada  |  Error en regla  |  Medida especial  |  Componente adicional  |  Otro', 45, currentY);

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
  doc.save(`hoja-general-sustituciones.pdf`);
}
