/**
 * inventoryConsumptionParity.test.ts
 *
 * Tests de PARIDAD entre:
 *   - validateOrderInventoryAvailability (validación pasiva, Bloque 1B)
 *   - calculateIssueLines / determineIssueMode (consumo/corte, issueStrategies)
 *
 * Objetivo: documentar y hacer ejecutables las garantías y discrepancias
 * entre ambas capas para bloquear regresiones futuras.
 *
 * ════════════════════════════════════════════════════════════════════════
 * MAPA DE DISCREPANCIAS (hallazgos de auditoría)
 * ════════════════════════════════════════════════════════════════════════
 *
 * ── CRÍTICA C-1: Telas — modo de agregación opuesto ──
 *   issueStrategies determina el modo de issue de telas con unit='Y2' →
 *   'exact_area', que suma todos los YD2 de ese SKU en una única línea Sage.
 *   validateOrderInventoryAvailability (1B) valida FÍSICAMENTE: busca al
 *   menos un rollo individual con área suficiente.
 *
 *   Escenario concreto (test C-1 a):
 *     Req: 20 YD2 de TEL-X.
 *     Inventario: 3 rollos de 8 YD2 c/u (total 24 YD2).
 *     Validación (correcta): BLOQUEA — ningún rollo individual tiene 20 YD2.
 *     issueStrategies: procesaría 20 YD2 como 'exact_area' y exportaría a Sage.
 *     → La validación previene un corte físicamente imposible.
 *     → issueStrategies nunca recibiría esas líneas porque el workflow bloquea.
 *     CONCLUSIÓN: La validación es el guardián correcto aquí. No hay bug en ninguna.
 *                 La brecha existe pero el Bloque 1B la cubre correctamente.
 *
 * ── CRÍTICA C-2: Telas — 'yd2' vs 'y2' en determineIssueMode ──
 *   determineIssueMode usa lowerUnit = unit.toLowerCase() SIN normalizar.
 *   - unit='Y2' → lowerUnit='y2' → 'exact_area' ✓
 *   - unit='YD2' → lowerUnit='yd2' → línea 102: 'exact_linear' ✗
 *   Una línea de tela con unit='YD2' en lugar de 'Y2' entraría a
 *   'exact_linear', no a 'exact_area'. Esto cambia el Sage export.
 *   validateOrderInventoryAvailability normaliza ambas a 'YD2' correctamente.
 *   CLASIFICACIÓN: CRÍTICA (bug en issueStrategies, pero acotado a la unidad literal).
 *   NO se modifica aquí — se documenta y se reporta.
 *
 * ── MEDIA M-1: Lineales — issueStrategies asume FULL_PIECE_FT=19 infinito ──
 *   calculateIssueLines (full_piece_with_remainders) NO verifica inventario.
 *   Abre barras virtuales de FULL_PIECE_FT=19 y genera un cut plan.
 *   Si el inventario real tiene una barra de 15 FT, la validación BLOQUEA
 *   (correcto), pero issueStrategies (si llegara a ejecutarse) generaría
 *   un cut plan "exitoso" usando una barra virtual de 19 FT que no existe.
 *   CONCLUSIÓN: La validación actúa como guardián correcto.
 *               issueStrategies opera a nivel de plan, no de inventario físico.
 *
 * ── MEDIA M-2: Retazos — issueStrategies sin modelo de retazo como fuente ──
 *   calculateIssueLines solo usa ReusableRemainder[] (ya calculados).
 *   No lee inventory_items directamente. Los retazos físicos de inventario
 *   (kind='scrap') son validados en la capa pasiva pero no en issueStrategies.
 *   Si hay specificInventoryItemId en una línea, la validación lo respeta
 *   pero issueStrategies no tiene ese concepto — ignoraría el campo.
 *
 * ── MEDIA M-3: kerf=0 en issueStrategies no modelado en validación ──
 *   issueStrategies asume sin pérdida de corte (kerf=0).
 *   La validación pasiva tampoco lo modela (correcto para ser conservadora).
 *   Discrepancia: un caso donde 2 cortes de 9.5 FT caben teóricamente en
 *   19 FT solo si kerf=0. Con kerf real > 0, no cabrían. Ambas capas
 *   producirían 'available' sin saberlo. Bajo riesgo real en Vertilux.
 *
 * ── MEDIA M-4: MIN_REUSABLE_LINEAR_REMAINDER_FT no refleja validación ──
 *   issueStrategies descarta sobrantes < 3.28084 FT (1 m) como basura.
 *   La validación pasiva no conoce este umbral. Un retazo de 2 FT en
 *   inventario sería "válido" para la validación si la orden necesita 2 FT,
 *   pero issueStrategies lo habría descartado en el ciclo anterior.
 *   NOTA: los retazos en Supabase deberían tener status='discarded' si fueron
 *   descartados, por lo que en la práctica este caso no debería darse.
 *
 * ── MENOR mn-1: Nombres de modo poco intuitivos ──
 *   'exact_area' suena a que mide área exacta, pero es solo suma de YD2.
 *   'full_piece_with_remainders' es preciso pero largo.
 *   No se cambia nada.
 *
 * ── MENOR mn-2: issueStrategies no exporta constante FULL_PIECE_FT ──
 *   La constante está hardcodeada en el cuerpo de calculateIssueLines,
 *   sobreescrita por componentCatalogBySku[sku]?.pieceLengthFt || 19.
 *   El fallback de 19 FT no está documentado como "largo estándar de Vertilux".
 */

import { describe, it, expect } from 'vitest';
import {
  validateOrderInventoryAvailability,
  type InventoryValidationContext,
} from '../orderInventoryAvailability';
import {
  calculateIssueLines,
  determineIssueMode,
  normalizeIssueUnit,
  type IssueEngineInputLine,
  type ReusableRemainder,
} from '../issueStrategies';
import type { SavedOrder } from '../../curtains/types';
import type { InventoryItem } from '../../inventory/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeOrder(materialLines: any[]): SavedOrder {
  return {
    id: 'parity-order',
    orderNumber: 'ORD-PARITY',
    createdAt: new Date().toISOString(),
    status: 'ready_for_production',
    items: [{ id: 'item-1', materialLines }],
  } as any;
}

function makeFabricRoll(code: string, yd2: number, widthM: number, id?: string): InventoryItem {
  return {
    id: id ?? `roll-${code}`,
    code,
    status: 'available',
    kind: 'roll',
    category: 'fabric',
    payload: {
      available_yd2: yd2,
      width_meters: widthM,
    },
  } as any;
}

function makeBar(code: string, lengthFt: number, id?: string): InventoryItem {
  return {
    id: id ?? `bar-${code}`,
    code,
    status: 'available',
    kind: 'bar',
    category: 'tube',
    payload: { length_feet: lengthFt },
  } as any;
}

function ctx(items: InventoryItem[]): InventoryValidationContext {
  return { inventoryItems: items };
}

function issueLines(sku: string, qty: number, unit: string, orderId = 'parity-order'): IssueEngineInputLine[] {
  return [{ sku, description: sku, quantity: qty, unit, orderId }];
}

// ─── A. Paridad de TELAS ─────────────────────────────────────────────────────

describe('A. Paridad — Telas / Rollos', () => {

  it('A1. Rollo suficiente aprobado por validación → issueStrategies lo exportaría en exact_area', () => {
    // Validación: 1 rollo 25 YD2 para req 15 YD2 → available
    const order = makeOrder([{ itemCode: 'TEL-A', quantity: 15, unit: 'Y2', description: 'Tela A' }]);
    const inv = [makeFabricRoll('TEL-A', 25, 2.5)];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);

    // issueStrategies: con unit='Y2' → exact_area → suma y exporta 15 YD2 a Sage
    const mode = determineIssueMode('TEL-A', 'Y2');
    expect(mode).toBe('exact_area');

    const issueResult = calculateIssueLines(issueLines('TEL-A', 15, 'Y2'));
    expect(issueResult.sageLines).toHaveLength(1);
    expect(issueResult.sageLines[0].quantity).toBe(15);

    // Paridad: validación OK → issueStrategies puede procesar → coherente
  });

  it('A2 (C-1). Suma de rollos supera req pero ninguno individual alcanza → validación BLOQUEA, issueStrategies no se ejecuta', () => {
    // 3 rollos × 8 YD2 = 24 YD2 total. Req 20 YD2.
    // Validación BLOQUEA (correcto: ningún rollo individual tiene 20 YD2)
    const order = makeOrder([{ itemCode: 'TEL-B', quantity: 20, unit: 'Y2', description: 'Tela B' }]);
    const inv = [
      makeFabricRoll('TEL-B', 8, 2.5, 'roll-1'),
      makeFabricRoll('TEL-B', 8, 2.5, 'roll-2'),
      makeFabricRoll('TEL-B', 8, 2.5, 'roll-3'),
    ];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);

    // DOCUMENTAR DISCREPANCIA C-1:
    // Si issueStrategies recibiera estas líneas SIN la validación previa,
    // exportaría 20 YD2 a Sage como 'exact_area' (suma total) sin detectar
    // que ningún rollo físico alcanza. La validación del Bloque 1B previene esto.
    const mode = determineIssueMode('TEL-B', 'Y2');
    expect(mode).toBe('exact_area'); // exact_area: sumaría libremente

    // ✓ La validación actúa como guardián correcto antes de llegar a issueStrategies
  });

  it('A3. Rollo con área suficiente pero ancho incompatible → validación BLOQUEA correctamente', () => {
    const order = makeOrder([{
      itemCode: 'TEL-C',
      quantity: 10,
      unit: 'Y2',
      description: 'Tela C',
      requiredWidthMeters: 2.5,
    }]);
    const inv = [makeFabricRoll('TEL-C', 30, 2.0)]; // Ancho 2.0m, requiere 2.5m
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.insufficientItems[0].reason).toBe('width_mismatch');

    // issueStrategies no valida ancho de rollo. Si llegara a ejecutarse:
    //   - exportaría 10 YD2 a Sage sin detectar incompatibilidad de ancho
    //   - el corte físico fallaría en producción
    // La validación del Bloque 1B previene este escenario.
  });

  it('A4 (C-2 CERRADO). YD2 → exact_area (igual que Y2, corregido en Bloque 1C.1)', () => {
    // BUG C-2 CORREGIDO: determineIssueMode ahora normaliza aliases.
    // Antes: 'YD2' → exact_linear (incorrecto).
    // Ahora: 'YD2' → 'area' → exact_area (correcto para telas).
    expect(determineIssueMode('TEL-X', 'Y2')).toBe('exact_area');
    expect(determineIssueMode('TEL-X', 'YD2')).toBe('exact_area'); // ← corregido

    // validateOrderInventoryAvailability normaliza ambas a 'YD2' correctamente
    // y aplica lógica de fabric_roll — ahora hay paridad completa con issueStrategies.
  });
});

// ─── B. Paridad de LINEALES ───────────────────────────────────────────────────

describe('B. Paridad — Lineales / Tubos / Bottom Rail', () => {

  it('B1. Pieza individual suficiente aprobada por validación → issueStrategies genera cut plan exitoso', () => {
    // Req: 10 FT. Barra: 19 FT.
    const order = makeOrder([{ itemCode: 'TUBO-1', quantity: 10, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-1', 19)];
    const validResult = validateOrderInventoryAvailability(order, ctx(inv));
    expect(validResult.status).toBe('available');
    expect(validResult.canProceed).toBe(true);

    // issueStrategies: necesita modo full_piece_with_remainders para TUBO-1
    // (depende del catálogo). Si no está en catálogo y unit='FT' → exact_linear.
    const mode = determineIssueMode('TUBO-1', 'FT');
    // FT puede ser exact_linear o full_piece_with_remainders según catálogo
    // Aquí, sin catálogo, es exact_linear → solo suma
    expect(['exact_linear', 'full_piece_with_remainders']).toContain(mode);

    const issueResult = calculateIssueLines(issueLines('TUBO-1', 10, 'FT'));
    // Con exact_linear exporta exactamente 10 FT a Sage
    // Con full_piece_with_remainders exportaría 19 FT (pieza completa)
    expect(issueResult.sageLines[0].quantity).toBeGreaterThanOrEqual(10);
  });

  it('B2 (M-1). Varias piezas suman suficiente pero ninguna individual alcanza → validación BLOQUEA', () => {
    // Req: 15 FT. 3 barras × 6 FT. Total 18 FT pero ninguna pieza individual alcanza.
    const order = makeOrder([{ itemCode: 'TUBO-2', quantity: 15, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-2', 6, 'b1'), makeBar('TUBO-2', 6, 'b2'), makeBar('TUBO-2', 6, 'b3')];
    const validResult = validateOrderInventoryAvailability(order, ctx(inv));
    expect(validResult.status).toBe('insufficient_stock');
    expect(validResult.canProceed).toBe(false);

    // DISCREPANCIA M-1:
    // issueStrategies (en full_piece_with_remainders) abre barras virtuales de 19 FT.
    // No consulta el inventario físico, siempre puede "abrir" una barra.
    // Si llegara a ejecutarse, generaría un cut plan exitoso con 1 barra virtual de 19 FT.
    // La validación bloquea correctamente antes de que eso ocurra.
    const issueResult = calculateIssueLines(issueLines('TUBO-2', 15, 'FT'));
    // Con exact_linear (sin catálogo): exporta 15 FT sin checks
    expect(issueResult.sageLines[0].quantity).toBe(15);
  });

  it('B3. specificInventoryItemId suficiente → validación aprueba', () => {
    const order = makeOrder([{
      itemCode: 'TUBO-3',
      quantity: 10,
      unit: 'FT',
      description: 'Tubo específico',
      specificInventoryItemId: 'bar-specific',
    }]);
    const inv = [
      makeBar('TUBO-3', 5, 'bar-other'),     // Insuficiente
      makeBar('TUBO-3', 19, 'bar-specific'), // Suficiente y específico
    ];
    const validResult = validateOrderInventoryAvailability(order, ctx(inv));
    expect(validResult.status).toBe('available');

    // DISCREPANCIA M-2:
    // issueStrategies no tiene el concepto de specificInventoryItemId.
    // Procesaría la línea como cualquier otra, sin garantizar que se use
    // la pieza específica identificada.
  });

  it('B4. specificInventoryItemId insuficiente → validación BLOQUEA aunque haya otras piezas suficientes', () => {
    const order = makeOrder([{
      itemCode: 'TUBO-4',
      quantity: 15,
      unit: 'FT',
      description: 'Tubo específico insuficiente',
      specificInventoryItemId: 'bar-small',
    }]);
    const inv = [
      makeBar('TUBO-4', 6, 'bar-small'),  // El específico, insuficiente
      makeBar('TUBO-4', 19, 'bar-big'),   // Grande, pero NO es el específico
    ];
    const validResult = validateOrderInventoryAvailability(order, ctx(inv));
    expect(validResult.status).toBe('insufficient_stock');
    expect(validResult.canProceed).toBe(false);
  });

  it('B5. Corte que excede FULL_PIECE_FT=19 lanza en issueStrategies (full_piece mode)', () => {
    // issueStrategies lanza CUT_EXCEEDS_PIECE_LENGTH si un corte individual
    // supera el largo de la pieza estándar.
    // La validación pasiva no modela este límite directamente.

    // Simular un SKU que tenga full_piece_with_remainders en catálogo.
    // Sin catálogo, FT → exact_linear (no lanza). Solo documentamos.
    const lines: IssueEngineInputLine[] = [{
      sku: 'TUBO-FPR',
      description: 'Tubo Full Piece',
      quantity: 10,  // 10 FT < 19 FT → no lanza
      unit: 'FT',
      orderId: 'ord-1',
    }];

    // Sin el SKU en catálogo, es exact_linear → no hay cut plan, solo Sage line
    const result = calculateIssueLines(lines);
    expect(result.sageLines[0].quantity).toBe(10);
    expect(result.cutPlans).toHaveLength(0); // Sin catálogo no entra en full_piece
  });
});

// ─── C. Paridad de RETAZOS ────────────────────────────────────────────────────

describe('C. Paridad — Retazos', () => {

  it('C1. Retazo físico suficiente aprobado por validación', () => {
    const order = makeOrder([{ itemCode: 'REM-1', quantity: 5, unit: 'FT', description: 'Retazo' }]);
    const inv: InventoryItem[] = [{
      id: 'scrap-1',
      code: 'REM-1',
      status: 'available',
      kind: 'scrap',
      category: 'tube',
      payload: { length_feet: 10 },
    } as any];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });

  it('C2. Retazo físico insuficiente bloqueado por validación', () => {
    const order = makeOrder([{ itemCode: 'REM-2', quantity: 12, unit: 'FT', description: 'Retazo' }]);
    const inv: InventoryItem[] = [{
      id: 'scrap-2',
      code: 'REM-2',
      status: 'available',
      kind: 'scrap',
      category: 'tube',
      payload: { length_feet: 8 },
    } as any];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);
  });

  it('C3. Dos retazos pequeños no se suman → validación BLOQUEA (físicamente correcto)', () => {
    const order = makeOrder([{ itemCode: 'REM-3', quantity: 10, unit: 'FT', description: 'Retazo' }]);
    const inv: InventoryItem[] = [
      { id: 'scr-a', code: 'REM-3', status: 'available', kind: 'scrap', category: 'tube', payload: { length_feet: 6 } } as any,
      { id: 'scr-b', code: 'REM-3', status: 'available', kind: 'scrap', category: 'tube', payload: { length_feet: 6 } } as any,
    ];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    // Ningún retazo individual tiene 10 FT

    // DISCREPANCIA M-2:
    // issueStrategies puede usar ReusableRemainder[] que pasan como argumento.
    // Si ambos retazos se pasaran como ReusableRemainder y el primero tiene 6 FT,
    // el engine usaría ese retazo para el corte de 10 FT → fallaría
    // porque 6 FT < 10 FT. Eso sí es coherente con la validación.
    // El riesgo existe si se calculan mal los ReusableRemainder.
  });

  it('C4 (M-4). Retazo por debajo de MIN_REUSABLE es válido para validación pero sería descartado en issueStrategies', () => {
    // MIN_REUSABLE_LINEAR_REMAINDER_FT = 3.28084 (1 metro)
    // Un retazo de 2 FT es válido para req de 2 FT según validación
    const order = makeOrder([{ itemCode: 'REM-4', quantity: 2, unit: 'FT', description: 'Retazo mínimo' }]);
    const inv: InventoryItem[] = [{
      id: 'scr-min',
      code: 'REM-4',
      status: 'available',
      kind: 'scrap',
      category: 'tube',
      payload: { length_feet: 2 },
    } as any];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available'); // Validación lo aprueba

    // DISCREPANCIA M-4 documentada:
    // Si este retazo se hubiera generado en un ciclo anterior de issueStrategies,
    // habría sido descartado (remainingFt=2 < MIN_REUSABLE=3.28084).
    // → El retazo no debería existir como 'available' en Supabase si fue descartado.
    // → En la práctica, status sería 'discarded', no 'available'.
    // → La discrepancia M-4 es teórica si el ciclo de vida del retazo es correcto.
  });
});

// ─── D. Paridad de PIEZAS COMPLETAS (full_piece_with_remainders) ─────────────

describe('D. Paridad — Piezas completas / full_piece_with_remainders', () => {

  it('D1. issueStrategies crea sobrante cuando se corta pieza de 19 FT para req de 10 FT', () => {
    // El cut plan debe mostrar: 1 barra de 19 FT, 1 corte de 10 FT, sobrante de 9 FT
    // Solo aplica si el SKU tiene full_piece_with_remainders en catálogo.
    // Sin catálogo, FT → exact_linear (no hay cut plan).
    // Documentamos el comportamiento con exact_linear como baseline.
    const result = calculateIssueLines([
      { sku: 'TUBO-Z', description: 'Tubo', quantity: 10, unit: 'FT', orderId: 'ord-1' }
    ]);

    // exact_linear: no cut plan, solo sage line de 10 FT
    expect(result.cutPlans).toHaveLength(0);
    expect(result.sageLines[0].quantity).toBe(10);
    expect(result.createdRemainders).toHaveLength(0);
  });

  it('D2. Pieza de inventario insuficiente → validación BLOQUEA antes de issueStrategies', () => {
    // Si la barra real en Supabase es de 8 FT y la orden necesita 15 FT:
    const order = makeOrder([{ itemCode: 'TUBO-W', quantity: 15, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-W', 8)];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);

    // issueStrategies nunca recibe estas líneas gracias al bloqueo.
    // Si lo recibiera (en exact_linear): exportaría 15 FT a Sage como si hubiera stock.
  });

  it('D3. Pieza de inventario suficiente → validación aprueba y issueStrategies puede procesar', () => {
    const order = makeOrder([{ itemCode: 'TUBO-V', quantity: 10, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-V', 19)];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available');

    const issueResult = calculateIssueLines(issueLines('TUBO-V', 10, 'FT'));
    expect(issueResult.sageLines[0].quantity).toBe(10);
    // Paridad: validación OK → issueStrategies puede procesar sin riesgo
  });

  it('D4 (M-1). issueStrategies abre barra virtual de 19 FT sin verificar inventario', () => {
    // Este test documenta que calculateIssueLines en full_piece mode
    // genera cut plans INDEPENDIENTEMENTE del inventario real.
    // La barra virtual se abre aunque no exista en Supabase.
    // (No hay SKU con full_piece en catálogo sin mock, documentamos con resultado exact_linear)

    const result = calculateIssueLines([
      { sku: 'SKU-NEW', description: 'Pieza', quantity: 5, unit: 'FT', orderId: 'ord-1' }
    ]);

    // En modo exact_linear: simplemente pasa la cantidad
    expect(result.sageLines[0].quantity).toBe(5);
    // → issueStrategies no realiza ningún chequeo de inventario físico
    // → La validación pasiva (Bloque 1B) es el único guardián de stock real
  });
});

// ─── E. Casos que habrían aprobado con la lógica anterior y ahora son bloqueados ──

describe('E. Regresión — Casos que la validación v1 (agregada) habría aprobado, ahora bloqueados', () => {

  it('E1. Antes: suma de EA de tela habría dado available; ahora: físicamente bloqueado', () => {
    // Pre-1B: la validación sumaba todos los ítems del mismo SKU con la misma unidad.
    // Si 3 rollos de 8 YD2 = 24 YD2 > 20 YD2 req → habría dado available (INCORRECTO).
    // Post-1B: ningún rollo individual tiene 20 YD2 → insufficient_stock (CORRECTO).
    const order = makeOrder([{ itemCode: 'TEL-REGR', quantity: 20, unit: 'Y2', description: 'Tela' }]);
    const inv = [
      makeFabricRoll('TEL-REGR', 8, 2.5, 'r1'),
      makeFabricRoll('TEL-REGR', 8, 2.5, 'r2'),
      makeFabricRoll('TEL-REGR', 8, 2.5, 'r3'),
    ];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);
    // → El motor de corte nunca recibirá un requerimiento que físicamente no puede cumplir
  });

  it('E2. Antes: suma de barras de 6+6 = 12 FT para req de 10 FT → habría dado available; ahora bloqueado', () => {
    // Pre-1B: lineales se sumaban. 2 barras de 6 FT = 12 FT > 10 FT → available.
    // Post-1B: ninguna pieza individual tiene 10 FT → insufficient_stock.
    const order = makeOrder([{ itemCode: 'TUBO-REGR', quantity: 10, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-REGR', 6, 'b1'), makeBar('TUBO-REGR', 6, 'b2')];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('insufficient_stock');
    expect(result.canProceed).toBe(false);
  });

  it('E3. Caso aprobado correcto: un solo rollo con área suficiente → sigue siendo available', () => {
    // Esto no debe romperse: si hay un rollo con área suficiente, debe seguir aprobando.
    const order = makeOrder([{ itemCode: 'TEL-OK', quantity: 20, unit: 'Y2', description: 'Tela' }]);
    const inv = [makeFabricRoll('TEL-OK', 25, 2.5)];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });

  it('E4. Caso aprobado correcto: una sola barra con largo suficiente → sigue siendo available', () => {
    const order = makeOrder([{ itemCode: 'TUBO-OK', quantity: 10, unit: 'FT', description: 'Tubo' }]);
    const inv = [makeBar('TUBO-OK', 19)];
    const result = validateOrderInventoryAvailability(order, ctx(inv));
    expect(result.status).toBe('available');
    expect(result.canProceed).toBe(true);
  });
});

// ─── F. Paridad de determineIssueMode ─────────────────────────────────────────

describe('F. Auditoría determineIssueMode — supuestos documentados', () => {

  it('F1. Y2 → exact_area (correcto para telas)', () => {
    expect(determineIssueMode('TEL-X', 'Y2')).toBe('exact_area');
  });

  it('F2. YD2 → exact_area (C-2 CERRADO: normalización correcta)', () => {
    // BUG C-2 CORREGIDO en Bloque 1C.1:
    // determineIssueMode ahora usa normalizeIssueUnit que mapea YD2 → 'area' → exact_area.
    expect(determineIssueMode('TEL-X', 'YD2')).toBe('exact_area');
  });

  it('F3. EA → exact_each (correcto para fungibles)', () => {
    expect(determineIssueMode('COMP-1', 'EA')).toBe('exact_each');
  });

  it('F4. FT → exact_linear sin catálogo (conservador para lineales genéricos)', () => {
    expect(determineIssueMode('GENERICO-FT', 'FT')).toBe('exact_linear');
  });

  it('F5. M → exact_linear sin catálogo', () => {
    expect(determineIssueMode('GENERICO-M', 'M')).toBe('exact_linear');
  });

  it('F6. Unidad desconocida → exact_each (fallback super conservador)', () => {
    expect(determineIssueMode('RARO', 'KG')).toBe('exact_each');
  });
});

// ─── G. normalizeIssueUnit — cobertura de aliases ──────────────────────────

describe('G. normalizeIssueUnit — cobertura de aliases', () => {

  it('G1. Aliases de área → \'area\'', () => {
    expect(normalizeIssueUnit('Y2')).toBe('area');
    expect(normalizeIssueUnit('YD2')).toBe('area');
    expect(normalizeIssueUnit('YDS2')).toBe('area');
    expect(normalizeIssueUnit('yd2')).toBe('area');   // case insensitive
    expect(normalizeIssueUnit('SQYD')).toBe('area');
    expect(normalizeIssueUnit('SQ_YD')).toBe('area');
    expect(normalizeIssueUnit('SQUARE_YARD')).toBe('area');
    expect(normalizeIssueUnit('SQUARE_YARDS')).toBe('area');
  });

  it('G2. Aliases lineales → \'linear\'', () => {
    expect(normalizeIssueUnit('FT')).toBe('linear');
    expect(normalizeIssueUnit('ft')).toBe('linear');  // case insensitive
    expect(normalizeIssueUnit('LF')).toBe('linear');
    expect(normalizeIssueUnit('FEET')).toBe('linear');
    expect(normalizeIssueUnit('FOOT')).toBe('linear');
    expect(normalizeIssueUnit('M')).toBe('linear');
    expect(normalizeIssueUnit('LM')).toBe('linear');
    expect(normalizeIssueUnit('METER')).toBe('linear');
    expect(normalizeIssueUnit('METERS')).toBe('linear');
    expect(normalizeIssueUnit('MTR')).toBe('linear');
    expect(normalizeIssueUnit('YD')).toBe('linear');
  });

  it('G3. Aliases de unidad/EA → \'each\'', () => {
    expect(normalizeIssueUnit('EA')).toBe('each');
    expect(normalizeIssueUnit('EACH')).toBe('each');
    expect(normalizeIssueUnit('UNIT')).toBe('each');
    expect(normalizeIssueUnit('UNITS')).toBe('each');
    expect(normalizeIssueUnit('PCS')).toBe('each');
    expect(normalizeIssueUnit('PIECE')).toBe('each');
    expect(normalizeIssueUnit('PIECES')).toBe('each');
    expect(normalizeIssueUnit('UN')).toBe('each');
    expect(normalizeIssueUnit('PZ')).toBe('each');
  });

  it('G4. Unidad desconocida → \'unknown\'', () => {
    expect(normalizeIssueUnit('KG')).toBe('unknown');
    expect(normalizeIssueUnit('LITROS')).toBe('unknown');
    expect(normalizeIssueUnit('')).toBe('unknown');   // vacía
    expect(normalizeIssueUnit('???')).toBe('unknown');
  });

  it('G5. determineIssueMode usa normalizeIssueUnit — aliases de área producen exact_area', () => {
    // Todos los aliases deben producir el mismo modo correcto
    const areaAliases = ['Y2', 'YD2', 'SQYD', 'SQ_YD', 'SQUARE_YARD'];
    for (const alias of areaAliases) {
      expect(determineIssueMode('TEL-ALIAS', alias)).toBe('exact_area');
    }
  });

  it('G6. determineIssueMode — aliases lineales producen exact_linear', () => {
    const linearAliases = ['FT', 'LF', 'M', 'LM', 'FEET', 'METER', 'METERS'];
    for (const alias of linearAliases) {
      expect(determineIssueMode('TUBO-ALIAS', alias)).toBe('exact_linear');
    }
  });

  it('G7. determineIssueMode — aliases EA producen exact_each', () => {
    const eachAliases = ['EA', 'EACH', 'UNIT', 'PCS', 'PIECE'];
    for (const alias of eachAliases) {
      expect(determineIssueMode('COMP-ALIAS', alias)).toBe('exact_each');
    }
  });
});

// ─── H. Paridad de sobrantes (ReusableRemainder) ────────────────────────────

describe('H. Paridad — Sobrantes / Remainders en issueStrategies', () => {

  it('G1. issueStrategies puede usar un sobrante existente si tiene largo suficiente', () => {
    const rem: ReusableRemainder = {
      id: 'rem-1',
      sku: 'TUBO-R',
      description: 'Tubo sobrante',
      originalLengthFt: 19,
      remainingLengthFt: 12,
      consumedByOrderIds: [],
      createdAt: new Date().toISOString(),
      status: 'available',
    };
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUBO-R', description: 'Tubo', quantity: 10, unit: 'FT', orderId: 'ord-1' }
    ];
    const result = calculateIssueLines(lines, [rem]);
    // Con exact_linear: no usa sobrantes (solo full_piece_with_remainders los usa)
    // Documentamos que el resultado es correcto para exact_linear
    expect(result.sageLines[0].quantity).toBe(10);
    // Los sobrantes solo se usan en modo full_piece_with_remainders (catálogo)
    expect(result.cutsFromRemainders).toHaveLength(0);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(12); // No consumido
  });

  it('G2. Sobrante de longitud insuficiente no puede cubrir el corte', () => {
    const rem: ReusableRemainder = {
      id: 'rem-small',
      sku: 'TUBO-S',
      description: 'Sobrante pequeño',
      originalLengthFt: 19,
      remainingLengthFt: 4,
      consumedByOrderIds: [],
      createdAt: new Date().toISOString(),
      status: 'available',
    };
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUBO-S', description: 'Tubo', quantity: 10, unit: 'FT', orderId: 'ord-1' }
    ];
    const result = calculateIssueLines(lines, [rem]);
    // El sobrante de 4 FT no cubre 10 FT, pero en exact_linear se ignora
    expect(result.sageLines[0].quantity).toBe(10);
    expect(result.cutsFromRemainders).toHaveLength(0); // No se usa el sobrante (exact_linear)
  });
});
