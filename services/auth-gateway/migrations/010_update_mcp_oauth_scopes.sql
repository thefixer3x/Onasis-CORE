--
-- Update MCP OAuth Clients with additional scopes (api:access, mcp:connect)
-- Migration: 010_update_mcp_oauth_scopes
-- Created: 2025-01-02
-- Purpose: Add mcp:connect and api:access scopes to all MCP OAuth clients for plug-and-play experience
--

-- =====================================================
-- Update existing MCP OAuth Clients with new scopes
-- =====================================================

-- Update Claude Desktop client
UPDATE auth_gateway.oauth_clients
SET
    allowed_scopes = ARRAY[
        'mcp:full',
        'mcp:tools',
        'mcp:resources',
        'mcp:prompts',
        'mcp:connect',
        'api:access',
        'memories:read',
        'memories:write',
        'memories:delete',
        'api-keys:read',
        'api-keys:write',
        'profile'
    ]::TEXT[],
    default_scopes = ARRAY['mcp:full', 'mcp:connect', 'memories:read', 'memories:write']::TEXT[],
    updated_at = NOW()
WHERE client_id = 'claude-desktop';

-- Update Claude Web client
UPDATE auth_gateway.oauth_clients
SET
    allowed_scopes = ARRAY[
        'mcp:full',
        'mcp:tools',
        'mcp:resources',
        'mcp:prompts',
        'mcp:connect',
        'api:access',
        'memories:read',
        'memories:write',
        'memories:delete',
        'api-keys:read',
        'profile'
    ]::TEXT[],
    default_scopes = ARRAY['mcp:full', 'mcp:connect', 'memories:read']::TEXT[],
    updated_at = NOW()
WHERE client_id = 'claude-web';

-- Update generic MCP client
UPDATE auth_gateway.oauth_clients
SET
    allowed_scopes = ARRAY[
        'mcp:full',
        'mcp:tools',
        'mcp:resources',
        'mcp:prompts',
        'mcp:connect',
        'api:access',
        'memories:read',
        'memories:write',
        'profile'
    ]::TEXT[],
    default_scopes = ARRAY['mcp:full', 'mcp:connect', 'memories:read']::TEXT[],
    updated_at = NOW()
WHERE client_id = 'mcp-client';

-- Update any dynamically registered MCP clients (those with localhost redirect URIs)
-- This ensures plug-and-play experience for all MCP clients
UPDATE auth_gateway.oauth_clients
SET
    allowed_scopes = ARRAY(
        SELECT DISTINCT unnest(allowed_scopes || ARRAY['mcp:connect', 'api:access']::TEXT[])
    ),
    updated_at = NOW()
WHERE
    client_type = 'public'
    AND status = 'active'
    AND (
        allowed_redirect_uris::text LIKE '%localhost%'
        OR allowed_redirect_uris::text LIKE '%127.0.0.1%'
        OR description LIKE '%MCP%'
    )
    AND NOT ('api:access' = ANY(allowed_scopes));

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 010: Updated MCP OAuth clients with mcp:connect and api:access scopes';
    RAISE NOTICE 'All MCP clients now support full scope range for plug-and-play experience';
END $$;
