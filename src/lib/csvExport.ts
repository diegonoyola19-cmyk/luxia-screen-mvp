import type { SavedOrder } from '../domain/curtains/types';
import { summarizeProduction } from './production';
import { formatNumber } from './format';

function escapeCsvField(field: string | number): string {
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export function downloadCsvReport(orders: SavedOrder[]) {
  const headers = [
    'Numero de Orden',
    'Fecha',
    'Estado',
    'Cortinas',
    'Costo Total ($)',
    'Area Terminada (m2)',
    'Tela Nueva (m2)',
    'Merma (m2)',
    'Merma (%)',
    'Retazos Reutilizados',
  ];

  const rows = orders.map((order) => {
    const summary = summarizeProduction(order.items);
    const wastePercentage =
      summary.fabricDownloadedM2 === 0
        ? 0
        : (summary.fabricWasteM2 / summary.fabricDownloadedM2) * 100;
    
    return [
      order.orderNumber,
      new Date(order.createdAt).toLocaleDateString(),
      order.status === 'sent_to_sage' ? 'Completada' : 'Pendiente',
      summary.curtains,
      summary.totalOrderCost.toFixed(2),
      summary.curtainAreaM2.toFixed(2),
      summary.fabricDownloadedM2.toFixed(2),
      summary.fabricWasteM2.toFixed(2),
      wastePercentage.toFixed(2),
      summary.reusedWasteCurtains,
    ];
  });

  const csvContent = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', `Reporte_Produccion_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
