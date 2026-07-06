import { describe, it, expect } from 'vitest';
import { validateOrderInventoryAvailability, type InventoryValidationContext } from '../orderInventoryAvailability';
import type { SavedOrder } from '../../curtains/types';
import type { InventoryItem } from '../../inventory/types';

// ─── Helpers de fixtures ─────────────────────────────────────────────────────

function makeOrder(materialLines?: any[], finalMaterialLines?: any[], finalFabricLines?: any[]): SavedOrder {
  return {
    id: 'test-order-1',
    orderNumber: 'ORD-001',
    createdAt: new Date().toISOString(),
    status: 'draft',
    items: [{ id: 'item-1', title: 'Cortina 1', materialLines: materialLines ?? undefined }],
    productionReview: (finalMaterialLines || finalFabricLines)
      ? { status: 'completed', finalMaterialLines: finalMaterialLines ?? [], finalFabricLines: finalFabricLines ?? [] }
      : undefined,
  } as any;
}

/** Ítem fungible (EA): tornillos, adaptadores, topes */
function makeFungible(code: string, qty: number, unit = 'EA'): InventoryItem {
  return {
    id: `inv-${code}`,
    code,
    status: 'available',
    kind: 'unit',
    category: 'component',
    payload: { available_quantity: qty, unit },
  } as any;
}

/** Rollo de tela con payload completo */
function makeFabricRoll(
  code: string,
  availableYd2: number,
  widthMeters: number,
  opts: { status?: string; id?: string } = {}
): InventoryItem {
  return {
    id: opts.id ?? `inv-${code}`,
    code,
    status: opts.status ?? 'available',
    kind: 'roll',
    category: 'fabric',
    payload: {
      available_yd2: availableYd2,
      width_meters: widthMeters,
      length_meters: availableYd2 / (widthMeters * 1.19599), // Derivado para consistencia
    },
  } as any;
}

/** Barra / tubo lineal con length_feet */
function makeLinearBar(code: string, lengthFt: number, opts: { id?: string; status?: string } = {}): InventoryItem {
  return {
    id: opts.id ?? `inv-${code}`,
    code,
    status: opts.status ?? 'available',
    kind: 'bar',
    category: 'tube',
    payload: { length_feet: lengthFt },
  } as any;
}

/** Retazo lineal (offcut) con length_feet */
function makeLinearScrap(code: string, lengthFt: number, id?: string): InventoryItem {
  return {
    id: id ?? `scrap-${code}`,
    code,
    status: 'available',
    kind: 'scrap',
    category: 'tube',
    payload: { length_feet: lengthFt },
  } as any;
}

const ctx = (items: InventoryItem[]): InventoryValidationContext => ({ inventoryItems: items });

// ─── A. Telas / Rollos ───────────────────────────────────────────────────────

describe('A. Telas — rollo con payload real', () => {
  it('A1. rollo con available_yd2 suficiente → available', () => {
    const order = makeOrder([{ itemCode: 'TEL-A', quantity: 10, unit: 'Y2', description: 'Tela A' }]);
    const inv = [makeFabricRoll('TEL-A', 20, 2.5)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
    expect(r.insufficientItems).toHaveLength(0);
  });

  it('A2. rollo con available_yd2 insuficiente → insufficient_stock', () => {
    const order = makeOrder([{ itemCode: 'TEL-A', quantity: 25, unit: 'Y2', description: 'Tela A' }]);
    const inv = [makeFabricRoll('TEL-A', 15, 2.5)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
    expect(r.insufficientItems[0].available).toBeCloseTo(15, 2);
  });

  it('A3. varios rollos que suman suficiente, pero ninguno individual alcanza → insufficient_stock', () => {
    // 3 rollos de 8 YD2 cada uno = 24 total, pero requiero 20 en un solo rollo
    const order = makeOrder([{ itemCode: 'TEL-B', quantity: 20, unit: 'Y2', description: 'Tela B' }]);
    const inv = [
      makeFabricRoll('TEL-B', 8, 2.5),
      makeFabricRoll('TEL-B', 8, 2.5),
      makeFabricRoll('TEL-B', 8, 2.5),
    ];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    // No existe ningún ítem individual con 20 YD2
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });

  it('A4. rollo con área suficiente pero width_meters incompatible → insufficient_stock + warning', () => {
    const order = makeOrder([{
      itemCode: 'TEL-C',
      quantity: 10,
      unit: 'Y2',
      description: 'Tela C',
      requiredWidthMeters: 2.5,
    }]);
    // Rollo de 30 YD2 pero solo 2.0 m de ancho (requiere 2.5 m)
    const inv = [makeFabricRoll('TEL-C', 30, 2.0)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
    expect(r.insufficientItems[0].reason).toBe('width_mismatch');
    expect(r.warnings.some(w => w.includes('Ancho incompatible') || w.includes('ancho incompatible'))).toBe(true);
  });

  it('A5. rollo con width_meters compatible dentro de ±0.01 m → available', () => {
    const order = makeOrder([{
      itemCode: 'TEL-D',
      quantity: 5,
      unit: 'Y2',
      description: 'Tela D',
      requiredWidthMeters: 2.50,
    }]);
    // 2.509 m — dentro de ±0.01
    const inv = [makeFabricRoll('TEL-D', 20, 2.509)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('A6. no devuelve incompatible_unit cuando available_yd2 existe (Y2 vs YD2)', () => {
    // La unidad del requerimiento es Y2, el inventario tiene unit YD2
    const order = makeOrder([{ itemCode: 'TEL-E', quantity: 5, unit: 'Y2', description: 'Tela E' }]);
    const inv: InventoryItem[] = [{
      id: 'inv-TEL-E',
      code: 'TEL-E',
      status: 'available',
      kind: 'roll',
      category: 'fabric',
      payload: { available_yd2: 20, width_meters: 2.5, unit: 'YD2', available_quantity: 20 },
    } as any];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.status).not.toBe('incompatible_unit');
  });

  it('A7. sin inventario → missing_sku', () => {
    const order = makeOrder([{ itemCode: 'TEL-X', quantity: 5, unit: 'Y2', description: 'Tela X' }]);
    const r = validateOrderInventoryAvailability(order, ctx([]));
    expect(r.status).toBe('missing_sku');
  });
});

// ─── B. Lineales (tubos, barras, bottomrail) ─────────────────────────────────

describe('B. Lineales — validación por pieza física individual', () => {
  it('B1. barra/tubo con length_feet suficiente → available', () => {
    const order = makeOrder([{ itemCode: 'TUBO-1', quantity: 10, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeLinearBar('TUBO-1', 19)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('B2. varias barras que suman suficiente, pero ninguna individual alcanza → insufficient_stock', () => {
    // 3 barras de 7 FT cada una = 21 FT total, requiero 15 FT en una sola pieza
    const order = makeOrder([{ itemCode: 'TUBO-2', quantity: 15, unit: 'FT', description: 'Tubo' }]);
    const inv = [
      makeLinearBar('TUBO-2', 7),
      makeLinearBar('TUBO-2', 7),
      makeLinearBar('TUBO-2', 7),
    ];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });

  it('B3. requerimiento en M, inventario en FT — conversión correcta → available', () => {
    // Req: 1 M. Bodega: 4 FT = 1.219 M → alcanza
    const order = makeOrder([{ itemCode: 'TUBO-3', quantity: 1, unit: 'M', description: 'Tubo en metros' }]);
    const inv = [makeLinearBar('TUBO-3', 4)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('B4. specificInventoryItemId con largo suficiente → available', () => {
    const order = makeOrder([{
      itemCode: 'TUBO-4',
      quantity: 10,
      unit: 'FT',
      description: 'Tubo específico',
      specificInventoryItemId: 'bar-specific',
    }]);
    const inv = [
      makeLinearBar('TUBO-4', 5, { id: 'bar-other' }),   // largo insuficiente
      makeLinearBar('TUBO-4', 19, { id: 'bar-specific' }), // largo suficiente
    ];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
  });

  it('B5. specificInventoryItemId con largo insuficiente → insufficient_stock', () => {
    const order = makeOrder([{
      itemCode: 'TUBO-5',
      quantity: 15,
      unit: 'FT',
      description: 'Tubo específico',
      specificInventoryItemId: 'bar-small',
    }]);
    const inv = [
      makeLinearBar('TUBO-5', 8, { id: 'bar-small' }), // insuficiente para 15 FT
      makeLinearBar('TUBO-5', 19, { id: 'bar-big' }),   // suficiente pero NO es el específico
    ];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });
});

// ─── C. Retazos ───────────────────────────────────────────────────────────────

describe('C. Retazos — validación como piezas físicas', () => {
  it('C1. retazo lineal suficiente → available', () => {
    const order = makeOrder([{ itemCode: 'SCR-1', quantity: 5, unit: 'FT', description: 'Retazo' }]);
    const inv = [makeLinearScrap('SCR-1', 10)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
  });

  it('C2. retazo lineal insuficiente → insufficient_stock', () => {
    const order = makeOrder([{ itemCode: 'SCR-2', quantity: 12, unit: 'FT', description: 'Retazo' }]);
    const inv = [makeLinearScrap('SCR-2', 5)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });

  it('C3. dos retazos pequeños no se suman para cubrir requerimiento físico', () => {
    // 2 retazos de 6 FT cada uno: ninguno alcanza para 10 FT
    const order = makeOrder([{ itemCode: 'SCR-3', quantity: 10, unit: 'FT', description: 'Retazo' }]);
    const inv = [makeLinearScrap('SCR-3', 6, 'scr-a'), makeLinearScrap('SCR-3', 6, 'scr-b')];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });

  it('C4. retazo de tela físico con area suficiente → available', () => {
    // Retazo sin available_yd2 pero con width×length
    const order = makeOrder([{ itemCode: 'TEL-SCRAP', quantity: 3, unit: 'Y2', description: 'Retazo tela' }]);
    const inv: InventoryItem[] = [{
      id: 'scrap-tela',
      code: 'TEL-SCRAP',
      status: 'available',
      kind: 'scrap',
      category: 'fabric',
      payload: {
        width_meters: 2.0,
        length_meters: 2.0, // 2×2×1.19599 ≈ 4.78 YD2 → ≥ 3
      },
    } as any];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
  });
});

// ─── D. Fungibles ─────────────────────────────────────────────────────────────

describe('D. Fungibles — suma agregada de stock', () => {
  it('D1. stock fungible sumado de varios ítems → available', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 10, unit: 'EA', description: 'Tornillo' }]);
    const inv = [makeFungible('COMP-1', 6), makeFungible('COMP-1', 6)]; // 12 EA total
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('D2. stock fungible sumado insuficiente → insufficient_stock', () => {
    const order = makeOrder([{ itemCode: 'COMP-2', quantity: 15, unit: 'EA', description: 'Tope' }]);
    const inv = [makeFungible('COMP-2', 4), makeFungible('COMP-2', 4)]; // 8 EA total
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    expect(r.status).toBe('insufficient_stock');
    expect(r.canProceed).toBe(false);
  });
});

// ─── E. Regresión — tests originales siguen pasando ─────────────────────────

describe('E. Regresión — comportamiento previo preservado', () => {
  it('E1. sync_error → canProceed false', () => {
    const r = validateOrderInventoryAvailability(makeOrder(), { isSyncError: true });
    expect(r.status).toBe('sync_error');
    expect(r.canProceed).toBe(false);
  });

  it('E2. sin líneas de material → missing_material_lines', () => {
    const r = validateOrderInventoryAvailability(makeOrder([]), ctx([]));
    expect(r.status).toBe('missing_material_lines');
  });

  it('E3. stock suficiente EA → available', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible('COMP-1', 10)]));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('E4. SKU no existe → missing_sku', () => {
    const order = makeOrder([{ itemCode: 'COMP-X', quantity: 5, unit: 'EA' }]);
    const r = validateOrderInventoryAvailability(order, ctx([]));
    expect(r.status).toBe('missing_sku');
    expect(r.missingItems[0].sku).toBe('COMP-X');
  });

  it('E5. stock EA insuficiente → insufficient_stock', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible('COMP-1', 3)]));
    expect(r.status).toBe('insufficient_stock');
    expect(r.insufficientItems[0].available).toBe(3);
    expect(r.insufficientItems[0].required).toBe(5);
  });

  it('E6. EA vs M → incompatible_unit (no convertible)', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'M' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible('COMP-1', 10, 'EA')]));
    // EA vs M = incompatible; sin pieza con unidad M → missing_sku o insufficient
    // El ítem no tiene unidad M por lo que ningún candidato aplica y se marca insufficient
    expect(r.canProceed).toBe(false);
  });

  it('E7. prioridad finalMaterialLines sobre materialLines del ítem', () => {
    const order = makeOrder(
      [{ itemCode: 'COMP-1', quantity: 5, unit: 'EA', description: 'Comp 1' }],
      [{ sku: 'COMP-2', quantity: 5, unit: 'EA', description: 'Comp 2' }]
    );
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible('COMP-1', 10)]));
    expect(r.status).toBe('missing_sku');
    expect(r.missingItems[0].sku).toBe('COMP-2');
  });

  it('E8. normaliza SKU con espacios y capitalización', () => {
    const order = makeOrder([{ itemCode: ' cOmP-1 ', quantity: 5, unit: 'EA' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible('COMP-1', 10)]));
    expect(r.status).toBe('available');
  });

  it('E9. normaliza SKU de bodega con espacios y capitalización', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeFungible(' cOmP-1 ', 10)]));
    expect(r.status).toBe('available');
  });

  it('E10. conversión FT → M para lineal con barra individual suficiente', () => {
    // Req: 1 M. Bodega: 4 FT = 1.219 M → suficiente en pieza individual
    const order = makeOrder([{ itemCode: 'TUBO-1', quantity: 1, unit: 'M' }]);
    const r = validateOrderInventoryAvailability(order, ctx([makeLinearBar('TUBO-1', 4)]));
    expect(r.status).toBe('available');
    expect(r.canProceed).toBe(true);
  });

  it('E11. es una función pura (no muta los objetos)', () => {
    const order = makeOrder([{ itemCode: 'COMP-1', quantity: 5, unit: 'EA' }]);
    const originalOrder = JSON.parse(JSON.stringify(order));
    const inv = [makeFungible('COMP-1', 10)];
    const originalInv = JSON.parse(JSON.stringify(inv));

    validateOrderInventoryAvailability(order, { inventoryItems: inv });

    expect(order).toEqual(originalOrder);
    expect(inv).toEqual(originalInv);
  });
});

// ─── F. Mensajes de error enriquecidos ────────────────────────────────────────

describe('F. Mensajes de error enriquecidos', () => {
  it('F1. insufficient_stock incluye SKU, cantidad y unidad en reasons', () => {
    const order = makeOrder([{ itemCode: 'TUBO-ERR', quantity: 20, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeLinearBar('TUBO-ERR', 5)];
    const r = validateOrderInventoryAvailability(order, ctx(inv));
    const reasonStr = r.reasons.join(' ');
    expect(reasonStr).toContain('TUBO-ERR');
    expect(reasonStr).toContain('20');
    expect(reasonStr).toContain('FT');
  });
});
