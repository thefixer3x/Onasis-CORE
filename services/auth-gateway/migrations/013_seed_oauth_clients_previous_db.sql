--
-- Seed OAuth2 clients from previous database snapshot
-- Migration: 013_seed_oauth_clients_previous_db
-- Purpose: Ensure known OAuth clients exist to avoid invalid_scope/redirect issues
--

INSERT INTO auth_gateway.oauth_clients (
    client_id,
    client_name,
    client_type,
    application_type,
    require_pkce,
    allowed_code_challenge_methods,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes,
    status,
    description
) VALUES
    (
        'partner-sandbox',
        'Partner Sandbox Client',
        'public',
        'web',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:3000/callback",
            "http://127.0.0.1:3000/callback"
        ]'::jsonb,
        ARRAY['memories:read']::TEXT[],
        ARRAY['memories:read']::TEXT[],
        'active',
        'Partner sandbox OAuth client'
    ),
    (
        'onasis-cli',
        'Onasis CLI Tool',
        'public',
        'cli',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:3000/callback",
            "http://127.0.0.1:3000/callback",
            "http://localhost:8888/callback",
            "http://127.0.0.1:8888/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'memories:write', 'memories:delete', 'profile', 'read', 'write', 'offline_access']::TEXT[],
        ARRAY['read', 'write', 'offline_access']::TEXT[],
        'active',
        'Onasis CLI tool OAuth client'
    ),
    (
        'lanonasis-cli',
        'LanOnasis CLI Tool',
        'public',
        'cli',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:8888/callback",
            "http://127.0.0.1:8888/callback",
            "http://localhost:3000/callback",
            "http://127.0.0.1:3000/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'memories:write', 'memories:delete', 'profile', 'read', 'write', 'offline_access']::TEXT[],
        ARRAY['read', 'write', 'offline_access']::TEXT[],
        'active',
        'LanOnasis CLI tool OAuth client'
    ),
    (
        'dashboard-web',
        'LanOnasis Dashboard',
        'confidential',
        'web',
        FALSE,
        ARRAY['S256']::VARCHAR[],
        '[
            "https://dashboard.lanonasis.com/auth/callback",
            "https://dashboard.lanonasis.com/oauth/callback",
            "http://localhost:5000/auth/callback",
            "http://127.0.0.1:5000/auth/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'profile']::TEXT[],
        ARRAY['memories:read', 'profile']::TEXT[],
        'active',
        'Dashboard web OAuth client'
    ),
    (
        'mcp-client',
        'Generic MCP Client',
        'public',
        'mcp',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:3000/callback",
            "http://127.0.0.1:3000/callback",
            "http://localhost:8080/callback",
            "http://127.0.0.1:8080/callback"
        ]'::jsonb,
        ARRAY['mcp:full', 'mcp:tools', 'mcp:resources', 'mcp:prompts', 'memories:read', 'memories:write', 'profile']::TEXT[],
        ARRAY['mcp:full', 'memories:read']::TEXT[],
        'active',
        'Generic MCP client for third-party implementations'
    ),
    (
        'windsurf-extension',
        'Windsurf IDE Extension',
        'public',
        'native',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:8080/callback",
            "http://127.0.0.1:8080/callback",
            "vscode://lanonasis.mcp-client/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'memories:write', 'memories:delete', 'profile']::TEXT[],
        ARRAY['memories:read']::TEXT[],
        'active',
        'Windsurf IDE OAuth client'
    ),
    (
        'cursor-extension',
        'Cursor VSCode Extension',
        'public',
        'native',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:8080/callback",
            "http://127.0.0.1:8080/callback",
            "vscode://lanonasis.mcp-client/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'memories:write', 'memories:delete', 'profile']::TEXT[],
        ARRAY['memories:read']::TEXT[],
        'active',
        'Cursor IDE OAuth client'
    ),
    (
        'claude-web',
        'Claude Web MCP Client',
        'public',
        'mcp',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "https://claude.ai/mcp/callback",
            "https://app.claude.ai/mcp/callback",
            "https://claude.anthropic.com/mcp/callback"
        ]'::jsonb,
        ARRAY['mcp:full', 'mcp:tools', 'mcp:resources', 'mcp:prompts', 'memories:read', 'memories:write', 'memories:delete', 'api-keys:read', 'profile']::TEXT[],
        ARRAY['mcp:full', 'memories:read']::TEXT[],
        'active',
        'Claude Web MCP OAuth client'
    ),
    (
        'vscode-extension',
        'VSCode Extension (PKCE)',
        'public',
        'native',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:8080/callback",
            "http://127.0.0.1:8080/callback",
            "vscode://lanonasis.mcp-client/callback"
        ]'::jsonb,
        ARRAY['memories:read', 'memories:write', 'memories:delete', 'profile']::TEXT[],
        ARRAY['memories:read']::TEXT[],
        'active',
        'VSCode extension OAuth client'
    ),
    (
        'claude-desktop',
        'Claude Desktop MCP Client',
        'public',
        'mcp',
        TRUE,
        ARRAY['S256']::VARCHAR[],
        '[
            "http://localhost:3000/mcp/callback",
            "http://127.0.0.1:3000/mcp/callback",
            "http://localhost:52813/oauth/callback",
            "http://127.0.0.1:52813/oauth/callback",
            "claude-desktop://oauth/callback"
        ]'::jsonb,
        ARRAY['mcp:full', 'mcp:tools', 'mcp:resources', 'mcp:prompts', 'memories:read', 'memories:write', 'memories:delete', 'api-keys:read', 'api-keys:write', 'profile']::TEXT[],
        ARRAY['mcp:full', 'memories:read', 'memories:write']::TEXT[],
        'active',
        'Claude Desktop MCP OAuth client'
    )
ON CONFLICT (client_id) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    client_type = EXCLUDED.client_type,
    application_type = EXCLUDED.application_type,
    require_pkce = EXCLUDED.require_pkce,
    allowed_code_challenge_methods = EXCLUDED.allowed_code_challenge_methods,
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes = EXCLUDED.allowed_scopes,
    default_scopes = EXCLUDED.default_scopes,
    status = EXCLUDED.status,
    description = EXCLUDED.description,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'Migration 013: Seeded OAuth clients from previous database snapshot';
END $$;
