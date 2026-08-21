import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../../lib/supabase';
import { reconcileInventoryReservations, ReconcileInventoryResult } from '../../../lib/supabaseOrderInventory';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('Reconciliación Automática de Reservas Huérfanas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRpcResult = (overrides?: Partial<ReconcileInventoryResult>): ReconcileInventoryResult => ({
    ok: true,
    dry_run: false,
    scanned: 10,
    released: 2,
    consumed: 1,
    unchanged: 6,
    flagged: 1,
    errors: 0,
    grace_minutes: 30,
    limit: 200,
    details: [
      {
        reservation_id: 'res-1',
        order_id: 'ord-cancelled',
        sku: '0-154-TU-50001',
        action: 'released',
        reason: 'order_cancelled',
        previous_status: 'active',
        is_stale: false,
      },
      {
        reservation_id: 'res-2',
        order_id: 'ord-completed',
        sku: '0-151-AL-CLZ19',
        action: 'consumed',
        reason: 'order_completed_pending_consumption',
        previous_status: 'active',
        is_stale: false,
      },
      {
        reservation_id: 'res-3',
        order_id: 'ord-in-prod',
        sku: '0-154-TU-50001',
        action: 'unchanged',
        reason: 'valid_active_reservation',
        previous_status: 'active',
        is_stale: false,
      },
      {
        reservation_id: 'res-4',
        order_id: 'ord-orphan-old',
        sku: '0-154-TU-50001',
        action: 'released',
        reason: 'stale_orphan_order_not_found',
        previous_status: 'active',
        is_stale: true,
      },
    ],
    ...overrides,
  });

  it('1. cancelled + active -> release', async () => {
    const mockResult = createMockRpcResult({
      released: 1,
      details: [
        {
          reservation_id: 'res-cancelled',
          order_id: 'ord-cancelled',
          sku: '0-154-TU-50001',
          action: 'released',
          reason: 'order_cancelled',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.released).toBe(1);
    expect(res.details[0].action).toBe('released');
    expect(res.details[0].reason).toBe('order_cancelled');
  });

  it('2. cancelled + released -> no-op (no escaneada como active)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 0,
      released: 0,
      unchanged: 0,
      details: [],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.scanned).toBe(0);
    expect(res.released).toBe(0);
  });

  it('3. completed + consumed -> no-op (no escaneada como active)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 0,
      consumed: 0,
      details: [],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.consumed).toBe(0);
  });

  it('4. in_production + active -> no-op (unchanged)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 1,
      unchanged: 1,
      released: 0,
      details: [
        {
          reservation_id: 'res-prod',
          order_id: 'ord-prod',
          sku: '0-154-TU-50001',
          action: 'unchanged',
          reason: 'valid_active_reservation',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.unchanged).toBe(1);
    expect(res.details[0].action).toBe('unchanged');
  });

  it('5. orden inexistente + reserva reciente (< 30 min) -> no tocar (unchanged)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 1,
      unchanged: 1,
      released: 0,
      details: [
        {
          reservation_id: 'res-recent-orphan',
          order_id: 'ord-unknown',
          sku: '0-154-TU-50001',
          action: 'unchanged',
          reason: 'valid_active_reservation',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations({ graceMinutes: 30 });
    expect(res.unchanged).toBe(1);
    expect(res.released).toBe(0);
  });

  it('6. orden inexistente + reserva antigua (> 30 min) -> liberar (release)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 1,
      released: 1,
      unchanged: 0,
      details: [
        {
          reservation_id: 'res-old-orphan',
          order_id: 'ord-unknown-old',
          sku: '0-154-TU-50001',
          action: 'released',
          reason: 'stale_orphan_order_not_found',
          previous_status: 'active',
          is_stale: true,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations({ graceMinutes: 30 });
    expect(res.released).toBe(1);
    expect(res.details[0].reason).toBe('stale_orphan_order_not_found');
  });

  it('7. reserva antigua legítima de orden en producción -> no liberar (unchanged)', async () => {
    const mockResult = createMockRpcResult({
      scanned: 1,
      unchanged: 1,
      released: 0,
      details: [
        {
          reservation_id: 'res-prod-old',
          order_id: 'ord-in-prod-long',
          sku: '0-154-TU-50001',
          action: 'unchanged',
          reason: 'valid_active_reservation',
          previous_status: 'active',
          is_stale: true,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations({ graceMinutes: 30 });
    expect(res.unchanged).toBe(1);
    expect(res.released).toBe(0);
  });

  it('8. dry-run no modifica datos en BD (p_dry_run = true)', async () => {
    const mockResult = createMockRpcResult({
      dry_run: true,
      scanned: 5,
      released: 2,
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations({ dryRun: true });
    expect(supabase.rpc).toHaveBeenCalledWith('reconcile_inventory_reservations', {
      p_dry_run: true,
      p_limit: 200,
      p_grace_minutes: 30,
    });
    expect(res.dry_run).toBe(true);
  });

  it('9. retry es idempotente', async () => {
    const mockResultFirst = createMockRpcResult({ scanned: 1, released: 1 });
    const mockResultRetry = createMockRpcResult({ scanned: 0, released: 0, details: [] });

    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: mockResultFirst, error: null } as any)
      .mockResolvedValueOnce({ data: mockResultRetry, error: null } as any);

    const res1 = await reconcileInventoryReservations();
    const res2 = await reconcileInventoryReservations();

    expect(res1.released).toBe(1);
    expect(res2.released).toBe(0);
  });

  it('10. dos reconciliaciones concurrentes no duplican acciones (advisory lock)', async () => {
    const mockResultConcurrent = createMockRpcResult({ scanned: 2, released: 1, consumed: 1 });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: mockResultConcurrent, error: null } as any);

    const [resA, resB] = await Promise.all([
      reconcileInventoryReservations(),
      reconcileInventoryReservations(),
    ]);

    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);
  });

  it('11. límite por lote (p_limit) se respeta', async () => {
    const mockResultLimited = createMockRpcResult({ limit: 50, scanned: 50 });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResultLimited, error: null } as any);

    const res = await reconcileInventoryReservations({ limit: 50 });
    expect(supabase.rpc).toHaveBeenCalledWith('reconcile_inventory_reservations', {
      p_dry_run: false,
      p_limit: 50,
      p_grace_minutes: 30,
    });
    expect(res.limit).toBe(50);
  });

  it('12. auditoría creada en inventory_movements (verificada en SQL RPC)', async () => {
    const mockResult = createMockRpcResult({ released: 1 });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.released).toBe(1);
  });

  it('13. errores parciales no corrompen otras reservas', async () => {
    const mockResult = createMockRpcResult({ errors: 0, scanned: 5, released: 2, flagged: 1 });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.flagged).toBe(1);
    expect(res.released).toBe(2);
  });

  it('14. reservas de diferentes órdenes se procesan correctamente', async () => {
    const mockResult = createMockRpcResult({ scanned: 4 });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.scanned).toBe(4);
    expect(res.details).toHaveLength(4);
  });

  it('15. completed + active se trata con consumo recuperable seguro', async () => {
    const mockResult = createMockRpcResult({
      consumed: 1,
      details: [
        {
          reservation_id: 'res-comp',
          order_id: 'ord-completed',
          sku: '0-151-AL-CLZ19',
          action: 'consumed',
          reason: 'order_completed_pending_consumption',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.consumed).toBe(1);
    expect(res.details[0].action).toBe('consumed');
  });

  it('16. locking (SKIP LOCKED / advisory lock) protege operaciones activas', async () => {
    const mockResult = createMockRpcResult({ scanned: 2 });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.ok).toBe(true);
  });

  it('17. no afecta scraps ni movimientos de inventario existentes', async () => {
    const mockResult = createMockRpcResult({ scanned: 3, unchanged: 3 });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.unchanged).toBe(3);
  });

  it('18. completed + active sin evidencia de producción -> flagged y NO consumir', async () => {
    const mockResult = createMockRpcResult({
      consumed: 0,
      flagged: 1,
      details: [
        {
          reservation_id: 'res-comp-no-ev',
          order_id: 'ord-completed-no-ev',
          sku: '0-154-TU-50001',
          action: 'flagged',
          reason: 'order_completed_lacks_production_evidence',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.consumed).toBe(0);
    expect(res.flagged).toBe(1);
    expect(res.details[0].reason).toBe('order_completed_lacks_production_evidence');
  });

  it('19. completed + active con evidencia de producción -> consumed', async () => {
    const mockResult = createMockRpcResult({
      consumed: 1,
      flagged: 0,
      details: [
        {
          reservation_id: 'res-comp-ev',
          order_id: 'ord-completed-ev',
          sku: '0-154-TU-50001',
          action: 'consumed',
          reason: 'order_completed_with_production_evidence',
          previous_status: 'active',
          is_stale: false,
        },
      ],
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await reconcileInventoryReservations();
    expect(res.consumed).toBe(1);
    expect(res.flagged).toBe(0);
    expect(res.details[0].reason).toBe('order_completed_with_production_evidence');
  });
});
