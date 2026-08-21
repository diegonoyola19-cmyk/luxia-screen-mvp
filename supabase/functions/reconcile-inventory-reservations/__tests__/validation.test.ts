import { describe, it, expect } from 'vitest';
import { parseReconcileOptions } from '../validation';

describe('reconcile-inventory-reservations validation', () => {
  it('parses default values when no params provided', () => {
    const url = new URL('https://example.com/functions/v1/reconcile-inventory-reservations');
    const options = parseReconcileOptions(url);
    expect(options.dryRun).toBe(false);
    expect(options.limit).toBe(200);
    expect(options.graceMinutes).toBe(30);
  });

  it('parses dry_run=true from query string', () => {
    const url = new URL('https://example.com/functions/v1/reconcile-inventory-reservations?dry_run=true&limit=50&grace_minutes=15');
    const options = parseReconcileOptions(url);
    expect(options.dryRun).toBe(true);
    expect(options.limit).toBe(50);
    expect(options.graceMinutes).toBe(15);
  });

  it('parses values from body payload in POST requests', () => {
    const url = new URL('https://example.com/functions/v1/reconcile-inventory-reservations');
    const body = { dryRun: true, limit: 100, graceMinutes: 45 };
    const options = parseReconcileOptions(url, body);
    expect(options.dryRun).toBe(true);
    expect(options.limit).toBe(100);
    expect(options.graceMinutes).toBe(45);
  });

  it('clamps excessive limits and handles invalid inputs gracefully', () => {
    const url = new URL('https://example.com/functions/v1/reconcile-inventory-reservations?limit=9999&grace_minutes=abc');
    const options = parseReconcileOptions(url);
    expect(options.limit).toBe(1000); // clamped to 1000 max
    expect(options.graceMinutes).toBe(30); // fallback default
  });
});
