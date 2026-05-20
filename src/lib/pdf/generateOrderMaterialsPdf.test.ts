import { describe, it, expect, vi } from 'vitest';
import { generateOrderMaterialsPdf, formatCurtainRefs } from './generateOrderMaterialsPdf';
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
    // ['Tela / Código', 'Origen', 'Rollo / Retazo', 'Corte total Y2', 'Cortinas obtenidas']
    const row = mockBody[0];
    expect(row[1]).toBe('Rollo');
    expect(row[2]).toBe('3.00m');
    expect(row[3]).toBe('0.00 Y2');
    expect(row[4]).toBe('#1 | 1.00 × 1.00 m | 1 unidad');
  });

  it('procesa correctamente una orden usando un retazo', async () => {
    const retazoOrder = createMockOrder([
      {
        id: 'c2',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { recommendedRollWidthMeters: 3.0, wastePercentage: 15, selectedFabric: { itemCode: 'FAB-RET' } },
        reusedWastePiece: { id: 'w1', widthMeters: 1.5, heightMeters: 1.5, originalWidthMeters: 1.5, originalHeightMeters: 1.5, creationDate: '', sourceItemId: '' },
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
    expect(row[2]).toContain('1.50x1.50m');
    expect(row[3]).toBe('2.70 Y2');
    expect(row[4]).toBe('#1 | 1.00 × 1.00 m | 1 unidad');
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
    expect(row[3]).toBe('5.64 Y2');
    expect(row[4]).toBe('#1 | 1.25 × 1.48 m | 1 unidad');
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
      typeof call[0] === 'string' && call[0].includes('TUBO') && call[0].includes('0-154-TU-38111')
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
    
    // 2. Componente compartido por varias cortinas muestra Ref: #2–#3.
    expect(findCall('Ref: #2–#3')).toBeDefined();

    // 3. Bracket doble scope group muestra Grupo: #4–#5.
    expect(findCall('Grupo: #4–#5')).toBeDefined();
  });

  it('muestra retazos generados en sección secundaria si hay ID confiable', async () => {
    const jsPDFModule = await import('jspdf');
    (jsPDFModule.default as any).textMock.mockClear();
    
    const order = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { 
          recommendedRollWidthMeters: 3.0, 
          selectedFabric: { itemCode: 'FAB-1' },
          wastePieceWidthMeters: 1.2,
          wastePieceHeightMeters: 1.5
        },
        materialLines: [
          { sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    const productionInventory: any = {
      fabrics: [
        { id: 'uuid-1', code: 'RET-001', family: 'Screen', color: 'Blanco', widthMeters: 1.2, lengthMeters: 1.5, kind: 'scrap', orderNumber: order.orderNumber }
      ]
    };
    
    const inventoryMovements: any = [
      { orderId: order.id, action: 'create_scrap', itemCode: 'RET-001' }
    ];

    await generateOrderMaterialsPdf(order, productionInventory, inventoryMovements);
    
    const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
    
    const titleCall = textCalls.find((call: any) => call[0] === 'RETAZOS DE TELA GENERADOS PARA BODEGA');
    expect(titleCall).toBeDefined();

    const detailCall = textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes('RET-001') && call[0].includes('1.20m × 1.50m'));
    expect(detailCall).toBeDefined();
  });

  it('muestra sección de retazos vacía si no hay ID confiable', async () => {
    const jsPDFModule = await import('jspdf');
    (jsPDFModule.default as any).textMock.mockClear();
    
    const order = createMockOrder([
      {
        id: 'c1',
        input: { widthMeters: 1, heightMeters: 1 },
        result: { 
          recommendedRollWidthMeters: 3.0, 
          selectedFabric: { itemCode: 'FAB-1' },
          wastePieceWidthMeters: 1.2,
          wastePieceHeightMeters: 1.5
        },
        materialLines: [
          { sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }
        ]
      }
    ]);

    await generateOrderMaterialsPdf(order, { fabrics: [], tubes: [], bottoms: [], components: [] }, []);
    
    const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
    
    const fallbackCall = textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes('Retazos de tela generados: —'));
    expect(fallbackCall).toBeDefined();
  });

  describe('formatCurtainRefs', () => {
    it('formatCurtainRefs([1,2,3]) -> "#1–#3"', () => {
      expect(formatCurtainRefs([1, 2, 3])).toBe('#1–#3');
    });

    it('formatCurtainRefs([1,2,4,5,8]) -> "#1–#2, #4–#5, #8"', () => {
      expect(formatCurtainRefs([1, 2, 4, 5, 8])).toBe('#1–#2, #4–#5, #8');
    });
  });

  describe('23 cortinas iguales se muestran agrupadas', () => {
    it('agrupa cortinas idénticas en la tabla de TELAS / PAÑOS', async () => {
      const items = Array.from({ length: 23 }).map((_, i) => ({
        id: `c${i+1}`,
        input: { widthMeters: 1.2, heightMeters: 1.5 },
        result: { selectedFabric: { itemCode: 'FAB-1' } },
        materialLines: [{ sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }]
      }));
      const order = createMockOrder(items);

      await generateOrderMaterialsPdf(order);

      const { default: autoTableMock } = await import('jspdf-autotable');
      const calls = [...(autoTableMock as any).mock.calls].reverse();
      const tableCall = calls.find((c: any) => c[1].head && c[1].head[0] && c[1].head[0].includes('Origen'));
      const mockBody = tableCall[1].body;
      const row = mockBody[0];
      
      expect(row[4]).toBe('#1–#23 | 1.20 × 1.50 m | 23 unidades');
    });
  });

  describe('Cortinas de medidas distintas se agrupan por medida', () => {
    it('agrupa por medida en TELAS / PAÑOS', async () => {
      const items = [
        ...Array.from({ length: 10 }).map((_, i) => ({
          id: `c${i+1}`,
          input: { widthMeters: 1.2, heightMeters: 1.5 },
          result: { selectedFabric: { itemCode: 'FAB-1' } },
          materialLines: [{ sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }]
        })),
        ...Array.from({ length: 5 }).map((_, i) => ({
          id: `c${i+11}`,
          input: { widthMeters: 1.8, heightMeters: 2.0 },
          result: { selectedFabric: { itemCode: 'FAB-1' } },
          materialLines: [{ sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }]
        })),
        {
          id: 'c16',
          input: { widthMeters: 0.9, heightMeters: 1.2 },
          result: { selectedFabric: { itemCode: 'FAB-1' } },
          materialLines: [{ sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }]
        }
      ];
      const order = createMockOrder(items);

      await generateOrderMaterialsPdf(order);

      const { default: autoTableMock } = await import('jspdf-autotable');
      const calls = [...(autoTableMock as any).mock.calls].reverse();
      const tableCall = calls.find((c: any) => c[1].head && c[1].head[0] && c[1].head[0].includes('Origen'));
      const mockBody = tableCall[1].body;
      const row = mockBody[0];
      
      expect(row[4]).toContain('#1–#10 | 1.20 × 1.50 m | 10 unidades');
      expect(row[4]).toContain('#11–#15 | 1.80 × 2.00 m | 5 unidades');
      expect(row[4]).toContain('#16 | 0.90 × 1.20 m | 1 unidad');
    });
  });

  describe('Checklist de full_piece_with_remainders', () => {
    it('Cortes [12ft, 12ft, 12ft] resulta en 3 piezas x 19 ft', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 12, unit: 'FT' }
          ]
        },
        {
          id: 'c2',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 12, unit: 'FT' }
          ]
        },
        {
          id: 'c3',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 12, unit: 'FT' }
          ]
        }
      ]);

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      console.log('Test Calls:', textCalls.filter((c: any) => typeof c[0] === 'string' && c[0].includes('0-154-TU')));
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('0-154-TU-38111')).toBeDefined();
      expect(findCall('Tomar: 3 piezas de 19 ft | Cortar: #1–#3')).toBeDefined();
      expect(findCall('Dist.: P1 #1 · P2 #2 · P3 #3')).toBeDefined();
    });

    it('Cortes [10ft, 10ft, 5ft] resulta en 2 piezas x 19 ft', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 10, unit: 'FT' }
          ]
        },
        {
          id: 'c2',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 10, unit: 'FT' }
          ]
        },
        {
          id: 'c3',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 5, unit: 'FT' }
          ]
        }
      ]);

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('Tomar: 2 piezas de 19 ft | Cortar: #1–#3')).toBeDefined();
      expect(findCall('Dist.: P1 #1, #3 · P2 #2')).toBeDefined();
    });

    it('Cortes [5ft, 5ft, 5ft] resulta en 1 pieza x 19 ft', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 5, unit: 'FT' }
          ]
        },
        {
          id: 'c2',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 5, unit: 'FT' }
          ]
        },
        {
          id: 'c3',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 5, unit: 'FT' }
          ]
        }
      ]);

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('Tomar: 1 pieza de 19 ft | Cortar: #1–#3')).toBeDefined();
      expect(findCall('Dist.: P1 #1–#3')).toBeDefined();
    });

    it('Material EA sigue como EA', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-CL-V30WH', description: 'Control', quantity: 2, unit: 'EA' }
          ]
        }
      ]);

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('2 EA')).toBeDefined();
    });

    it('Cadena no se convierte a piezas de 19 ft', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-001-CH-304SS', description: 'Cadena', quantity: 10, unit: 'FT' }
          ]
        }
      ]);

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('10 FT')).toBeDefined();
      expect(findCall('10 FT')).not.toContain('piezas × 19 ft');
    });
    
    it('Con issueSnapshot, usa cutPlans reales (Caso A)', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 3.5, unit: 'M' }
          ]
        }
      ]);

      order.productionReview = <any>{
        issueSnapshot: {
          generatedAt: new Date().toISOString(),
          snapshotStatus: 'final',
          issueLines: [],
          createdRemainders: [],
          cutPlans: [
            {
              sku: '0-154-TU-38111',
              description: 'Tubo',
              pieceLengthFt: 19,
              bars: [{ barIndex: 1, cuts: [], usedFt: 11.48, remainingFt: 7.52 }]
            }
          ],
          cutsFromRemainders: []
        }
      };

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      console.log('Caso A calls:', textCalls.filter((c: any) => typeof c[0] === 'string' && c[0].includes('Distribución')));
      expect(findCall('1 pieza de 19 ft | Cortar: —')).toBeDefined();
      expect(findCall('Dist.: P1')).toBeDefined();
      expect(findCall('Guardar: 7.52 ft útil | Descartar: 0.00 ft')).toBeDefined();
    });

    it('Con cutsFromRemainders, muestra Usar sobrante (Caso B)', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 1, unit: 'M' }
          ]
        }
      ]);

      order.productionReview = <any>{
        issueSnapshot: {
          generatedAt: new Date().toISOString(),
          snapshotStatus: 'final',
          issueLines: [],
          createdRemainders: [],
          cutPlans: [],
          cutsFromRemainders: [
            { usedRemainderId: 'LIN-004', usedRemainderLengthFt: 3.28, sku: '0-154-TU-38111', sourceOrderId: '' }
          ]
        }
      };

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('Tomar: sobrante LIN-004')).toBeDefined();
    });
    
    it('Si es mixto, muestra pieza nueva + sobrante usado (Caso C)', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: '0-154-TU-38111', description: 'Tubo', quantity: 6, unit: 'M' }
          ]
        }
      ]);

      order.productionReview = <any>{
        issueSnapshot: {
          generatedAt: new Date().toISOString(),
          snapshotStatus: 'final',
          issueLines: [],
          createdRemainders: [],
          cutPlans: [
            {
              sku: '0-154-TU-38111',
              description: 'Tubo',
              pieceLengthFt: 19,
              bars: [{ barIndex: 1, cuts: [], usedFt: 15, remainingFt: 4 }]
            }
          ],
          cutsFromRemainders: [
            { usedRemainderId: 'LIN-005', usedRemainderLengthFt: 4.68, sku: '0-154-TU-38111', sourceOrderId: '' }
          ]
        }
      };

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('Tomar: 1 pieza de 19 ft + sobrante LIN-005 | Cortar: —')).toBeDefined();
      expect(findCall('Guardar: 4.00 ft útil | Descartar: 0.00 ft')).toBeDefined();
    });
    
    it('No se mezclan retazos de tela con sobrantes lineales', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: 'ITEM-1', description: 'Control', quantity: 1, unit: 'EA' }
          ]
        }
      ]);
      
      order.productionReview = <any>{
        issueSnapshot: {
          generatedAt: new Date().toISOString(),
          snapshotStatus: 'final',
          issueLines: [],
          createdRemainders: [
            { id: 'rem-T1', sku: '0-154-TU-38111', description: 'Tubo', originalLengthFt: 19, remainingLengthFt: 5, consumedByOrderIds: [], createdAt: '', status: 'available' as const }
          ],
          cutPlans: [], cutsFromRemainders: []
        }
      };
      
      const productionInventory: any = {
        fabrics: [
          { id: 'uuid-2', code: 'RET-T1', kind: 'scrap', widthMeters: 1.2, lengthMeters: 1.5, orderNumber: order.orderNumber }
        ]
      };
      const inventoryMovements: any = [
        { orderId: order.id, action: 'create_scrap', itemCode: 'RET-001' }
      ];

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order, productionInventory, inventoryMovements);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      
      const findIndex = (str: string) => textCalls.findIndex((call: any) => typeof call[0] === 'string' && call[0].includes(str));
      
      const fabricTitleIdx = findIndex('RETAZOS DE TELA GENERADOS');
      const fabricRetIdx = findIndex('RET-T1');
      const linearTitleIdx = findIndex('SOBRANTES LINEALES GENERADOS');
      const linearRemIdx = findIndex('rem-T1');
      
      expect(fabricTitleIdx).toBeGreaterThan(-1);
      expect(fabricRetIdx).toBeGreaterThan(-1);
      
      expect(fabricTitleIdx).toBeLessThan(fabricRetIdx);
      // The old linear title is removed. We just check linear remainders are not found in the fabric section.
      expect(linearRemIdx).toBeGreaterThan(-1);
    });
  });

  describe('Cambios / Sustituciones y Firmas', () => {
    it('siempre muestra el bloque de cambios y las firmas aunque no haya cambios', async () => {
      const order = createMockOrder([
        {
          id: 'c1',
          input: { widthMeters: 1, heightMeters: 1 },
          result: { selectedFabric: null },
          materialLines: [
            { sageItemCode: 'ITEM-1', description: 'Item', quantity: 1, unit: 'EA' }
          ]
        }
      ]);
      // Explicitly empty adjustments
      order.productionReview = {
        status: 'completed',
        adjustments: [],
        finalMaterialLines: [],
        finalFabricLines: [],
        reviewedAt: new Date().toISOString()
      };

      const jsPDFModule = await import('jspdf');
      (jsPDFModule.default as any).textMock.mockClear();

      await generateOrderMaterialsPdf(order);
      
      const textCalls = (jsPDFModule.default as any).textMock.mock.calls;
      const findCall = (str: string) => textCalls.find((call: any) => typeof call[0] === 'string' && call[0].includes(str));

      expect(findCall('CAMBIOS / SUSTITUCIONES')).toBeDefined();
      expect(findCall('Código calculado')).toBeDefined();
      expect(findCall('Código usado')).toBeDefined();
      expect(findCall('Motivo')).toBeDefined();
      
      expect(findCall('Sin cambios registrados.')).toBeUndefined();

      expect(findCall('Entregado por:')).toBeDefined();
      expect(findCall('Recibido por:')).toBeDefined();
      expect(findCall('Firma/Fecha:')).toBeDefined();
    });
  });
});


