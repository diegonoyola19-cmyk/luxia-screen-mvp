import type { SupabaseClient } from '@supabase/supabase-js';
import { mapVertiluxApiInventoryItem, type VertiluxApiRawItem } from './mapVertiluxApiInventoryItem.js';
import { planSyncForItem, buildUpsertPayload, type InventoryItemRecord } from './syncVertiluxInventoryPlan.js';

export interface VertiluxApiConfig {
  apiUrl?: string;
  apiKey: string;
  user: string;
  password: string;
  country: string;
}

export interface SyncExecutionOptions {
  supabase: SupabaseClient;
  trigger: 'scheduled' | 'manual';
  triggeredByUserId?: string;
  apiConfig?: VertiluxApiConfig;
  fetchFn?: typeof fetch;
  limit?: number;
}

export interface SyncExecutionResult {
  logId: string;
  status: 'success' | 'failed' | 'skipped';
  trigger: 'scheduled' | 'manual';
  recordsReceived: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsReconciled: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorMessage?: string;
  summaryByCategory?: {
    fabric: number;
    tube: number;
    bottom: number;
    component: number;
  };
}

const DEFAULT_API_URL = 'https://ims.vertilux.com/api/catp/catp.php';

export async function executeVertiluxSync(options: SyncExecutionOptions): Promise<SyncExecutionResult> {
  const {
    supabase,
    trigger,
    triggeredByUserId,
    apiConfig,
    fetchFn = fetch,
    limit = Infinity,
  } = options;

  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // 1. Concurrency Lock: Prevent concurrent syncs if one started in the last 5 minutes
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: runningLogs } = await supabase
      .from('api_sync_logs')
      .select('id, started_at, trigger')
      .eq('status', 'running')
      .gte('started_at', fiveMinutesAgo)
      .limit(1);

    if (runningLogs && runningLogs.length > 0) {
      console.warn('[executeVertiluxSync] Concurrent execution detected. Skipping.');
      return {
        logId: runningLogs[0].id,
        status: 'skipped',
        trigger,
        recordsReceived: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsReconciled: 0,
        startedAt,
        finishedAt: startedAt,
        durationMs: 0,
        errorMessage: `Sincronización omitida: Ya existe una ejecución en curso iniciada a las ${runningLogs[0].started_at}`,
      };
    }
  } catch (err) {
    console.warn('[executeVertiluxSync] Could not check concurrent lock:', err);
  }

  // 2. Create initial log entry with status = 'running'
  let logId: string | undefined;
  try {
    const { data: initialLog, error: initialLogErr } = await supabase
      .from('api_sync_logs')
      .insert({
        source: 'vertilux_api',
        started_at: startedAt,
        status: 'running',
        trigger,
        triggered_by: triggeredByUserId || null,
        records_received: 0,
        records_created: 0,
        records_updated: 0,
        records_skipped: 0,
      })
      .select('id')
      .single();

    if (!initialLogErr && initialLog) {
      logId = initialLog.id;
    }
  } catch (err) {
    console.warn('[executeVertiluxSync] Could not create initial running log:', err);
  }

  try {
    // 3. Resolve credentials safely without assuming Node.js process global
    const getEnvVar = (key: string): string | undefined => {
      if (typeof process !== 'undefined' && process?.env) {
        return process.env[key];
      }
      return undefined;
    };

    const apiKey = apiConfig?.apiKey || getEnvVar('VERTILUX_API_KEY');
    const user = apiConfig?.user || getEnvVar('VERTILUX_API_USER');
    const password = apiConfig?.password || getEnvVar('VERTILUX_API_PASSWORD');
    const country = apiConfig?.country || getEnvVar('VERTILUX_API_COUNTRY') || 'SLV';
    const apiUrl = apiConfig?.apiUrl || DEFAULT_API_URL;

    if (!apiKey || !user || !password) {
      throw new Error('Missing Vertilux API credentials (API_KEY, USER, or PASSWORD)');
    }

    // 3. Fetch from Vertilux API
    const response = await fetchFn(apiUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'X-USER': user,
        'X-PASSWORD': password,
        'X-COUNTRY': country,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Vertilux API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const rawData: VertiluxApiRawItem[] = await response.json().catch(() => null);
    if (!rawData || !Array.isArray(rawData)) {
      const apiErr = (rawData as any)?.error || 'Vertilux API response is not a valid JSON array';
      throw new Error(`Vertilux API error: ${apiErr}`);
    }

    const recordsReceived = rawData.length;

    // 4. Fetch existing API items from Supabase to reconcile without wiping user cuts/scraps
    const { data: existingData, error: existingError } = await supabase
      .from('inventory_items')
      .select('id, code, status, payload, inventory_movements(count)')
      .eq('source', 'vertilux_api');

    if (existingError) {
      throw new Error(`Error querying existing inventory items: ${existingError.message}`);
    }

    const existingMap = new Map<string, InventoryItemRecord>();
    for (const item of (existingData || [])) {
      const movementsCount = Array.isArray(item.inventory_movements)
        ? item.inventory_movements[0]?.count ?? 0
        : (item.inventory_movements as any)?.count ?? 0;

      existingMap.set(item.code, {
        id: item.id,
        code: item.code,
        status: item.status,
        payload: item.payload,
        movements_count: movementsCount,
      });
    }

    // 5. Map and categorize records
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let reconciledCount = 0;

    const byCategory = { fabric: 0, tube: 0, bottom: 0, component: 0 };
    const inserts: any[] = [];
    const updates: any[] = [];

    const syncTimestamp = new Date().toISOString();
    let processed = 0;

    for (const rawItem of rawData) {
      if (processed >= limit) break;
      processed++;

      const mapped = mapVertiluxApiInventoryItem(rawItem, syncTimestamp);
      if (!mapped.success) {
        skippedCount++;
        continue;
      }

      const category = mapped.item.category;
      if (category in byCategory) {
        byCategory[category as keyof typeof byCategory]++;
      }

      const existingItem = existingMap.get(mapped.item.code);
      const plan = planSyncForItem(mapped, existingItem);
      const payload = buildUpsertPayload(plan, existingItem);

      if (plan.action === 'skip' || !payload) {
        skippedCount++;
        continue;
      }

      if (plan.action === 'insert') {
        createdCount++;
        inserts.push(payload);
      } else if (plan.action === 'update') {
        updatedCount++;
        updates.push(payload);
      } else if (plan.action === 'reconcile') {
        reconciledCount++;
        updates.push(payload);
      }
    }

    // 6. Batch upsert into database (chunks of 500)
    const chunkAndUpsert = async (dataList: any[]) => {
      const chunkSize = 500;
      for (let i = 0; i < dataList.length; i += chunkSize) {
        const chunk = dataList.slice(i, i + chunkSize);
        const { error: upsertErr } = await supabase
          .from('inventory_items')
          .upsert(chunk, { onConflict: 'id' });

        if (upsertErr) {
          throw new Error(`Error upserting inventory chunk ${i / chunkSize + 1}: ${upsertErr.message}`);
        }
      }
    };

    if (inserts.length > 0) await chunkAndUpsert(inserts);
    if (updates.length > 0) await chunkAndUpsert(updates);

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // 7. Update log to 'success'
    const successResult: SyncExecutionResult = {
      logId: logId || '',
      status: 'success',
      trigger,
      recordsReceived,
      recordsCreated: createdCount,
      recordsUpdated: updatedCount,
      recordsSkipped: skippedCount,
      recordsReconciled: reconciledCount,
      startedAt,
      finishedAt,
      durationMs,
      summaryByCategory: byCategory,
    };

    if (logId) {
      await supabase
        .from('api_sync_logs')
        .update({
          finished_at: finishedAt,
          status: 'success',
          records_received: recordsReceived,
          records_created: createdCount,
          records_updated: updatedCount,
          records_skipped: skippedCount,
          metadata: {
            durationMs,
            recordsReconciled: reconciledCount,
            summaryByCategory: byCategory,
          },
        })
        .eq('id', logId);
    } else {
      const { data: newLog } = await supabase
        .from('api_sync_logs')
        .insert({
          source: 'vertilux_api',
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'success',
          trigger,
          triggered_by: triggeredByUserId || null,
          records_received: recordsReceived,
          records_created: createdCount,
          records_updated: updatedCount,
          records_skipped: skippedCount,
          metadata: {
            durationMs,
            recordsReconciled: reconciledCount,
            summaryByCategory: byCategory,
          },
        })
        .select('id')
        .single();

      if (newLog) successResult.logId = newLog.id;
    }

    return successResult;
  } catch (err: any) {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    const errorMessage = err?.message || String(err);

    console.error('[executeVertiluxSync] Sync failed:', errorMessage);

    if (logId) {
      await supabase
        .from('api_sync_logs')
        .update({
          finished_at: finishedAt,
          status: 'failed',
          error_message: errorMessage,
          metadata: { durationMs },
        })
        .eq('id', logId);
    } else {
      await supabase
        .from('api_sync_logs')
        .insert({
          source: 'vertilux_api',
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'failed',
          error_message: errorMessage,
          trigger,
          triggered_by: triggeredByUserId || null,
          records_received: 0,
          records_created: 0,
          records_updated: 0,
          records_skipped: 0,
          metadata: { durationMs },
        });
    }

    return {
      logId: logId || '',
      status: 'failed',
      trigger,
      recordsReceived: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsReconciled: 0,
      startedAt,
      finishedAt,
      durationMs,
      errorMessage,
    };
  }
}
