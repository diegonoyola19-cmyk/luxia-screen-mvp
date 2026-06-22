import { describe, it, expect } from 'vitest';
import { mapVertiluxApiInventoryItem, VertiluxApiRawItem } from '../mapVertiluxApiInventoryItem';

describe('mapVertiluxApiInventoryItem', () => {
  it('1. SQYD -> available_yd2 directo', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'SQYD-TEST',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '100',
      QTYSALORDR: '10',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.apiAvailableRaw).toBe(90);
    expect(result.item.payload.available_yd2).toBe(90);
    expect(result.item.payload.apiUnit).toBe('SQYD');
  });

  it('2. MT² -> yd² con factor 1.1959900463', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'MT2-TEST',
      DESCRIPTION: 'Premium Blackout White 118"',
      UNIT: 'MT²',
      QTYONHAND: '50',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.apiAvailableRaw).toBe(50);
    expect(result.item.payload.available_yd2).toBeCloseTo(50 * 1.1959900463);
  });

  it('3. YD lineal -> yd² usando width_meters', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'YD-TEST',
      DESCRIPTION: 'Pinpointe White 72"',
      UNIT: 'YD',
      QTYONHAND: '200',
      QTYSALORDR: '50',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    // width is 72" = 1.8288 m
    const expectedWidth = 72 * 0.0254;
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.width_meters).toBeCloseTo(expectedWidth);
    
    // YD to YD2: linear_yards * 0.9144 * width_meters * 1.1959900463
    const expectedYd2 = 150 * 0.9144 * expectedWidth * 1.1959900463;
    expect(result.item.payload.available_yd2).toBeCloseTo(expectedYd2);
  });

  it('4. EA -> skipped/warning', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'EA-TEST',
      DESCRIPTION: 'Screen 3000-5% White 72"', // has width but unit is EA
      UNIT: 'EA',
      QTYONHAND: '10',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('UNIT_AMBIGUOUS');
  });

  it('5. Falta width_meters -> skipped/warning', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'NO-WIDTH-TEST',
      DESCRIPTION: 'Screen 3000-5% White', // no inches
      UNIT: 'YD',
      QTYONHAND: '100',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('MISSING_WIDTH_METERS');
  });

  it('6. QTYONHAND - QTYSALORDR calcula apiAvailableRaw', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'MATH-TEST',
      DESCRIPTION: 'Premium White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '150.5',
      QTYSALORDR: '20.5',
      QTYONORDER: '100',
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.apiQtyOnHand).toBe(150.5);
    expect(result.item.payload.apiQtySalesOrder).toBe(20.5);
    expect(result.item.payload.apiAvailableRaw).toBe(130);
  });

  it('7. No permite stock negativo; clamp a 0', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'NEG-TEST',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '10',
      QTYSALORDR: '50', // Commited > OnHand
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.apiAvailableRaw).toBe(0);
    expect(result.item.payload.available_yd2).toBe(0);
  });

  it('8. Deriva length_meters correctamente', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'LEN-TEST',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '100',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.item.category !== 'fabric') return;
    const expectedWidth = 98.43 * 0.0254;
    const expectedLength = 100 / (expectedWidth * 1.1959900463);
    expect(result.item.payload.length_meters).toBeCloseTo(expectedLength);
  });

  it('9. Preserva ITEMNO como code', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'CODE-123',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '100',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.item.category !== 'fabric') return;
    expect(result.item.code).toBe('CODE-123');
    expect(result.item.payload.sourceItemNo).toBe('CODE-123');
  });

  it('10. Marca isVirtualRoll=true y source=vertilux_api', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'VIRTUAL-TEST',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '100',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.item.category !== 'fabric') return;
    expect(result.item.payload.isVirtualRoll).toBe(true);
    expect(result.item.payload.source).toBe('vertilux_api');
  });

  it('11. No muta el item crudo', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: 'MUT-TEST',
      DESCRIPTION: 'Screen 3000-5% White 98.43"',
      UNIT: 'SQYD',
      QTYONHAND: '100',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const clone = { ...raw };
    mapVertiluxApiInventoryItem(raw);
    expect(raw).toEqual(clone);
  });

  it('12. Tube con FT se mapea correctamente a category=tube, kind=bar', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: '0154TU38111',
      DESCRIPTION: '1½" (38mm) Alu. NEO Tube T6, W/Tape, 19\' MF',
      UNIT: 'FT',
      QTYONHAND: '100',
      QTYSALORDR: '10',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    expect(result.item.category).toBe('tube');
    if (result.item.category !== 'tube' && result.item.category !== 'bottom' && result.item.category !== 'component') return;
    expect(result.item.kind).toBe('bar');
    expect(result.item.payload.available_quantity).toBe(90);
    expect(result.item.payload.unit).toBe('ft');
    expect(result.item.payload.length_feet).toBe(19);
    expect(result.item.payload.length_meters).toBeCloseTo(19 * 0.3048);
  });

  it('13. Bottom rail se mapea correctamente a category=bottom, kind=bar', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: '0151ALCLW19',
      DESCRIPTION: 'Rollux-Al. Bottomrail Classic White 19\'',
      UNIT: 'ft',
      QTYONHAND: '50',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    expect(result.item.category).toBe('bottom');
    if (result.item.category !== 'tube' && result.item.category !== 'bottom' && result.item.category !== 'component') return;
    expect(result.item.kind).toBe('bar');
    expect(result.item.payload.available_quantity).toBe(50);
    expect(result.item.payload.unit).toBe('ft');
    expect(result.item.payload.length_feet).toBe(19);
  });

  it('14. Component con EA se mapea a category=component, kind=unit', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: '0151REC0005',
      DESCRIPTION: 'Rollux-Roller Shade Bott/Endcap White Contemporary',
      UNIT: 'EA',
      QTYONHAND: '20',
      QTYSALORDR: '5',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw, '2026-06-11T12:00:00Z');
    expect(result.success).toBe(true);
    if (!result.success) return;
    
    expect(result.item.category).toBe('component');
    if (result.item.category !== 'tube' && result.item.category !== 'bottom' && result.item.category !== 'component') return;
    expect(result.item.kind).toBe('unit');
    expect(result.item.payload.available_quantity).toBe(15);
    expect(result.item.payload.unit).toBe('ea');
  });

  it('15. Bindercards y elementos desconocidos se rechazan', () => {
    const raw: VertiluxApiRawItem = {
      ITEMNO: '50021400000',
      DESCRIPTION: 'Bindercard - Captiva Blackout',
      UNIT: 'EA',
      QTYONHAND: '10',
      QTYSALORDR: '0',
      QTYONORDER: null,
      QTYOFFSET: null,
    };
    const result = mapVertiluxApiInventoryItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('NOT_BOM_MATERIAL');
  });
});
