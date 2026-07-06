import { describe, it, expect } from 'vitest';
import { normalizeOrderStatus, getNextStatusAfterPdfGeneration } from '../orderStatus';

// ─── normalizeOrderStatus ──────────────────────────────────────────────────

describe('normalizeOrderStatus', () => {
  describe('Estados legacy', () => {
    it('"pending" (legacy BD) -> "ready_for_production"', () => {
      expect(normalizeOrderStatus('pending')).toBe('ready_for_production');
    });
  });

  describe('Estados válidos se conservan', () => {
    it('preserva "draft"', () => {
      expect(normalizeOrderStatus('draft')).toBe('draft');
    });

    it('preserva "ready_for_production"', () => {
      expect(normalizeOrderStatus('ready_for_production')).toBe('ready_for_production');
    });

    it('preserva "in_production"', () => {
      expect(normalizeOrderStatus('in_production')).toBe('in_production');
    });

    it('preserva "materials_checked"', () => {
      expect(normalizeOrderStatus('materials_checked')).toBe('materials_checked');
    });

    it('preserva "sent_to_sage"', () => {
      expect(normalizeOrderStatus('sent_to_sage')).toBe('sent_to_sage');
    });

    it('preserva "completed"', () => {
      expect(normalizeOrderStatus('completed')).toBe('completed');
    });

    it('preserva "cancelled"', () => {
      expect(normalizeOrderStatus('cancelled')).toBe('cancelled');
    });
  });

  describe('Fallback seguro a "draft" (NO a ready_for_production)', () => {
    it('null -> "draft"', () => {
      expect(normalizeOrderStatus(null)).toBe('draft');
    });

    it('undefined -> "draft"', () => {
      expect(normalizeOrderStatus(undefined)).toBe('draft');
    });

    it('cadena vacía -> "draft"', () => {
      expect(normalizeOrderStatus('')).toBe('draft');
    });

    it('estado desconocido -> "draft"', () => {
      expect(normalizeOrderStatus('unknown_status')).toBe('draft');
    });

    it('número -> "draft"', () => {
      expect(normalizeOrderStatus(42)).toBe('draft');
    });

    it('objeto -> "draft"', () => {
      expect(normalizeOrderStatus({})).toBe('draft');
    });
  });
});

// ─── getNextStatusAfterPdfGeneration ──────────────────────────────────────

describe('getNextStatusAfterPdfGeneration', () => {
  it('ready_for_production con líneas válidas -> in_production', () => {
    expect(getNextStatusAfterPdfGeneration('ready_for_production', true)).toBe('in_production');
  });

  it('ready_for_production sin líneas válidas -> null (PDF no procede)', () => {
    expect(getNextStatusAfterPdfGeneration('ready_for_production', false)).toBeNull();
  });

  it('draft con líneas válidas -> null (no puede saltar directo a in_production)', () => {
    // draft ya NO puede saltar a in_production directamente
    expect(getNextStatusAfterPdfGeneration('draft', true)).toBeNull();
  });

  it('draft sin líneas válidas -> null', () => {
    expect(getNextStatusAfterPdfGeneration('draft', false)).toBeNull();
  });

  it('in_production -> null', () => {
    expect(getNextStatusAfterPdfGeneration('in_production', true)).toBeNull();
  });

  it('materials_checked -> null', () => {
    expect(getNextStatusAfterPdfGeneration('materials_checked', true)).toBeNull();
  });

  it('sent_to_sage -> null', () => {
    expect(getNextStatusAfterPdfGeneration('sent_to_sage', true)).toBeNull();
  });

  it('completed -> null', () => {
    expect(getNextStatusAfterPdfGeneration('completed', true)).toBeNull();
  });

  it('cancelled -> null', () => {
    expect(getNextStatusAfterPdfGeneration('cancelled', true)).toBeNull();
  });

  it('null status -> null (sin líneas válidas de fallback draft)', () => {
    expect(getNextStatusAfterPdfGeneration(null, true)).toBeNull();
  });
});
