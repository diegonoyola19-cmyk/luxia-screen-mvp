import type { Page } from '@playwright/test';

export interface ConsoleErrorRecord {
  type: 'console.error' | 'pageerror';
  text: string;
  location?: string;
  timestamp: string;
}

export class ConsoleMonitor {
  errors: ConsoleErrorRecord[] = [];
  allowlist: RegExp[] = [
    /Download the React DevTools/i,
    /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/i,
    /cancel_order_inventory_tx/i,
    /status of 400/i,
  ];

  allowError(pattern: RegExp | string) {
    if (typeof pattern === 'string') {
      this.allowlist.push(new RegExp(pattern));
    } else {
      this.allowlist.push(pattern);
    }
  }

  setup(page: Page) {
    this.errors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        this.errors.push({
          type: 'console.error',
          text,
          location: msg.location()?.url,
          timestamp: new Date().toISOString(),
        });
      }
    });

    page.on('pageerror', (err) => {
      const text = err.message || String(err);
      this.errors.push({
        type: 'pageerror',
        text,
        location: err.stack,
        timestamp: new Date().toISOString(),
      });
    });
  }

  assertNoErrors() {
    const unallowedErrors = this.errors.filter((e) => !this.allowlist.some((r) => r.test(e.text)));
    if (unallowedErrors.length > 0) {
      const formatted = unallowedErrors
        .map((e) => `[${e.type}] ${e.text} (${e.location || 'unknown'})`)
        .join('\n');
      throw new Error(`[CONSOLE_ERROR] Unexpected JavaScript errors detected:\n${formatted}`);
    }
  }
}
