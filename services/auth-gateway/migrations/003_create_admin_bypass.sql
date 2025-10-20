-- Emergency Admin Bypass System
-- Creates fail-safe admin accounts that can NEVER be locked out

-- 1. Create admin bypass table (separate from regular auth)
CREATE TABLE IF NOT EXISTS auth_gateway.admin_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  bypass_all_checks BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_admin_override_email ON auth_gateway.admin_override(email);

-- 2. Insert emergency admin accounts
-- Password: REDACTED_CHANGE_ME (you can change this)
-- Hash generated with bcrypt rounds=12

INSERT INTO auth_gateway.admin_override (email, password_hash, full_name, metadata)
VALUES
  (
    'admin@example.com',
    '$2b$12$ODYULBf55kCd6CW6rY7jUuPiB.kprOYc8XR6O8ZEJ1tQoKngpWGmy', -- REDACTED_CHANGE_ME
    'Lanonasis System Administrator',
    '{"role": "super_admin", "permissions": ["*"], "bypass": true}'::jsonb
  ),
  (
    'owner@example.com',
    '$2b$12$ODYULBf55kCd6CW6rY7jUuPiB.kprOYc8XR6O8ZEJ1tQoKngpWGmy', -- REDACTED_CHANGE_ME
    'Seye Derick - Owner',
    '{"role": "owner", "permissions": ["*"], "bypass": true}'::jsonb
  )
ON CONFLICT (email) DO NOTHING;

-- 3. Create admin session that never expires
CREATE TABLE IF NOT EXISTS auth_gateway.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth_gateway.admin_override(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  never_expires BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON auth_gateway.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON auth_gateway.admin_sessions(admin_id);

-- 4. Audit log for admin access (separate tracking)
CREATE TABLE IF NOT EXISTS auth_gateway.admin_access_log (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_log_email ON auth_gateway.admin_access_log(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_created_at ON auth_gateway.admin_access_log(created_at DESC);

-- Grant access to service role
GRANT ALL ON auth_gateway.admin_override TO service_role;
GRANT ALL ON auth_gateway.admin_sessions TO service_role;
GRANT ALL ON auth_gateway.admin_access_log TO service_role;

-- Comments
COMMENT ON TABLE auth_gateway.admin_override IS 'Emergency admin accounts with bypass capabilities - NEVER DELETE';
COMMENT ON TABLE auth_gateway.admin_sessions IS 'Admin sessions that never expire';
COMMENT ON TABLE auth_gateway.admin_access_log IS 'Audit trail for admin override access';

-- Verify creation
SELECT
  email,
  full_name,
  bypass_all_checks,
  created_at
FROM auth_gateway.admin_override
ORDER BY created_at;
