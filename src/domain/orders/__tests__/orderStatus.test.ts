import { describe, it, expect } from 'vitest';
import { normalizeOrderStatus } from '../orderStatus';

describe('orderStatus normalization', () => {
  it('normalizes "pending" to "ready_for_production"', () => {
    expect(normalizeOrderStatus('pending')).toBe('ready_for_production');
  });

  it('preserves valid states like "sent_to_sage"', () => {
    expect(normalizeOrderStatus('sent_to_sage')).toBe('sent_to_sage');
  });

  it('normalizes invalid or unknown states to "ready_for_production"', () => {
    expect(normalizeOrderStatus('unknown_status')).toBe('ready_for_production');
    expect(normalizeOrderStatus(null)).toBe('ready_for_production');
    expect(normalizeOrderStatus(undefined)).toBe('ready_for_production');
    expect(normalizeOrderStatus('')).toBe('ready_for_production');
  });

  it('preserves newly added valid states', () => {
    expect(normalizeOrderStatus('materials_checked')).toBe('materials_checked');
    expect(normalizeOrderStatus('in_production')).toBe('in_production');
    expect(normalizeOrderStatus('draft')).toBe('draft');
    expect(normalizeOrderStatus('completed')).toBe('completed');
    expect(normalizeOrderStatus('cancelled')).toBe('cancelled');
  });
});
