export interface ReconcileRequestOptions {
  dryRun?: boolean;
  limit?: number;
  graceMinutes?: number;
}

export function parseReconcileOptions(url: URL, body?: Record<string, any>): ReconcileRequestOptions {
  const dryRunParam = url.searchParams.get('dry_run') ?? url.searchParams.get('dryRun') ?? body?.dryRun ?? body?.dry_run;
  const limitParam = url.searchParams.get('limit') ?? body?.limit;
  const graceParam = url.searchParams.get('grace_minutes') ?? url.searchParams.get('graceMinutes') ?? body?.graceMinutes ?? body?.grace_minutes;

  const dryRun = dryRunParam === 'true' || dryRunParam === true || dryRunParam === '1';
  
  let limit = 200;
  if (limitParam !== null && limitParam !== undefined) {
    const parsedLimit = parseInt(String(limitParam), 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 1000);
    }
  }

  let graceMinutes = 30;
  if (graceParam !== null && graceParam !== undefined) {
    const parsedGrace = parseInt(String(graceParam), 10);
    if (!isNaN(parsedGrace) && parsedGrace >= 0) {
      graceMinutes = Math.min(parsedGrace, 10080); // max 7 days
    }
  }

  return { dryRun, limit, graceMinutes };
}
