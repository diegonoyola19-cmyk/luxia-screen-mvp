-- =============================================================================
-- Migration: 20260823000001_create_api_sync_logs.sql
-- FASE: Auditoría y Monitoreo de Sincronización Automática de API Externa
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_sync_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL DEFAULT 'vertilux_api',
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    records_received integer DEFAULT 0,
    records_created integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    records_skipped integer DEFAULT 0,
    error_message text,
    trigger text NOT NULL DEFAULT 'scheduled' CHECK (trigger IN ('scheduled', 'manual')),
    triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index on finished_at and status for fast health-check and last sync query
CREATE INDEX IF NOT EXISTS idx_api_sync_logs_status_finished ON public.api_sync_logs (status, finished_at DESC);

-- Enable RLS
ALTER TABLE public.api_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read api_sync_logs
CREATE POLICY "Authenticated users can read api_sync_logs"
    ON public.api_sync_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: service role or admin can insert/update api_sync_logs
CREATE POLICY "Service role can manage api_sync_logs"
    ON public.api_sync_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
