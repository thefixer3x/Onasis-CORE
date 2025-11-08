-- Migration: API Key Management Service
-- Comprehensive API key management with MCP integration
-- Schema: security_service (to be created in Neon if it doesn't exist)

-- Note: This assumes we're working in the default public schema
-- If using a separate security_service schema in Neon, wrap this in:
-- CREATE SCHEMA IF NOT EXISTS security_service;
-- SET search_path TO security_service;

-- =============================================================================
-- PROJECTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_key_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    team_members UUID[] DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_key_projects_org ON api_key_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_key_projects_owner ON api_key_projects(owner_id);

-- =============================================================================
-- STORED API KEYS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS stored_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,
    key_type VARCHAR(50) NOT NULL DEFAULT 'api_key',
    environment VARCHAR(50) NOT NULL DEFAULT 'development',
    project_id UUID NOT NULL REFERENCES api_key_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    access_level VARCHAR(50) NOT NULL DEFAULT 'team',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    tags TEXT[] DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    last_rotated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rotation_frequency INTEGER DEFAULT 90,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_stored_api_keys_project ON stored_api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_stored_api_keys_org ON stored_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_stored_api_keys_status ON stored_api_keys(status);
CREATE INDEX IF NOT EXISTS idx_stored_api_keys_expires ON stored_api_keys(expires_at);

-- =============================================================================
-- KEY ROTATION POLICIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS key_rotation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES stored_api_keys(id) ON DELETE CASCADE,
    frequency_days INTEGER NOT NULL DEFAULT 90,
    auto_rotate BOOLEAN DEFAULT true,
    last_rotation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_rotation TIMESTAMP WITH TIME ZONE,
    rotation_history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(key_id)
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_next ON key_rotation_policies(next_rotation);

-- =============================================================================
-- KEY USAGE ANALYTICS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS key_usage_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES stored_api_keys(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    user_id UUID,
    operation VARCHAR(100) NOT NULL,
    success BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_usage_key ON key_usage_analytics(key_id);
CREATE INDEX IF NOT EXISTS idx_key_usage_org ON key_usage_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_key_usage_timestamp ON key_usage_analytics(timestamp);

-- =============================================================================
-- KEY SECURITY EVENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS key_security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID REFERENCES stored_api_keys(id) ON DELETE SET NULL,
    organization_id UUID,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_security_events_key ON key_security_events(key_id);
CREATE INDEX IF NOT EXISTS idx_key_security_events_org ON key_security_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_key_security_events_severity ON key_security_events(severity);
CREATE INDEX IF NOT EXISTS idx_key_security_events_timestamp ON key_security_events(timestamp);

-- =============================================================================
-- MCP KEY TOOLS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mcp_key_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id VARCHAR(255) NOT NULL,
    tool_name VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}',
    webhook_url TEXT,
    auto_approve BOOLEAN DEFAULT false,
    risk_level VARCHAR(50) NOT NULL DEFAULT 'medium',
    created_by UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(organization_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_key_tools_org ON mcp_key_tools(organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_key_tools_tool_id ON mcp_key_tools(tool_id);

-- =============================================================================
-- MCP KEY ACCESS REQUESTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mcp_key_access_requests (
    id VARCHAR(255) PRIMARY KEY,
    tool_id VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL,
    key_names TEXT[] NOT NULL,
    environment VARCHAR(50) NOT NULL,
    justification TEXT NOT NULL,
    estimated_duration INTEGER NOT NULL,
    requires_approval BOOLEAN DEFAULT true,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_access_requests_tool ON mcp_key_access_requests(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_requests_org ON mcp_key_access_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_requests_status ON mcp_key_access_requests(status);

-- =============================================================================
-- MCP KEY SESSIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mcp_key_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    request_id VARCHAR(255) NOT NULL REFERENCES mcp_key_access_requests(id),
    tool_id VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL,
    key_names TEXT[] NOT NULL,
    environment VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_session_id ON mcp_key_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_request ON mcp_key_sessions(request_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires ON mcp_key_sessions(expires_at);

-- =============================================================================
-- MCP PROXY TOKENS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mcp_proxy_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proxy_value TEXT NOT NULL UNIQUE,
    encrypted_mapping TEXT NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tokens_proxy ON mcp_proxy_tokens(proxy_value);
CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tokens_session ON mcp_proxy_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tokens_expires ON mcp_proxy_tokens(expires_at);

-- =============================================================================
-- MCP KEY AUDIT LOG TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mcp_key_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    tool_id VARCHAR(255),
    organization_id UUID NOT NULL,
    user_id UUID,
    session_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_org ON mcp_key_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_tool ON mcp_key_audit_log(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_timestamp ON mcp_key_audit_log(timestamp);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_key_projects_updated_at
    BEFORE UPDATE ON api_key_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stored_api_keys_updated_at
    BEFORE UPDATE ON stored_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_key_rotation_policies_updated_at
    BEFORE UPDATE ON key_rotation_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mcp_key_tools_updated_at
    BEFORE UPDATE ON mcp_key_tools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE api_key_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_rotation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_usage_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_key_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_key_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_key_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_proxy_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_key_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for backend services)
CREATE POLICY "Service role full access projects" ON api_key_projects
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access keys" ON stored_api_keys
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access rotation" ON key_rotation_policies
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access analytics" ON key_usage_analytics
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access security" ON key_security_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access mcp_tools" ON mcp_key_tools
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access mcp_requests" ON mcp_key_access_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access mcp_sessions" ON mcp_key_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access proxy" ON mcp_proxy_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access audit" ON mcp_key_audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated user policies (organization-based isolation)
CREATE POLICY "Users can view their org projects" ON api_key_projects
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

CREATE POLICY "Users can create projects in their org" ON api_key_projects
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        AND owner_id = auth.uid()
    );

CREATE POLICY "Project owners can update" ON api_key_projects
    FOR UPDATE TO authenticated
    USING (
        owner_id = auth.uid()
        OR auth.uid() = ANY(team_members)
    );

CREATE POLICY "Users can view their org keys" ON stored_api_keys
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

CREATE POLICY "Users can create keys in their projects" ON stored_api_keys
    FOR INSERT TO authenticated
    WITH CHECK (
        project_id IN (
            SELECT id FROM api_key_projects 
            WHERE organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Key creators can update" ON stored_api_keys
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Key creators can delete" ON stored_api_keys
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- Analytics read-only for org members
CREATE POLICY "Users can view org analytics" ON key_usage_analytics
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

-- Security events read-only for org members  
CREATE POLICY "Users can view org security events" ON key_security_events
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

-- MCP policies
CREATE POLICY "Users can view org MCP tools" ON mcp_key_tools
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

CREATE POLICY "Users can register MCP tools" ON mcp_key_tools
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can view org audit logs" ON mcp_key_audit_log
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
        )
    );

-- =============================================================================
-- STORED PROCEDURES & FUNCTIONS
-- =============================================================================

-- Function to get decrypted key for MCP session with proxy token generation
CREATE OR REPLACE FUNCTION get_key_for_mcp_session(
    session_id_param VARCHAR,
    key_name_param VARCHAR
)
RETURNS TABLE (
    proxy_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    session_record RECORD;
    key_record RECORD;
    proxy_val TEXT;
    proxy_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get session details
    SELECT * INTO session_record
    FROM mcp_key_sessions
    WHERE session_id = session_id_param
      AND ended_at IS NULL
      AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired session';
    END IF;
    
    -- Check if key is in allowed list for this session
    IF NOT (key_name_param = ANY(session_record.key_names)) THEN
        RAISE EXCEPTION 'Key not authorized for this session';
    END IF;
    
    -- Get the key
    SELECT * INTO key_record
    FROM stored_api_keys
    WHERE name = key_name_param
      AND organization_id = session_record.organization_id
      AND environment = session_record.environment
      AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Key not found or inactive';
    END IF;
    
    -- Generate proxy token
    proxy_val := 'proxy_' || encode(gen_random_bytes(32), 'hex');
    proxy_expires := LEAST(session_record.expires_at, NOW() + interval '1 hour');
    
    -- Store proxy token
    INSERT INTO mcp_proxy_tokens (
        proxy_value,
        encrypted_mapping,
        session_id,
        key_name,
        expires_at
    ) VALUES (
        proxy_val,
        key_record.encrypted_value,
        session_id_param,
        key_name_param,
        proxy_expires
    );
    
    -- Return proxy token
    RETURN QUERY SELECT proxy_val, proxy_expires;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired sessions and tokens
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_resources()
RETURNS void AS $$
BEGIN
    -- End expired sessions
    UPDATE mcp_key_sessions
    SET ended_at = NOW()
    WHERE expires_at < NOW()
      AND ended_at IS NULL;
    
    -- Revoke expired tokens
    UPDATE mcp_proxy_tokens
    SET revoked_at = NOW()
    WHERE expires_at < NOW()
      AND revoked_at IS NULL;
    
    -- Delete old audit logs (older than 90 days)
    DELETE FROM mcp_key_audit_log
    WHERE timestamp < NOW() - interval '90 days';
    
    -- Delete old analytics (older than 180 days)
    DELETE FROM key_usage_analytics
    WHERE timestamp < NOW() - interval '180 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION get_key_for_mcp_session TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_mcp_resources TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE api_key_projects IS 'Projects for organizing API keys';
COMMENT ON TABLE stored_api_keys IS 'Encrypted storage for third-party API keys';
COMMENT ON TABLE key_rotation_policies IS 'Automated key rotation policies';
COMMENT ON TABLE key_usage_analytics IS 'API key usage tracking and analytics';
COMMENT ON TABLE key_security_events IS 'Security events and audit trail';
COMMENT ON TABLE mcp_key_tools IS 'MCP tool registrations with permissions';
COMMENT ON TABLE mcp_key_access_requests IS 'MCP tool access request workflow';
COMMENT ON TABLE mcp_key_sessions IS 'Active MCP tool sessions with key access';
COMMENT ON TABLE mcp_proxy_tokens IS 'Temporary proxy tokens for secure key access';
COMMENT ON TABLE mcp_key_audit_log IS 'Complete audit log for MCP operations';
