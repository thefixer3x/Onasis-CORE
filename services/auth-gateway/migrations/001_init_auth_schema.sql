-- Auth Gateway Schema for Neon DB
-- Generated from .devops/NEON-DB-AUTH-INTEGRATION-TEMPLATE.md

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth_gateway;

CREATE TABLE IF NOT EXISTS auth_gateway.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('mcp', 'cli', 'web', 'api')),
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  client_id TEXT,
  scope TEXT[],
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth_gateway.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON auth_gateway.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth_gateway.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_platform ON auth_gateway.sessions(platform);

CREATE TABLE IF NOT EXISTS auth_gateway.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  redirect_uris TEXT[] NOT NULL,
  allowed_scopes TEXT[] NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_clients_client_id ON auth_gateway.api_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_api_clients_owner_id ON auth_gateway.api_clients(owner_id);

CREATE TABLE IF NOT EXISTS auth_gateway.auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES auth_gateway.api_clients(client_id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  redirect_uri TEXT NOT NULL,
  scope TEXT[],
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_expires_at ON auth_gateway.auth_codes(expires_at);

CREATE TABLE IF NOT EXISTS auth_gateway.audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  client_id TEXT,
  platform TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON auth_gateway.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON auth_gateway.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON auth_gateway.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_success ON auth_gateway.audit_log(success) WHERE success = false;

ALTER TABLE auth_gateway.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own sessions" ON auth_gateway.sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Service role can manage all sessions" ON auth_gateway.sessions
  USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Users can view their API clients" ON auth_gateway.api_clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY IF NOT EXISTS "Service role can manage API clients" ON auth_gateway.api_clients
  USING (auth.role() = 'service_role');

GRANT USAGE ON SCHEMA auth_gateway TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth_gateway TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA auth_gateway TO service_role;

COMMENT ON SCHEMA auth_gateway IS 'Authentication gateway schema for centralized auth management';
COMMENT ON TABLE auth_gateway.sessions IS 'Active user sessions across all platforms';
COMMENT ON TABLE auth_gateway.api_clients IS 'OAuth API clients and applications';
COMMENT ON TABLE auth_gateway.audit_log IS 'Audit trail for authentication events';
