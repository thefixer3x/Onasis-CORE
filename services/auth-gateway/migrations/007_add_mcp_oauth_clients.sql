--
-- Add OAuth2 Clients for MCP (Claude Desktop & Claude Web)
-- Migration: 007_add_mcp_oauth_clients
-- Created: 2025-11-10
-- Purpose: Enable OAuth2 authentication for Claude Desktop and Claude Web MCP connections
--

-- =====================================================
-- MCP OAuth Clients for Claude Desktop & Web
-- =====================================================

-- Claude Desktop MCP Client
INSERT INTO auth_gateway.oauth_clients (
    client_id,
    client_name,
    client_type,
    require_pkce,
    allowed_code_challenge_methods,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes,
    status,
    description
) VALUES (
    'claude-desktop',
    'Claude Desktop MCP Client',
    'public',
    TRUE,
    ARRAY['S256']::VARCHAR[],
    '[
        "http://localhost:3000/mcp/callback",
        "http://127.0.0.1:3000/mcp/callback",
        "http://localhost:52813/oauth/callback",
        "http://127.0.0.1:52813/oauth/callback",
        "claude-desktop://oauth/callback"
    ]'::jsonb,
    ARRAY[
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
    ARRAY['mcp:full', 'mcp:connect', 'memories:read', 'memories:write']::TEXT[],
    'active',
    'Official Claude Desktop MCP client with OAuth2 authentication'
) ON CONFLICT (client_id) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes = EXCLUDED.allowed_scopes,
    default_scopes = EXCLUDED.default_scopes,
    updated_at = NOW();

-- Claude Web MCP Client
INSERT INTO auth_gateway.oauth_clients (
    client_id,
    client_name,
    client_type,
    require_pkce,
    allowed_code_challenge_methods,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes,
    status,
    description
) VALUES (
    'claude-web',
    'Claude Web MCP Client',
    'public',
    TRUE,
    ARRAY['S256']::VARCHAR[],
    '[
        "https://claude.ai/mcp/callback",
        "https://app.claude.ai/mcp/callback",
        "https://claude.anthropic.com/mcp/callback"
    ]'::jsonb,
    ARRAY[
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
    ARRAY['mcp:full', 'mcp:connect', 'memories:read']::TEXT[],
    'active',
    'Official Claude Web MCP client with OAuth2 authentication'
) ON CONFLICT (client_id) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes = EXCLUDED.allowed_scopes,
    default_scopes = EXCLUDED.default_scopes,
    updated_at = NOW();

-- Generic MCP Client (for other MCP implementations)
INSERT INTO auth_gateway.oauth_clients (
    client_id,
    client_name,
    client_type,
    require_pkce,
    allowed_code_challenge_methods,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes,
    status,
    description
) VALUES (
    'mcp-client',
    'Generic MCP Client',
    'public',
    TRUE,
    ARRAY['S256']::VARCHAR[],
    '[
        "http://localhost:3000/callback",
        "http://127.0.0.1:3000/callback",
        "http://localhost:8080/callback",
        "http://127.0.0.1:8080/callback"
    ]'::jsonb,
    ARRAY[
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
    ARRAY['mcp:full', 'mcp:connect', 'memories:read']::TEXT[],
    'active',
    'Generic MCP client for third-party implementations'
) ON CONFLICT (client_id) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes = EXCLUDED.allowed_scopes,
    default_scopes = EXCLUDED.default_scopes,
    updated_at = NOW();

-- =====================================================
-- Comments & Documentation
-- =====================================================

COMMENT ON TABLE auth_gateway.oauth_clients IS 'OAuth2 client registrations for VSCode extensions, CLI tools, and MCP clients';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 007: Added OAuth2 clients for Claude Desktop, Claude Web, and generic MCP clients';
    RAISE NOTICE 'OAuth clients now support MCP protocol with scopes: mcp:full, mcp:tools, mcp:resources, mcp:prompts';
    RAISE NOTICE 'Total OAuth clients: 3 MCP clients + existing IDE/CLI clients';
END $$;
