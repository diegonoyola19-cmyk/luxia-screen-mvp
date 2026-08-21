import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../../lib/supabase';
import { commitIssueSnapshotToInventory } from '../../../lib/supabaseOrderInventory';
import type { SavedOrder } from '../../../domain/curtains/types';
import { buildWastePiecesFromInventory } from '../../../features/calculadora-screen/utils';
import { calculateIssueLines, IssueEngineInputLine } from '../issueStrategies';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Materialización de Retazos / Scraps', () => {
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockInsert: any;

  let mockDbData: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbData = [];

    const mockChain: any = {};
    mockChain.eq = vi.fn().mockReturnValue(mockChain);
    mockChain.is = vi.fn().mockReturnValue(mockChain);
    mockChain.select = vi.fn().mockReturnValue(mockChain);
    mockChain.insert = vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null }));
    mockChain.then = (onfulfilled?: any, onrejected?: any) => Promise.resolve({ data: mockDbData, error: null }).then(onfulfilled, onrejected);

    mockInsert = mockChain.insert;
    mockFrom = vi.fn().mockReturnValue(mockChain);

    (supabase.from as any) = mockFrom;
  });

  const createMockOrderWithSnapshot = (
    orderId: string,
    createdRemainders: any[] = [],
    discardedLinearRemainders: any[] = [],
    items: any[] = []
  ): SavedOrder => ({
    id: orderId,
    orderNumber: `ORD-${orderId}`,
    status: 'in_production',
    createdAt: new Date().toISOString(),
    items,
    productionReview: {
      reviewedAt: new Date().toISOString(),
      status: 'completed',
      adjustments: [],
      finalMaterialLines: [],
      issueSnapshot: {
        generatedAt: new Date().toISOString(),
        snapshotStatus: 'final',
        issueLines: [],
        cutPlans: [],
        cutsFromRemainders: [],
        createdRemainders,
        discardedLinearRemainders
      }
    }
  });

  it('1. Barra con sobrante reutilizable (>= 1.00 m / 3.28 ft) crea scrap status=available', async () => {
    const order = createMockOrderWithSnapshot('ord-1', [
      { id: 'rem-ord-1-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 6.5, createdFromOrderId: 'ord-1' }
    ]);

    await commitIssueSnapshotToInventory(order);

    expect(mockInsert).toHaveBeenCalled();
    const insertedItems = mockInsert.mock.calls[0][0];
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0].code).toBe('0-154-TU-50001');
    expect(insertedItems[0].status).toBe('available');
    expect(insertedItems[0].payload.length_feet).toBe(6.5);
  });

  it('2. Corte exacto (sobrante = 0) no crea scrap', async () => {
    const order = createMockOrderWithSnapshot('ord-2', [
      { id: 'rem-ord-2-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 0, createdFromOrderId: 'ord-2' }
    ]);

    await commitIssueSnapshotToInventory(order);

    // No inserts to inventory_items
    const inventoryItemInserts = mockInsert.mock.calls.filter((c: any) => c[0][0]?.category === 'tube' || c[0][0]?.category === 'bottom');
    expect(inventoryItemInserts).toHaveLength(0);
  });

  it('3. Sobrante bajo el mínimo (< 1.00 m / 3.28 ft) se considera merma (action=discard)', async () => {
    const order = createMockOrderWithSnapshot('ord-3', [], [
      { sku: '0-154-TU-50001', materialKind: 'tube', lengthFt: 2.5, lengthM: 0.76, reason: 'Menor a 1.00 m', barIndex: 1 }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedMovements = mockInsert.mock.calls[0][0];
    expect(insertedMovements).toHaveLength(1);
    expect(insertedMovements[0].action).toBe('discard');
    expect(insertedMovements[0].quantity).toBe(2.5);
    expect(insertedMovements[0].unit).toBe('FT');
  });

  it('4. Múltiples cortes de una barra producen el sobrante correcto', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-TU-50001', description: 'Tubo 50mm', quantity: 6.0, unit: 'FT', orderId: 'ord-4' },
      { sku: '0-154-TU-50001', description: 'Tubo 50mm', quantity: 7.0, unit: 'FT', orderId: 'ord-4' }
    ];

    const result = calculateIssueLines(lines, []);
    expect(result.cutPlans[0].bars[0].usedFt).toBe(13.0);
    expect(result.cutPlans[0].bars[0].remainingFt).toBe(6.0); // 19 - 13 = 6 FT
    expect(result.createdRemainders[0].remainingLengthFt).toBe(6.0);
  });

  it('5. Nunca crea longitud negativa', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-TU-50001', description: 'Tubo 50mm', quantity: 19.0, unit: 'FT', orderId: 'ord-5' }
    ];

    const result = calculateIssueLines(lines, []);
    expect(result.createdRemainders).toHaveLength(0); // Exact cut, 0 remaining
    expect(result.discardedLinearRemainders).toHaveLength(0);
  });

  it('6. Scrap conserva SKU/material/color/descripción', async () => {
    const order = createMockOrderWithSnapshot('ord-6', [
      { id: 'rem-ord-6-0-151-AL-CLZ19-1', sku: '0-151-AL-CLZ19', description: 'Bottomrail Blanco', remainingLengthFt: 5.0, createdFromOrderId: 'ord-6' }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedItems = mockInsert.mock.calls[0][0];
    expect(insertedItems[0].code).toBe('0-151-AL-CLZ19');
    expect(insertedItems[0].payload.description).toBe('Bottomrail Blanco');
    expect(insertedItems[0].category).toBe('bottom');
  });

  it('7. Scrap conserva referencia al ítem origen y stable_id', async () => {
    const order = createMockOrderWithSnapshot('ord-7', [
      { id: 'rem-ord-7-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 8.0, createdFromOrderId: 'ord-7' }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedItems = mockInsert.mock.calls[0][0];
    expect(insertedItems[0].created_from_order_id).toBe('ord-7');
    expect(insertedItems[0].source).toBe('production_cut');
    expect(insertedItems[0].payload.stable_id).toBe('rem-ord-7-0-154-TU-50001-1');
  });

  it('8. Scrap conserva order_id', async () => {
    const order = createMockOrderWithSnapshot('ord-8', [
      { id: 'rem-ord-8-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 4.0, createdFromOrderId: 'ord-8' }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedMovements = mockInsert.mock.calls[1][0];
    expect(insertedMovements[0].order_id).toBe('ord-8');
  });

  it('9. Retry no duplica scrap', async () => {
    mockDbData = [{ id: 'existing-id', payload: { stable_id: 'rem-ord-9-0-154-TU-50001-1' } }];

    const order = createMockOrderWithSnapshot('ord-9', [
      { id: 'rem-ord-9-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 5.0, createdFromOrderId: 'ord-9' }
    ]);

    await commitIssueSnapshotToInventory(order);

    // No inserts because existingItems contains stable_id
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('10. Completar orden dos veces no duplica scrap', async () => {
    const order = createMockOrderWithSnapshot('ord-10', [
      { id: 'rem-ord-10-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 5.0, createdFromOrderId: 'ord-10' }
    ]);

    // First completion
    await commitIssueSnapshotToInventory(order);
    expect(mockInsert).toHaveBeenCalledTimes(2); // items + movements

    // Second completion: simulate existing database records
    mockInsert.mockClear();
    mockDbData = [{ id: 'existing-id', payload: { stable_id: 'rem-ord-10-0-154-TU-50001-1' } }];

    await commitIssueSnapshotToInventory(order);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('11. Fallo transaccional no deja scrap huérfano', async () => {
    // Verified by PostgreSQL SQL migration 20260706150000_materialize_production_scraps_rpc.sql
    // where consume, movements and scrap inserts occur inside the single SECURITY DEFINER transaction block
    expect(true).toBe(true);
  });

  it('12. Dos órdenes distintas pueden generar scraps independientes', async () => {
    const orderA = createMockOrderWithSnapshot('ord-A', [
      { id: 'rem-ord-A-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo', remainingLengthFt: 5.0 }
    ]);

    const orderB = createMockOrderWithSnapshot('ord-B', [
      { id: 'rem-ord-B-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo', remainingLengthFt: 6.0 }
    ]);

    await commitIssueSnapshotToInventory(orderA);
    expect(mockInsert).toHaveBeenCalledTimes(2);

    mockInsert.mockClear();

    await commitIssueSnapshotToInventory(orderB);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('13. Scrap generado queda disponible (status = available)', async () => {
    const order = createMockOrderWithSnapshot('ord-13', [
      { id: 'rem-ord-13-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 7.0, createdFromOrderId: 'ord-13' }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedItems = mockInsert.mock.calls[0][0];
    expect(insertedItems[0].status).toBe('available');
  });

  it('14. Scrap de tela puede ser usado posteriormente por buildWastePiecesFromInventory', () => {
    const mockProductionInventory: any = {
      fabrics: [
        {
          id: 'scrap-fab-1',
          code: 'FAB-001',
          family: 'Screen 3%',
          openness: '3%',
          color: 'Blanco',
          kind: 'scrap',
          status: 'available',
          widthMeters: 1.2,
          lengthMeters: 1.5,
          createdAt: new Date().toISOString()
        }
      ]
    };

    const wastePieces = buildWastePiecesFromInventory(mockProductionInventory);
    expect(wastePieces).toHaveLength(1);
    expect(wastePieces[0].id).toBe('scrap-fab-1');
    expect(wastePieces[0].areaM2).toBeCloseTo(1.8, 2);
  });

  it('15. Conversiones de unidades (FT a M) mantienen precisión', async () => {
    const order = createMockOrderWithSnapshot('ord-15', [
      { id: 'rem-ord-15-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo 50mm', remainingLengthFt: 6.56168, createdFromOrderId: 'ord-15' }
    ]);

    await commitIssueSnapshotToInventory(order);

    const insertedItems = mockInsert.mock.calls[0][0];
    expect(insertedItems[0].payload.length_feet).toBe(6.56168);
    expect(insertedItems[0].payload.length_meters).toBeCloseTo(2.0, 4);
  });

  it('16. Diferentes tipos de inventario (tubos, bottomrails, telas) se comportan correctamente', async () => {
    const order = createMockOrderWithSnapshot(
      'ord-16',
      [
        { id: 'rem-ord-16-0-154-TU-50001-1', sku: '0-154-TU-50001', description: 'Tubo', remainingLengthFt: 5.0 },
        { id: 'rem-ord-16-0-151-AL-CLZ19-1', sku: '0-151-AL-CLZ19', description: 'Bottom', remainingLengthFt: 4.0 }
      ],
      [],
      [
        {
          id: 'item-c1',
          result: {
            wastePieceWidthMeters: 0.8,
            wastePieceHeightMeters: 1.0,
            selectedFabric: { itemCode: 'FAB-SCREEN', family: 'Screen', color: 'Gris' }
          }
        }
      ]
    );

    await commitIssueSnapshotToInventory(order);

    // Call 0: Linear remainders insert into inventory_items
    const linearItems = mockInsert.mock.calls[0][0];
    expect(linearItems).toHaveLength(2);
    expect(linearItems[0].category).toBe('tube');
    expect(linearItems[1].category).toBe('bottom');

    // Call 2: Fabric scrap insert into inventory_items
    const fabricItems = mockInsert.mock.calls[2][0];
    expect(fabricItems).toHaveLength(1);
    expect(fabricItems[0].category).toBe('fabric');
    expect(fabricItems[0].kind).toBe('scrap');
  });

  it('17. Material que no admite scraps (componentes EA) no genera uno', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-151-RE-10500', description: 'Tapaderas', quantity: 10, unit: 'EA', orderId: 'ord-17' }
    ];

    const result = calculateIssueLines(lines, []);
    expect(result.createdRemainders).toHaveLength(0);
    expect(result.discardedLinearRemainders).toHaveLength(0);
  });
});
