import { describe, it, expect } from 'vitest';
import { validateActivityLogPayload, isAllowedActivityEventType } from '../validation';

describe('log-app-activity validation', () => {
  describe('isAllowedActivityEventType', () => {
    it('accepts allowed event types', () => {
      expect(isAllowedActivityEventType('user.login')).toBe(true);
      expect(isAllowedActivityEventType('order.deleted')).toBe(true);
      expect(isAllowedActivityEventType('order.pdf_generated')).toBe(true);
      expect(isAllowedActivityEventType('order.sent_to_production')).toBe(true);
    });

    it('rejects unknown event types', () => {
      expect(isAllowedActivityEventType('unknown.event')).toBe(false);
      expect(isAllowedActivityEventType('user.logout')).toBe(false);
      expect(isAllowedActivityEventType('')).toBe(false);
    });
  });

  describe('validateActivityLogPayload', () => {
    it('accepts valid payload with metadata object', () => {
      const payload = {
        event_type: 'user.login',
        metadata: { source: 'web' }
      };
      const result = validateActivityLogPayload(payload);
      expect(result.valid).toBe(true);
    });

    it('accepts valid payload with metadata undefined', () => {
      const payload = {
        event_type: 'order.deleted'
      };
      const result = validateActivityLogPayload(payload);
      expect(result.valid).toBe(true);
    });

    it('rejects payload if not an object', () => {
      expect(validateActivityLogPayload(null).valid).toBe(false);
      expect(validateActivityLogPayload('string').valid).toBe(false);
      expect(validateActivityLogPayload([]).valid).toBe(false);
    });

    it('rejects payload with missing or invalid event_type', () => {
      expect(validateActivityLogPayload({}).valid).toBe(false);
      expect(validateActivityLogPayload({ event_type: 123 }).valid).toBe(false);
    });

    it('rejects payload with unallowed event_type', () => {
      const result = validateActivityLogPayload({ event_type: 'hack.system' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no est\u00E1 permitido/);
    });

    it('rejects payload with invalid metadata', () => {
      expect(validateActivityLogPayload({ event_type: 'user.login', metadata: null }).valid).toBe(false);
      expect(validateActivityLogPayload({ event_type: 'user.login', metadata: 'string' }).valid).toBe(false);
      expect(validateActivityLogPayload({ event_type: 'user.login', metadata: [] }).valid).toBe(false);
    });
  });
});
