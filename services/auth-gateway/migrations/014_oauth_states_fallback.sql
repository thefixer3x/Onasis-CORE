-- Migration: 014_oauth_states_fallback.sql
-- Purpose: Create oauth_states table for database fallback when Redis is unavailable
-- This ensures OAuth and Magic Link flows work even during Redis outages

-- Create oauth_states table for state storage fallback
CREATE TABLE IF NOT EXISTS auth_gateway.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_key VARCHAR(512) NOT NULL UNIQUE,
    state_data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by state_key
CREATE INDEX IF NOT EXISTS idx_oauth_states_key ON auth_gateway.oauth_states(state_key);

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON auth_gateway.oauth_states(expires_at);

-- Add comment explaining the table's purpose
COMMENT ON TABLE auth_gateway.oauth_states IS 'Fallback storage for OAuth/Magic Link state when Redis is unavailable. States are short-lived and auto-expire.';

-- Function to clean up expired states (run periodically via cron or at startup)
CREATE OR REPLACE FUNCTION auth_gateway.cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_gateway.oauth_states WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql
SET search_path = auth_gateway;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_gateway.oauth_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_gateway.oauth_states TO service_role;

-- ============================================================================
-- PUBLIC SCHEMA FACADE (follows existing pattern for oauth_clients, oauth_tokens, etc.)
-- ============================================================================

-- Create public facade view (matches pattern of public.oauth_clients, public.oauth_tokens)
CREATE OR REPLACE VIEW public.oauth_states AS
SELECT
    id,
    state_key,
    state_data,
    expires_at,
    created_at,
    updated_at
FROM auth_gateway.oauth_states;

-- Comment on facade view
COMMENT ON VIEW public.oauth_states IS 'Public facade for auth_gateway.oauth_states - Redis fallback storage for OAuth/Magic Link state';

-- Public cleanup function (matches pattern of public.cleanup_expired_oauth_codes)
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
BEGIN
    RETURN auth_gateway.cleanup_expired_oauth_states();
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_gateway;

-- Comment on public function
COMMENT ON FUNCTION public.cleanup_expired_oauth_states() IS 'Cleanup expired OAuth states from fallback storage. Delegates to auth_gateway.cleanup_expired_oauth_states()';

-- Grant execute on public cleanup function
GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() TO service_role;
