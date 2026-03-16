-- =============================================================================
-- Failover Write Queue Table
-- Purpose: Store writes locally during fallback mode (when primary is down)
-- Created: 2026-03-11
-- =============================================================================

-- Create failover_write_queue table
CREATE TABLE IF NOT EXISTS public.failover_write_queue (
    id BIGSERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE')),
    table_name TEXT NOT NULL,
    schema_name TEXT NOT NULL DEFAULT 'public',
    sql_template TEXT NOT NULL,
    params_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_failover_queue_status 
    ON public.failover_write_queue(status, priority DESC, queued_at ASC);

CREATE INDEX IF NOT EXISTS idx_failover_queue_pending 
    ON public.failover_write_queue(queued_at ASC) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_failover_queue_retry 
    ON public.failover_write_queue(retry_count, status)
    WHERE status IN ('pending', 'failed');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_failover_queue_updated_at
    BEFORE UPDATE ON public.failover_write_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.failover_write_queue TO service_role;
GRANT USAGE ON SEQUENCE public.failover_write_queue_id_seq TO service_role;
GRANT ALL ON public.failover_write_queue TO authenticated;

-- Add comment
COMMENT ON TABLE public.failover_write_queue IS 
    'Stores write operations during database fallback mode for later replay to primary';

-- Create view for pending queue items
CREATE OR REPLACE VIEW public.pending_failover_writes AS
SELECT 
    id,
    operation_type,
    table_name,
    schema_name,
    priority,
    queued_at,
    retry_count,
    NOW() - queued_at AS queue_age
FROM public.failover_write_queue
WHERE status = 'pending'
ORDER BY priority DESC, queued_at ASC;

GRANT SELECT ON public.pending_failover_writes TO authenticated;
GRANT SELECT ON public.pending_failover_writes TO service_role;

-- Create function to enqueue a write operation
CREATE OR REPLACE FUNCTION public.enqueue_failover_write(
    p_operation_type TEXT,
    p_table_name TEXT,
    p_schema_name TEXT,
    p_sql_template TEXT,
    p_params_json JSONB,
    p_priority INTEGER DEFAULT 0
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO public.failover_write_queue (
        operation_type,
        table_name,
        schema_name,
        sql_template,
        params_json,
        priority
    ) VALUES (
        p_operation_type,
        p_table_name,
        p_schema_name,
        p_sql_template,
        p_params_json,
        p_priority
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.enqueue_failover_write TO service_role;
