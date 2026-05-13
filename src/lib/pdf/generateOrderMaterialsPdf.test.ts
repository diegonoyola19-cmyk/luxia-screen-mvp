import { describe, it, expect, vi } from 'vitest';
import { generateOrderMaterialsPdf } from './generateOrderMaterialsPdf';
import type { SavedOrder } from '../../domain/curtains/types';

// Mock jsPDF and autoTable to avoid actual PDF generation in tests
vi.mock('jspdf', () => {
  const mockTextFn = vi.fn();
  return {
    default: class MockJsPDF {
      static textMock = mockTextFn;
      internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getCurrentPageInfo: () => ({ pageNumber: 1 })
      };
      setFontSize = vi.fn();
      setFont = vi.fn();
      text = mockTextFn;
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
      getTextWidth = vi.fn().mockReturnValue(10);
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
    // ['Tela / Código', 'Origen', 'Rollo / Retazo', 'Cortinas incluidas', 'Total Y2']
    const row = mockBody[0];
    expect(row[1]).toBe('Rollo');
    expect(row[2]).toBe('3.00m');
    expect(row[4]).toBe('0.00 Y2');
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
    expect(row[1]).toBe('Retazo');
    expect(row[2]).toBe('1.50x1.50m');
    expect(row[4]).toBe('2.69 Y2');
  });

  it('usa el consumo descargable Y2 basado en altura de corte y ancho de rollo', async () => {
    const customOrder = createMockOrder([
      {
        id: 'c3',
        input: { widthMeters: 1.25, heightMeters: 1.48 },
        result: { 
          recommendedRollWidthMeters: 2.50, 
          cutLengthMeters: 1.88,
          selectedFabric: { itemCode: 'FAB-CUSTOM' } 
        },
        materialLines: [{ sageItemCode: 'ITEM-1', description: 'Test', quantity: 1, unit: 'EA' }]
      }
    ]);

    await generateOrderMaterialsPdf(customOrder);
    
    const { default: autoTableMock } = await import('jspdf-autotable');
    const calls = [...(autoTableMock as any).mock.calls].reverse();
    const tableCall = calls.find((c: any) => c[1].head && c[1].head[0] && c[1].head[0].includes('Origen'));
    const mockBody = tableCall[1].body;
    
    const row = mockBody[0];
    expect(row[1]).toBe('Rollo');
    expect(row[4]).toBe('5.62 Y2');
  });

  it('imprime nombres comerciales en el checklist de componentes', async () => {
    const customOrder = createMockOrder([
      {
        id: 'c4',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { selectedFabric: null },
        materialLines: [
          { sageItemCode: '0-154-TU-38111', description: 'Tubo NEO', quantity: 1, unit: 'EA' },
          { sageItemCode: 'UNKNOWN-SKU', description: 'Internal Desc', quantity: 2, unit: 'EA' }
        ]
      }
    ]);

    await generateOrderMaterialsPdf(customOrder);
    
    const jsPDFModule = await import('jspdf');
    const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
    
    // Validar que se llamó a doc.text con el nombre comercial del tubo NEO
    
    const commercialNameCall = textCalls.find((call: any) => 
      typeof call[0] === 'string' && call[0].includes('Tubo NEO') && call[0].includes("1½\" (38mm) Alu. NEO Tube") && call[0].includes("/")
    ) || textCalls.find((call: any) => 
      Array.isArray(call[0]) && call[0][0] && call[0][0].includes('Tubo NEO') && call[0][0].includes("1½\" (38mm) Alu. NEO Tube") && call[0][0].includes("/")
    );
    expect(commercialNameCall).toBeDefined();

    // Validar que el fallback para el unknown SKU NO muestra " / " ni "—"
    const fallbackCall = textCalls.find((call: any) => 
      typeof call[0] === 'string' && call[0].includes('Internal Desc') && !call[0].includes('/') && !call[0].includes('—')
    ) || textCalls.find((call: any) => 
      Array.isArray(call[0]) && call[0][0] && call[0][0].includes('Internal Desc') && !call[0][0].includes('/') && !call[0][0].includes('—')
    );
    expect(fallbackCall).toBeDefined();
  });

  it('muestra la referencia de cortina correcta', async () => {
    const customOrder = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1, mountingSystem: 'standard' },
        result: { selectedFabric: null },
        materialLines: [
          { sageItemCode: 'ITEM-SINGLE', description: 'Item', quantity: 1, unit: 'EA' }
        ]
      },
      {
        id: 'c2',
        input: { widthMeters: 1, heightMeters: 1, mountingSystem: 'standard' },
        result: { selectedFabric: null },
        materialLines: [
          { sageItemCode: 'ITEM-SHARED', description: 'Item', quantity: 1, unit: 'EA' }
        ]
      },
      {
        id: 'c3',
        input: { widthMeters: 1, heightMeters: 1, mountingSystem: 'standard' },
        result: { selectedFabric: null },
        materialLines: [
          { sageItemCode: 'ITEM-SHARED', description: 'Item', quantity: 1, unit: 'EA' }
        ]
      },
      {
        id: 'c4',
        input: { widthMeters: 2, heightMeters: 1, mountingSystem: 'double_bracket' },
        result: { selectedFabric: null },
        materialLines: [
          { sageItemCode: 'ITEM-GROUP', description: 'Item', quantity: 1, unit: 'EA' }
        ]
      },
      {
        id: 'c5',
        input: { widthMeters: 2, heightMeters: 1, mountingSystem: 'double_bracket' },
        result: { selectedFabric: null },
        materialLines: []
      }
    ]);

    await generateOrderMaterialsPdf(customOrder);
    
    const jsPDFModule = await import('jspdf');
    const textCalls = (jsPDFModule.default as any).textMock.mock.calls;

    const findCall = (str: string) => textCalls.find((call: any) => 
      typeof call[0] === 'string' && call[0].includes(str)
    );

    // 1. Componente de una cortina muestra Ref: #1.
    expect(findCall('Ref: #1')).toBeDefined();
    
    // 2. Componente compartido por varias cortinas muestra Ref: #2,#3.
    expect(findCall('Ref: #2,#3')).toBeDefined();

    // 3. Bracket doble scope group muestra Grupo: #4+#5.
    expect(findCall('Grupo: #4+#5')).toBeDefined();
  });
});
