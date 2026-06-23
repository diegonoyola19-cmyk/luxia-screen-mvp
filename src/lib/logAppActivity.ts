import { supabase } from './supabase';

interface LogAppActivityPayload {
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Registra un evento operativo en la base de datos de auditoría usando Edge Functions.
 * Esta función es "fire and forget": si falla, no rompe el flujo del usuario.
 */
export async function logAppActivity(payload: LogAppActivityPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('log-app-activity', {
      body: payload
    });

    if (error) {
      console.warn('Failed to log app activity:', error.message || error);
      if ((error as any).context && typeof (error as any).context.json === 'function') {
        const errBody = await (error as any).context.json();
        console.error('Edge Function detailed error:', errBody);
      }
    }
  } catch (err) {
    console.warn('Exception logging app activity:', err);
  }
}
