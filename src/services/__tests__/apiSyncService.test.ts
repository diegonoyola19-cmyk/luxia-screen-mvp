import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeVertiluxSync, type SyncExecutionOptions } from '../apiSyncService';
import { evaluateSyncHealth, calculateNextScheduledRun, formatSyncDateTime, getTriggerLabel } from '../apiSyncAudit';

describe('apiSyncService - executeVertiluxSync', () => {
  let mockSupabase: any;
  let mockInventoryItems: any[];
  let mockSyncLogs: any[];

  beforeEach(() => {
    mockInventoryItems = [
      {
        id: 'item-1',
        code: 'FAB-001',
        source: 'vertilux_api',
        status: 'available',
        payload: { isVirtualRoll: true },
        inventory_movements: [],
      },
    ];

    mockSyncLogs = [];

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'api_sync_logs') {
          return {
            insert: vi.fn((payload: any) => {
              const logEntry = { id: `log-${Date.now()}`, ...payload };
              mockSyncLogs.push(logEntry);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: logEntry, error: null }),
                })),
                data: [logEntry],
                error: null,
              };
            }),
            update: vi.fn((updates: any) => ({
              eq: vi.fn((field: string, val: string) => {
                const log = mockSyncLogs.find((l) => l.id === val);
                if (log) Object.assign(log, updates);
                return Promise.resolve({ data: log, error: null });
              }),
            })),
            select: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: mockSyncLogs, error: null }),
              })),
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: mockSyncLogs.filter((l) => l.status === 'success'),
                    error: null,
                  }),
                })),
                gte: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: mockSyncLogs.filter((l) => l.status === 'running'),
                    error: null,
                  }),
                })),
              })),
            })),
          };
        }

        if (table === 'inventory_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                range: vi.fn((from: number, to: number) => {
                  return Promise.resolve({
                    data: mockInventoryItems.slice(from, to + 1),
                    error: null,
                  });
                }),
                then: (resolve: any) => resolve({ data: [...mockInventoryItems], error: null }),
              })),
            })),
            insert: vi.fn((items: any[]) => {
              for (const item of items) {
                mockInventoryItems.push({ id: `item-${Date.now()}-${Math.random()}`, ...item });
              }
              return Promise.resolve({ error: null });
            }),
            upsert: vi.fn((items: any[]) => {
              for (const item of items) {
                const existingIdx = mockInventoryItems.findIndex(
                  (i) => (item.id && i.id === item.id) || i.code === item.code
                );
                if (existingIdx >= 0) {
                  mockInventoryItems[existingIdx] = { ...mockInventoryItems[existingIdx], ...item };
                } else {
                  mockInventoryItems.push({ id: `item-${Date.now()}-${Math.random()}`, ...item });
                }
              }
              return Promise.resolve({ error: null });
            }),
          };
        }

        return {} as any;
      }),
    };
  });

  it('1. Sync success: consulta API, mapea items, guarda en inventario y genera log exitoso', async () => {
    const mockApiResponse = [
      {
        ITEMNO: 'FAB-001',
        DESCRIPTION: 'Screen 5% White 2.50m (98")',
        UNIT: 'YD',
        QTYONHAND: 120,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 120,
      },
      {
        ITEMNO: 'FAB-002',
        DESCRIPTION: 'Screen 1% Grey 3.00m (118")',
        UNIT: 'YD',
        QTYONHAND: 85,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 85,
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockApiResponse),
    });

    const result = await executeVertiluxSync({
      supabase: mockSupabase,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    });

    expect(result.status).toBe('success');
    expect(result.recordsReceived).toBe(2);
    expect(result.recordsCreated).toBe(1); // FAB-002 was new
    expect(result.recordsUpdated).toBe(1); // FAB-001 was existing
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify log in api_sync_logs
    const updatedLog = mockSyncLogs[0];
    expect(updatedLog.status).toBe('success');
    expect(updatedLog.records_received).toBe(2);
  });

  it('2. Idempotencia: una segunda ejecución con los mismos datos no duplica registros', async () => {
    const mockApiResponse = [
      {
        ITEMNO: 'FAB-001',
        DESCRIPTION: 'Screen 5% White 2.50m (98")',
        UNIT: 'YD',
        QTYONHAND: 120,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 120,
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockApiResponse),
    });

    const opts: SyncExecutionOptions = {
      supabase: mockSupabase,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    };

    // First execution
    const res1 = await executeVertiluxSync(opts);
    const countAfter1 = mockInventoryItems.length;

    // Second immediate execution
    const res2 = await executeVertiluxSync(opts);
    const countAfter2 = mockInventoryItems.length;

    expect(res1.status).toBe('success');
    expect(res2.status).toBe('success');
    expect(res2.recordsCreated).toBe(0);
    expect(res2.recordsUpdated).toBe(1);
    expect(countAfter2).toBe(countAfter1);
  });

  it('3. Error de API: no borra datos válidos y registra status failed en api_sync_logs', async () => {
    const initialItemCount = mockInventoryItems.length;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await executeVertiluxSync({
      supabase: mockSupabase,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('500');
    expect(mockInventoryItems.length).toBe(initialItemCount); // Existing data preserved

    const failedLog = mockSyncLogs[0];
    expect(failedLog.status).toBe('failed');
    expect(failedLog.error_message).toContain('500');
  });

  it('4. Concurrencia: si hay una sincronización en running iniciada hace menos de 5 min, omite la segunda', async () => {
    // Add an active running log in mock
    mockSyncLogs.push({
      id: 'running-log-1',
      started_at: new Date().toISOString(),
      status: 'running',
      trigger: 'scheduled',
    });

    const mockFetch = vi.fn();

    const result = await executeVertiluxSync({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'api_sync_logs') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({
                      data: [mockSyncLogs[0]],
                      error: null,
                    }),
                  })),
                })),
              })),
            };
          }
          return {} as any;
        }),
      } as any,
      trigger: 'manual',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    });

    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toContain('Ya existe una ejecución en curso');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('5. Endpoint default usa HTTPS estrictamente', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });

    await executeVertiluxSync({
      supabase: mockSupabase,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://ims.vertilux.com/api/catp/catp.php',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('6. Deduplicación: respuestas de la API con ITEMNO duplicado no generan IDs duplicados en upsert', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    const customSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'api_sync_logs') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'log-dedup' }, error: null }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
          };
        }
        if (table === 'inventory_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                range: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'existing-uuid-1',
                        code: 'DUP-001',
                        status: 'available',
                        payload: {},
                        inventory_movements: [],
                      },
                    ],
                    error: null,
                  })
                ),
              })),
            })),
            insert: insertSpy,
            upsert: upsertSpy,
          };
        }
        return {} as any;
      }),
    };

    // Mock API response with duplicate items for existing item and new item
    const mockApiResponse = [
      {
        ITEMNO: 'DUP-001',
        DESCRIPTION: 'Screen 5% White 2.50m (98")',
        UNIT: 'YD',
        QTYONHAND: 50,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 50,
      },
      {
        ITEMNO: 'DUP-001', // duplicate of existing
        DESCRIPTION: 'Screen 5% White 2.50m (98")',
        UNIT: 'YD',
        QTYONHAND: 75,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 75,
      },
      {
        ITEMNO: 'NEW-002', // new item
        DESCRIPTION: 'Screen 1% Grey 3.00m (118")',
        UNIT: 'YD',
        QTYONHAND: 100,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 100,
      },
      {
        ITEMNO: 'NEW-002', // duplicate of new item
        DESCRIPTION: 'Screen 1% Grey 3.00m (118")',
        UNIT: 'YD',
        QTYONHAND: 120,
        QTYSALORDR: 0,
        QTYONORDER: 0,
        QTYOFFSET: 120,
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockApiResponse),
    });

    const result = await executeVertiluxSync({
      supabase: customSupabase as any,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: 'test-key',
        user: 'test-user',
        password: 'test-password',
        country: 'SLV',
      },
      fetchFn: mockFetch as any,
    });

    expect(result.status).toBe('success');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // Verify upsert was called with exactly 1 item (no duplicates)
    const upsertedBatch = upsertSpy.mock.calls[0][0];
    expect(upsertedBatch).toHaveLength(1);
    expect(upsertedBatch[0].id).toBe('existing-uuid-1');

    // Verify insert was called with exactly 1 item (no duplicates)
    const insertedBatch = insertSpy.mock.calls[0][0];
    expect(insertedBatch).toHaveLength(1);
    expect(insertedBatch[0].code).toBe('NEW-002');
  });
});

describe('apiSyncAudit - Schedule & Health Evaluation', () => {
  it('4. calculateNextScheduledRun calcula las 06:00 UTC si es antes de las 6am', () => {
    const date = new Date(Date.UTC(2026, 7, 23, 3, 30, 0)); // 03:30 UTC
    const next = calculateNextScheduledRun(date);
    expect(next).toBe(new Date(Date.UTC(2026, 7, 23, 6, 0, 0)).toISOString());
  });

  it('5. calculateNextScheduledRun calcula las 18:00 UTC si es entre 6am y 6pm', () => {
    const date = new Date(Date.UTC(2026, 7, 23, 10, 15, 0)); // 10:15 UTC
    const next = calculateNextScheduledRun(date);
    expect(next).toBe(new Date(Date.UTC(2026, 7, 23, 18, 0, 0)).toISOString());
  });

  it('6. calculateNextScheduledRun calcula las 06:00 UTC del día siguiente si es después de las 6pm', () => {
    const date = new Date(Date.UTC(2026, 7, 23, 19, 0, 0)); // 19:00 UTC
    const next = calculateNextScheduledRun(date);
    expect(next).toBe(new Date(Date.UTC(2026, 7, 24, 6, 0, 0)).toISOString());
  });

  it('7. evaluateSyncHealth reporta saludable si han transcurrido <= 14 horas desde último éxito', () => {
    const now = new Date(Date.UTC(2026, 7, 23, 12, 0, 0));
    const lastSuccess = new Date(Date.UTC(2026, 7, 23, 6, 0, 0)).toISOString(); // 6 hours ago

    const health = evaluateSyncHealth(lastSuccess, null, now);
    expect(health.isHealthy).toBe(true);
    expect(health.hoursSinceLastSuccess).toBe(6);
  });

  it('8. evaluateSyncHealth reporta alerta si han transcurrido > 14 horas desde último éxito', () => {
    const now = new Date(Date.UTC(2026, 7, 23, 21, 0, 0));
    const lastSuccess = new Date(Date.UTC(2026, 7, 23, 6, 0, 0)).toISOString(); // 15 hours ago

    const health = evaluateSyncHealth(lastSuccess, null, now);
    expect(health.isHealthy).toBe(false);
    expect(health.hoursSinceLastSuccess).toBe(15);
    expect(health.healthMessage).toContain('>14h');
  });

  it('9. evaluateSyncHealth reporta no saludable si nunca ha habido una sincronización exitosa', () => {
    const health = evaluateSyncHealth(null, null);
    expect(health.isHealthy).toBe(false);
    expect(health.hoursSinceLastSuccess).toBeNull();
  });
});

describe('apiSyncAudit - Formatting and Helpers', () => {
  it('10. formatSyncDateTime formatea correctamente a DD MMM YYYY · HH:mm en español', () => {
    const iso = '2026-08-22T18:00:00.000Z';
    const formatted = formatSyncDateTime(iso, 'es-ES');
    expect(formatted).toMatch(/\d{2}\s+[a-z]{3,}\s+\d{4}\s+·\s+\d{2}:\d{2}/i);
  });

  it('11. formatSyncDateTime devuelve em-dash para valores nulos o inválidos', () => {
    expect(formatSyncDateTime(null)).toBe('—');
    expect(formatSyncDateTime(undefined)).toBe('—');
    expect(formatSyncDateTime('invalid-date')).toBe('—');
  });

  it('12. getTriggerLabel devuelve Automática para scheduled y Manual para manual', () => {
    expect(getTriggerLabel('scheduled')).toBe('Automática');
    expect(getTriggerLabel('manual')).toBe('Manual');
    expect(getTriggerLabel(null)).toBe('');
  });
});
