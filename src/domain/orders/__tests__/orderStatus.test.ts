import { describe, it, expect } from 'vitest';
import { normalizeOrderStatus, getNextStatusAfterPdfGeneration } from '../orderStatus';

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

describe('getNextStatusAfterPdfGeneration', () => {
  it('returns in_production for ready_for_production', () => {
    expect(getNextStatusAfterPdfGeneration('ready_for_production', false)).toBe('in_production');
    expect(getNextStatusAfterPdfGeneration('ready_for_production', true)).toBe('in_production');
  });

  it('returns in_production for draft if hasValidMaterialLines is true', () => {
    expect(getNextStatusAfterPdfGeneration('draft', true)).toBe('in_production');
  });

  it('returns null for draft if hasValidMaterialLines is false', () => {
    expect(getNextStatusAfterPdfGeneration('draft', false)).toBeNull();
  });

  it('returns null for in_production', () => {
    expect(getNextStatusAfterPdfGeneration('in_production', true)).toBeNull();
  });

  it('returns null for materials_checked', () => {
    expect(getNextStatusAfterPdfGeneration('materials_checked', true)).toBeNull();
  });

  it('returns null for sent_to_sage', () => {
    expect(getNextStatusAfterPdfGeneration('sent_to_sage', true)).toBeNull();
  });

  it('returns null for completed', () => {
    expect(getNextStatusAfterPdfGeneration('completed', true)).toBeNull();
  });

  it('returns null for cancelled', () => {
    expect(getNextStatusAfterPdfGeneration('cancelled', true)).toBeNull();
  });
});
