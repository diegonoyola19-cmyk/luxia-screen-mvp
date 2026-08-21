-- 20260706170000_schedule_reconcile_inventory_reservations.sql

-- ========================================================================================
-- Configuración de Programación Automática (pg_cron / Scheduler) para Reconciliación
-- ========================================================================================

-- Enable pg_cron schema if available in Supabase environment
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function to safely schedule or update the cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if present
    PERFORM cron.unschedule('reconcile-inventory-reservations-job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-inventory-reservations-job');

    -- Schedule to run every 20 minutes
    PERFORM cron.schedule(
      'reconcile-inventory-reservations-job',
      '*/20 * * * *',
      $$SELECT public.reconcile_inventory_reservations(false, 200, 30);$$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not active or insufficient privileges; fallback to Edge Function trigger.';
END $$;
