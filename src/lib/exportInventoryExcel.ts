import * as XLSX from 'xlsx';

export function exportInventoryToExcel(
  scraps: any[],
  linears: any[],
  filename: string = `bodega-luxia-${new Date().toISOString().split('T')[0]}.xlsx`
) {
  // 1. Hoja de Retazos de Tela
  const fabricData = scraps.map((item) => ({
    'Código': item.code,
    'Familia / Línea': item.family || 'Desconocida',
    'SKU': item.itemCode || item.sku || '-',
    'Descripción / Color': item.color || '-',
    'Ancho m': Number(item.widthMeters?.toFixed(3) || 0),
    'Alto/Caída m': Number(item.lengthMeters?.toFixed(3) || 0),
    'Área m2': Number(((item.widthMeters || 0) * (item.lengthMeters || 0)).toFixed(3)),
    'Estado': item.status,
    'Orden origen': item.orderNumber || item.sourceOrderNumber || 'Registro manual',
    'Fecha generación': new Date(item.createdAt).toLocaleDateString(),
    'Notas': item.notes || ''
  }));

  const wsFabrics = XLSX.utils.json_to_sheet(fabricData);

  // 2. Hoja de Sobrantes Lineales
  const linearData = linears.map((item) => ({
    'Código': item.code,
    'Tipo': item.itemType,
    'SKU': item.sku || '-',
    'Descripción': item.color || item.description || 'Estándar',
    'Largo FT': Number((item.remainingLengthM * 3.28084).toFixed(3)),
    'Largo m': Number(item.remainingLengthM?.toFixed(3) || 0),
    'Estado': item.status,
    'Orden origen': item.sourceOrderNumber || 'Registro manual',
    'Fecha generación': new Date(item.createdAt).toLocaleDateString(),
    'Notas': item.notes || ''
  }));

  const wsLinears = XLSX.utils.json_to_sheet(linearData);

  // 3. Crear Workbook y añadir hojas
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsFabrics, 'Retazos de Tela');
  XLSX.utils.book_append_sheet(wb, wsLinears, 'Sobrantes Lineales');

  // 4. Descargar archivo
  XLSX.writeFile(wb, filename);
}
