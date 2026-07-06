export const ALLOWED_EVENT_TYPES = [
  'user.login',
  'order.deleted',
  'order.pdf_generated',
  'order.sent_to_production'
] as const;

export type AllowedEventType = typeof ALLOWED_EVENT_TYPES[number];

export function isAllowedActivityEventType(eventType: string): eventType is AllowedEventType {
  return ALLOWED_EVENT_TYPES.includes(eventType as AllowedEventType);
}

export function validateActivityLogPayload(payload: any): { valid: boolean, error?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Payload debe ser un objeto.' };
  }

  const { event_type, metadata } = payload;

  if (!event_type || typeof event_type !== 'string') {
    return { valid: false, error: 'event_type es obligatorio y debe ser texto.' };
  }

  if (!isAllowedActivityEventType(event_type)) {
    return { valid: false, error: `event_type '${event_type}' no está permitido.` };
  }

  if (metadata !== undefined) {
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { valid: false, error: 'metadata debe ser un objeto plano o estar indefinido.' };
    }
  }

  return { valid: true };
}
