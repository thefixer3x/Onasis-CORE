-- Create local user registry to satisfy auth_gateway foreign keys
-- and decouple from Supabase-managed auth.users table

BEGIN;

CREATE TABLE IF NOT EXISTS auth_gateway.user_accounts (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'authenticated',
  provider TEXT,
  raw_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON auth_gateway.user_accounts (LOWER(email));

-- Helper to keep updated_at fresh
CREATE OR REPLACE FUNCTION auth_gateway.touch_user_account()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_accounts_set_updated_at ON auth_gateway.user_accounts;
CREATE TRIGGER trg_user_accounts_set_updated_at
BEFORE UPDATE ON auth_gateway.user_accounts
FOR EACH ROW EXECUTE FUNCTION auth_gateway.touch_user_account();

-- Update foreign keys to reference new registry
ALTER TABLE auth_gateway.sessions
  DROP CONSTRAINT IF EXISTS sessions_user_accounts_user_id_fkey,
  DROP CONSTRAINT IF EXISTS sessions_user_id_fkey,
  ADD CONSTRAINT sessions_user_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth_gateway.user_accounts(user_id) ON DELETE CASCADE;

ALTER TABLE auth_gateway.api_clients
  DROP CONSTRAINT IF EXISTS api_clients_owner_id_fkey,
  ADD CONSTRAINT api_clients_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth_gateway.user_accounts(user_id) ON DELETE SET NULL;

ALTER TABLE auth_gateway.auth_codes
  DROP CONSTRAINT IF EXISTS auth_codes_user_accounts_user_id_fkey,
  DROP CONSTRAINT IF EXISTS auth_codes_user_id_fkey,
  ADD CONSTRAINT auth_codes_user_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth_gateway.user_accounts(user_id) ON DELETE CASCADE;

ALTER TABLE auth_gateway.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_user_accounts_user_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey,
  ADD CONSTRAINT audit_log_user_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth_gateway.user_accounts(user_id) ON DELETE SET NULL;

COMMIT;
