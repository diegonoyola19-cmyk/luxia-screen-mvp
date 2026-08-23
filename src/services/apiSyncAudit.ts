import type { SupabaseClient } from '@supabase/supabase-js';

export interface ApiSyncLogRecord {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  records_received: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  trigger: 'scheduled' | 'manual';
  triggered_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SyncHealthStatus {
  isHealthy: boolean;
  hoursSinceLastSuccess: number | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: 'success' | 'failed' | 'running' | 'never';
  lastLog: ApiSyncLogRecord | null;
  lastSuccessfulLog: ApiSyncLogRecord | null;
  nextScheduledRunUtc: string;
  healthMessage: string;
}

/**
 * Calculates the next scheduled run timestamp (06:00 or 18:00 UTC).
 */
export function calculateNextScheduledRun(referenceDate: Date = new Date()): string {
  const currentUtc = new Date(referenceDate.getTime());
  const year = currentUtc.getUTCFullYear();
  const month = currentUtc.getUTCMonth();
  const date = currentUtc.getUTCDate();
  const hour = currentUtc.getUTCHours();
  const minute = currentUtc.getUTCMinutes();

  let nextRun: Date;

  // Run times are 06:00 and 18:00 UTC
  if (hour < 6 || (hour === 6 && minute === 0)) {
    nextRun = new Date(Date.UTC(year, month, date, 6, 0, 0, 0));
  } else if (hour < 18 || (hour === 18 && minute === 0)) {
    nextRun = new Date(Date.UTC(year, month, date, 18, 0, 0, 0));
  } else {
    // Tomorrow at 06:00 UTC
    nextRun = new Date(Date.UTC(year, month, date + 1, 6, 0, 0, 0));
  }

  return nextRun.toISOString();
}

/**
 * Evaluates the health of the synchronization based on the 14-hour threshold.
 */
export function evaluateSyncHealth(
  lastSuccessfulSyncAt: string | null,
  lastAttemptLog: ApiSyncLogRecord | null,
  referenceDate: Date = new Date()
): { isHealthy: boolean; hoursSinceLastSuccess: number | null; healthMessage: string } {
  if (!lastSuccessfulSyncAt) {
    return {
      isHealthy: false,
      hoursSinceLastSuccess: null,
      healthMessage: 'Sin registro de sincronización exitosa previa',
    };
  }

  const successTime = new Date(lastSuccessfulSyncAt).getTime();
  const now = referenceDate.getTime();
  const diffHours = Math.max(0, (now - successTime) / (1000 * 60 * 60));

  if (diffHours > 14) {
    return {
      isHealthy: false,
      hoursSinceLastSuccess: Number(diffHours.toFixed(1)),
      healthMessage: `Alerta: Han transcurrido ${diffHours.toFixed(1)} horas (>14h) sin una sincronización exitosa`,
    };
  }

  if (lastAttemptLog && lastAttemptLog.status === 'failed') {
    return {
      isHealthy: true, // While last attempt failed, still within 14h window from previous success
      hoursSinceLastSuccess: Number(diffHours.toFixed(1)),
      healthMessage: `Atención: Último intento falló, pero el catálogo está dentro del umbral válido (${diffHours.toFixed(1)}h desde último éxito)`,
    };
  }

  return {
    isHealthy: true,
    hoursSinceLastSuccess: Number(diffHours.toFixed(1)),
    healthMessage: 'Sincronización al día y operativa',
  };
}

/**
 * Queries Supabase for latest sync audit records and returns comprehensive status.
 */
export async function fetchLatestSyncStatus(
  supabase: SupabaseClient,
  referenceDate: Date = new Date()
): Promise<SyncHealthStatus> {
  const nextScheduledRunUtc = calculateNextScheduledRun(referenceDate);

  // 1. Fetch latest attempt log
  const { data: latestLogs } = await supabase
    .from('api_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1);

  const lastLog: ApiSyncLogRecord | null = latestLogs?.[0] || null;

  // 2. Fetch latest successful log
  const { data: successLogs } = await supabase
    .from('api_sync_logs')
    .select('*')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1);

  const lastSuccessfulLog: ApiSyncLogRecord | null = successLogs?.[0] || null;
  const lastSuccessfulSyncAt = lastSuccessfulLog?.finished_at || null;
  const lastAttemptAt = lastLog?.started_at || null;
  const lastStatus: SyncHealthStatus['lastStatus'] = lastLog ? lastLog.status : 'never';

  const health = evaluateSyncHealth(lastSuccessfulSyncAt, lastLog, referenceDate);

  return {
    isHealthy: health.isHealthy,
    hoursSinceLastSuccess: health.hoursSinceLastSuccess,
    lastSuccessfulSyncAt,
    lastAttemptAt,
    lastStatus,
    lastLog,
    lastSuccessfulLog,
    nextScheduledRunUtc,
    healthMessage: health.healthMessage,
  };
}

/**
 * Formats an ISO date string to "DD MMM YYYY · HH:mm" in local user timezone.
 */
export function formatSyncDateTime(isoString: string | null | undefined, locale = 'es-ES'): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';

  const dateFormatted = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

  const timeFormatted = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${dateFormatted} · ${timeFormatted}`;
}

/**
 * Returns human readable trigger label.
 */
export function getTriggerLabel(trigger?: string | null): string {
  if (trigger === 'scheduled') return 'Automática';
  if (trigger === 'manual') return 'Manual';
  return '';
}

