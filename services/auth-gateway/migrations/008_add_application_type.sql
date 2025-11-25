--
-- Add application_type field to oauth_clients table
-- Migration: 008_add_application_type
-- Created: 2025-01-25
-- Purpose: Distinguish between native/CLI/MCP clients (localhost allowed) vs web/server clients
--

-- =====================================================
-- Add application_type column
-- =====================================================

-- Add application_type column with default 'web' for backward compatibility
ALTER TABLE auth_gateway.oauth_clients
ADD COLUMN IF NOT EXISTS application_type VARCHAR(50) DEFAULT 'web' 
CHECK (application_type IN ('native', 'cli', 'mcp', 'web', 'server'));

-- Add comment
COMMENT ON COLUMN auth_gateway.oauth_clients.application_type IS 
'Application type: native (desktop/IDE), cli (command-line), mcp (MCP protocol), web (browser), server (backend service)';

-- =====================================================
-- Update existing clients with appropriate application types
-- =====================================================

-- IDE/Desktop extensions (native)
UPDATE auth_gateway.oauth_clients
SET application_type = 'native'
WHERE client_id IN (
    'cursor-extension',
    'vscode-extension',
    'vscode-extension-pkce',
    'windsurf-ide-extension'
)
OR client_name ILIKE '%extension%'
OR client_name ILIKE '%vscode%'
OR client_name ILIKE '%cursor%'
OR client_name ILIKE '%windsurf%';

-- CLI tools
UPDATE auth_gateway.oauth_clients
SET application_type = 'cli'
WHERE client_id IN (
    'onasis-cli',
    'lanonasis-cli'
)
OR client_name ILIKE '%cli%'
OR client_name ILIKE '%command%';

-- MCP clients
UPDATE auth_gateway.oauth_clients
SET application_type = 'mcp'
WHERE client_id IN (
    'claude-desktop',
    'claude-web',
    'mcp-client',
    'claude-desktop-mcp',
    'generic-mcp-client'
)
OR client_name ILIKE '%mcp%'
OR client_name ILIKE '%claude%';

-- Web clients (default, but explicitly set for clarity)
UPDATE auth_gateway.oauth_clients
SET application_type = 'web'
WHERE application_type = 'web'
AND (
    client_name ILIKE '%dashboard%'
    OR client_name ILIKE '%web%'
    OR allowed_redirect_uris::text ILIKE '%https://%'
);

-- =====================================================
-- Create index for faster queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_oauth_clients_application_type 
ON auth_gateway.oauth_clients(application_type);

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 008: Added application_type field to oauth_clients';
    RAISE NOTICE 'Updated existing clients with appropriate application types';
    RAISE NOTICE 'Native/CLI/MCP clients can now use localhost redirect URIs without warnings';
END $$;

