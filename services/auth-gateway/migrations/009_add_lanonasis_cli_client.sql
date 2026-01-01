--
-- Add lanonasis-cli OAuth2 Client
-- Migration: 009_add_lanonasis_cli_client
-- Created: 2026-01-01
-- Purpose: Register lanonasis-cli client with correct redirect URIs for OAuth2 PKCE flow
--

-- =====================================================
-- Add lanonasis-cli OAuth Client
-- =====================================================
-- The CLI uses client_id 'lanonasis-cli' and port 8888 for OAuth callbacks

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
) VALUES (
    'lanonasis-cli',
    'Lanonasis CLI Tool',
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
    ARRAY[
        'read',
        'write',
        'offline_access',
        'memories:read',
        'memories:write',
        'memories:delete',
        'api-keys:read',
        'api-keys:write',
        'profile',
        'admin'
    ]::TEXT[],
    ARRAY['read', 'write', 'offline_access']::TEXT[],
    'active',
    'Official Lanonasis CLI tool for authentication and MCP management'
) ON CONFLICT (client_id) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    application_type = EXCLUDED.application_type,
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes = EXCLUDED.allowed_scopes,
    default_scopes = EXCLUDED.default_scopes,
    updated_at = NOW();

-- Also update onasis-cli to include port 8888 for backward compatibility
UPDATE auth_gateway.oauth_clients
SET allowed_redirect_uris = '[
    "http://localhost:3000/callback",
    "http://127.0.0.1:3000/callback",
    "http://localhost:8888/callback",
    "http://127.0.0.1:8888/callback"
]'::jsonb,
    updated_at = NOW()
WHERE client_id = 'onasis-cli';

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 009: Added lanonasis-cli OAuth client with port 8888 redirect URIs';
    RAISE NOTICE 'Updated onasis-cli to also support port 8888 for backward compatibility';
END $$;
