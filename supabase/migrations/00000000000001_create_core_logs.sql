-- Create core.logs table for centralized audit logging
-- This table aggregates security-critical events across all projects

-- Create core schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS core;

-- Core audit logs table
CREATE TABLE IF NOT EXISTS core.logs (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    project TEXT NOT NULL, -- project identifier (e.g., 'vortexcore', 'maple-site', 'lanonasis-maas')
    user_id UUID, -- authenticated user (null for anonymous requests)
    action TEXT NOT NULL, -- action performed (e.g., 'function_call', 'db_access', 'auth_attempt')
    target TEXT, -- target resource (e.g., function name, table name, endpoint)
    status TEXT NOT NULL CHECK (status IN ('allowed', 'denied', 'error')),
    meta JSONB, -- additional context (request details, error info, etc.)
    ip_address INET, -- client IP address
    user_agent TEXT, -- client user agent
    project_scope TEXT, -- JWT project_scope claim
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_core_logs_ts ON core.logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_core_logs_project ON core.logs (project);
CREATE INDEX IF NOT EXISTS idx_core_logs_user_id ON core.logs (user_id);
CREATE INDEX IF NOT EXISTS idx_core_logs_action ON core.logs (action);
CREATE INDEX IF NOT EXISTS idx_core_logs_status ON core.logs (status);
CREATE INDEX IF NOT EXISTS idx_core_logs_project_ts ON core.logs (project, ts DESC);

-- Composite index for security monitoring
CREATE INDEX IF NOT EXISTS idx_core_logs_security ON core.logs (status, action, ts DESC) 
WHERE status IN ('denied', 'error');

-- Enable RLS on core.logs
ALTER TABLE core.logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can insert logs
CREATE POLICY "service_role_insert_logs" ON core.logs
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Policy: Authenticated users can read their own logs
CREATE POLICY "users_read_own_logs" ON core.logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Admin users can read all logs (requires admin role in auth.users metadata)
CREATE POLICY "admin_read_all_logs" ON core.logs
    FOR SELECT
    USING (
        auth.role() = 'authenticated' 
        AND (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Function to log events (called by Edge Functions and services)
CREATE OR REPLACE FUNCTION core.log_event(
    p_project TEXT,
    p_user_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_target TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'allowed',
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_project_scope TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id BIGINT;
BEGIN
    INSERT INTO core.logs (
        project, user_id, action, target, status, meta, 
        ip_address, user_agent, project_scope
    )
    VALUES (
        p_project, p_user_id, p_action, p_target, p_status, p_meta,
        p_ip_address, p_user_agent, p_project_scope
    )
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION core.log_event TO service_role;

-- Comments for documentation
COMMENT ON TABLE core.logs IS 'Centralized audit log for all projects in the monorepo';
COMMENT ON FUNCTION core.log_event IS 'Function to insert audit log entries from Edge Functions and services';