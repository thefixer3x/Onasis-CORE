-- Add app_id, app_name, and metadata to api_clients table
-- These fields support the app namespace pattern (app_<name>) for multi-tenant isolation

ALTER TABLE auth_gateway.api_clients
  ADD COLUMN IF NOT EXISTS app_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS app_name TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index on app_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_clients_app_id ON auth_gateway.api_clients(app_id);

-- Update existing rows to have app_id based on name if they don't have one
UPDATE auth_gateway.api_clients
SET app_id = 'app_' || lower(regexp_replace(name, '[^a-zA-Z0-9]', '_', 'g'))
WHERE app_id IS NULL;

-- Make app_id and app_name required for new rows
ALTER TABLE auth_gateway.api_clients
  ALTER COLUMN app_id SET NOT NULL,
  ALTER COLUMN app_name SET NOT NULL;

COMMENT ON COLUMN auth_gateway.api_clients.app_id IS 'Unique app identifier (format: app_<name>) - used for database namespace isolation';
COMMENT ON COLUMN auth_gateway.api_clients.app_name IS 'Human-readable app name';
COMMENT ON COLUMN auth_gateway.api_clients.metadata IS 'Additional app configuration and metadata';
