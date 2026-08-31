import type { Page, Request, Response } from '@playwright/test';

export interface NetworkCallRecord {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  isError: boolean;
}

export class NetworkMonitor {
  calls: NetworkCallRecord[] = [];
  pendingRequests = new Map<Request, number>();
  slowThresholdMs = 5000;
  ignoredUrlPatterns: RegExp[] = [/\/auth\/v1\/token/];

  ignoreUrl(pattern: RegExp | string) {
    if (typeof pattern === 'string') {
      this.ignoredUrlPatterns.push(new RegExp(pattern));
    } else {
      this.ignoredUrlPatterns.push(pattern);
    }
  }

  setup(page: Page) {
    this.calls = [];
    this.pendingRequests.clear();

    page.on('request', (req) => {
      this.pendingRequests.set(req, Date.now());
    });

    page.on('response', (res) => {
      const req = res.request();
      const startTime = this.pendingRequests.get(req) || Date.now();
      const durationMs = Date.now() - startTime;
      const status = res.status();
      const isError = status >= 400 && status !== 401;

      this.calls.push({
        url: req.url(),
        method: req.method(),
        status,
        durationMs,
        isError,
      });
      this.pendingRequests.delete(req);
    });

    page.on('requestfailed', (req) => {
      const startTime = this.pendingRequests.get(req) || Date.now();
      const durationMs = Date.now() - startTime;

      // Ignore failed requests intentionally aborted by Network Guard
      if (req.failure()?.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
        this.pendingRequests.delete(req);
        return;
      }

      this.calls.push({
        url: req.url(),
        method: req.method(),
        durationMs,
        isError: true,
      });
      this.pendingRequests.delete(req);
    });
  }

  assertHealthy() {
    const errorCalls = this.calls.filter(
      (c) => c.isError && !this.ignoredUrlPatterns.some((pattern) => pattern.test(c.url))
    );
    if (errorCalls.length > 0) {
      const detail = errorCalls
        .map((c) => `${c.method} ${c.url} -> Status ${c.status ?? 'FAILED'} (${c.durationMs}ms)`)
        .join('\n');
      throw new Error(`[NETWORK_ERROR] HTTP 4xx/5xx or network failures detected:\n${detail}`);
    }

    const slowCalls = this.calls.filter((c) => c.durationMs > this.slowThresholdMs);
    if (slowCalls.length > 0) {
      const detail = slowCalls
        .map((c) => `${c.method} ${c.url} -> ${c.durationMs}ms (Threshold: ${this.slowThresholdMs}ms)`)
        .join('\n');
      console.warn(`\x1b[33m[NETWORK_PERFORMANCE_WARNING]\x1b[0m Slow requests detected:\n${detail}`);
    }
  }
}
