import { describe, it, expect, vi } from 'vitest';
import { generateOrderMaterialsPdf } from './generateOrderMaterialsPdf';
import type { SavedOrder } from '../../domain/curtains/types';

// Mock jsPDF and autoTable to avoid actual PDF generation in tests
vi.mock('jspdf', () => {
  return {
    default: class {
      internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getCurrentPageInfo: () => ({ pageNumber: 1 })
      };
      setFontSize = vi.fn();
      setFont = vi.fn();
      text = vi.fn();
      setFillColor = vi.fn();
      rect = vi.fn();
      setTextColor = vi.fn();
      addPage = vi.fn();
      save = vi.fn();
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      setLineDashPattern = vi.fn();
      line = vi.fn();
      addImage = vi.fn();
      splitTextToSize = vi.fn().mockImplementation((text) => [text]);
      getNumberOfPages = vi.fn().mockReturnValue(1);
      setPage = vi.fn();
      lastAutoTable = { finalY: 100 };
    }
  };
});

vi.mock('jspdf-autotable', () => {
  return {
    default: vi.fn((doc, options) => {
      doc.lastAutoTable = { finalY: options.startY + 50 };
      if (options.body && Array.isArray(options.body)) {
        doc.internal.mockBody = options.body;
      }
    })
  };
});

describe('generateOrderMaterialsPdf', () => {
  const createMockOrder = (items: any[]): SavedOrder => ({
    id: 'test-123',
    createdAt: new Date().toISOString(),
    orderNumber: '1000',
    status: 'pending',
    sageExportedAt: null,
    items
  });

  it('lanza error si la orden no tiene materialLines (motor V2 viejo)', async () => {
    const oldOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1, fabricFamily: 'A', fabricOpenness: '1%', fabricColor: 'White' },
        result: { recommendedRollWidthMeters: 2.0, wastePercentage: 10 }
      }
    ]);

    await expect(generateOrderMaterialsPdf(oldOrder)).rejects.toThrow('Esta orden fue creada con una versión anterior y no tiene materiales guardados');
  });

  it('lanza error si algún SKU de la orden contiene una X sin resolver', async () => {
    const invalidOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 2.0, wastePercentage: 10 },
        materialLines: [
          { sageItemCode: '0-154-CL-V20XX', description: 'Control Incompleto', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await expect(generateOrderMaterialsPdf(invalidOrder)).rejects.toThrow(/sin resolver.*X/);
  });

  it('lanza error si algún SKU está vacío', async () => {
    const emptySkuOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 2.0, wastePercentage: 10 },
        materialLines: [
          { sageItemCode: '', description: 'Componente Fantasma', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await expect(generateOrderMaterialsPdf(emptySkuOrder)).rejects.toThrow(/SKU.*vacío/);
  });

  it('genera el PDF correctamente cuando la orden tiene materialLines válidos', async () => {
    const validOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 2.0, wastePercentage: 10, selectedFabric: { itemCode: 'FAB-1' } },
        materialLines: [
          { sageItemCode: '0-154-CL-V30WH', description: 'Control VTX30', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await expect(generateOrderMaterialsPdf(validOrder)).resolves.toBeUndefined();
  });

  it('no lanza excepción de specialFabrication si no hay riesgo o reason', async () => {
    const normalOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 2.0, wastePercentage: 10 },
        materialLines: [
          { sageItemCode: 'ITEM-OK', description: 'Control', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await expect(generateOrderMaterialsPdf(normalOrder)).resolves.toBeUndefined();
  });

  it('procesa correctamente una orden usando rollo normal', async () => {
    const rollOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 3.0, wastePercentage: 15, selectedFabric: { itemCode: 'FAB-ROLL' } },
        materialLines: [
          { sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await generateOrderMaterialsPdf(rollOrder);
    
    // Obtenemos la última instancia del mock y buscamos el valor
    const { default: autoTableMock } = await import('jspdf-autotable');
    const calls = [...(autoTableMock as any).mock.calls].reverse();
    const tableCall = calls.find((c: any) => c[1].head && c[1].head[0] && c[1].head[0].includes('Origen'));
    const mockBody = tableCall[1].body;
    
    // Verificamos que la fila de la tabla contenga los valores de rollo correctos
    // [Cortina, Medida, Sistema, Tela, Descripción, Origen, Rollo/Retazo, Consumo, Merma]
    const row = mockBody[0];
    expect(row[5]).toBe('Rollo');
    expect(row[6]).toBe('3.00m');
    expect(row[7]).toBe('—');
    expect(row[8]).toBe('15.00%');
  });

  it('procesa correctamente una orden usando un retazo', async () => {
    const retazoOrder = createMockOrder([
      {
        id: 'c2',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 3.0, wastePercentage: 15, selectedFabric: { itemCode: 'FAB-RET' } },
        reusedWastePiece: { id: 'w1', widthMeters: 1.5, heightMeters: 1.5, originalWidthMeters: 1.5, originalHeightMeters: 1.5, creationDate: '', sourceItemId: '', pieceName: '' },
        materialLines: [
          { sageItemCode: 'ITEM-2', description: 'Control', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await generateOrderMaterialsPdf(retazoOrder);
    
    const { default: autoTableMock } = await import('jspdf-autotable');
    const calls = [...(autoTableMock as any).mock.calls].reverse();
    const tableCall = calls.find((c: any) => c[1].head && c[1].head[0] && c[1].head[0].includes('Origen'));
    const mockBody = tableCall[1].body;
    
    const row = mockBody[0];
    expect(row[5]).toBe('Retazo');
    expect(row[6]).toBe('1.50x1.50m');
    expect(row[7]).toBe('2.69 Yd²');
    expect(row[8]).toBe('—');
  });
});
