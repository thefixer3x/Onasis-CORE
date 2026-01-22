-- Universal Authentication Identifier (UAI) Schema
-- Migration: 015_universal_auth_identifier.sql
-- Purpose: Create a single canonical identity that all authentication methods resolve to
--
-- UAI Architecture:
--   - auth_identities: The canonical identity table (single UUID per real person/entity)
--   - auth_credentials: Links authentication methods (JWT, API Key, OTP, etc.) to identities
--   - identity_provenance: Audit trail for identity changes and linking
--
-- All auth flows will resolve to auth_id regardless of how the user authenticates

BEGIN;

-- =============================================================================
-- CORE UAI TABLE: auth_identities
-- =============================================================================
-- This is the canonical source of truth for user identity across all platforms.
-- Every user gets ONE auth_id, regardless of how many auth methods they use.

CREATE TABLE IF NOT EXISTS auth_gateway.auth_identities (
  auth_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Status management
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'pending_verification')),

  -- Primary email (canonical, unique across all identities)
  primary_email TEXT UNIQUE,

  -- Display information (cached from primary auth method)
  display_name TEXT,
  avatar_url TEXT,

  -- Organization/tenant association (for multi-tenant scenarios)
  organization_id UUID,

  -- Verified flags
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_auth_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_identities_primary_email ON auth_gateway.auth_identities(LOWER(primary_email));
CREATE INDEX IF NOT EXISTS idx_auth_identities_organization_id ON auth_gateway.auth_identities(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_identities_status ON auth_gateway.auth_identities(status);
CREATE INDEX IF NOT EXISTS idx_auth_identities_created_at ON auth_gateway.auth_identities(created_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION auth_gateway.touch_auth_identity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auth_identities_updated_at ON auth_gateway.auth_identities;
CREATE TRIGGER trg_auth_identities_updated_at
BEFORE UPDATE ON auth_gateway.auth_identities
FOR EACH ROW EXECUTE FUNCTION auth_gateway.touch_auth_identity();

-- =============================================================================
-- AUTH CREDENTIALS TABLE: Links auth methods to canonical identity
-- =============================================================================
-- Users can authenticate via multiple methods (JWT, API Key, OTP, Magic Link, etc.)
-- Each credential links to exactly one auth_identity

CREATE TABLE IF NOT EXISTS auth_gateway.auth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to canonical identity (UAI)
  auth_id UUID NOT NULL REFERENCES auth_gateway.auth_identities(auth_id) ON DELETE CASCADE,

  -- Auth method type
  method TEXT NOT NULL CHECK (method IN (
    'supabase_jwt',    -- Supabase-issued JWT token
    'api_key',         -- Dashboard-generated API key
    'oauth_pkce',      -- OAuth 2.0 PKCE flow
    'oauth_token',     -- OAuth token from provider
    'magic_link',      -- Email magic link
    'otp_email',       -- Email OTP
    'otp_sms',         -- SMS OTP
    'sso_session',     -- SSO session cookie
    'password',        -- Password-based auth
    'passkey',         -- WebAuthn/Passkey
    'mcp_token'        -- MCP platform token
  )),

  -- Method-specific identifier (e.g., email for magic_link, Supabase user_id for supabase_jwt)
  identifier TEXT NOT NULL,

  -- Credential storage (hashed for secrets, null for non-secret methods)
  credential_hash TEXT,

  -- Provider information (for OAuth/SSO)
  provider TEXT,
  provider_user_id TEXT,

  -- Platform association
  platform TEXT CHECK (platform IN ('mcp', 'cli', 'web', 'api', 'mobile', 'sdk')),

  -- Status and lifecycle
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(method, identifier),  -- Each method+identifier combo must be unique
  UNIQUE(auth_id, method, is_primary) -- Only one primary per method per identity
);

-- Indexes for credential lookups (critical for auth performance)
CREATE INDEX IF NOT EXISTS idx_auth_credentials_auth_id ON auth_gateway.auth_credentials(auth_id);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_method ON auth_gateway.auth_credentials(method);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_identifier ON auth_gateway.auth_credentials(identifier);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_method_identifier ON auth_gateway.auth_credentials(method, identifier);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_provider ON auth_gateway.auth_credentials(provider) WHERE provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_credentials_active ON auth_gateway.auth_credentials(auth_id) WHERE is_active = true;

-- Auto-update trigger
DROP TRIGGER IF EXISTS trg_auth_credentials_updated_at ON auth_gateway.auth_credentials;
CREATE TRIGGER trg_auth_credentials_updated_at
BEFORE UPDATE ON auth_gateway.auth_credentials
FOR EACH ROW EXECUTE FUNCTION auth_gateway.touch_auth_identity();

-- =============================================================================
-- IDENTITY PROVENANCE TABLE: Audit trail for identity changes
-- =============================================================================
-- Records all identity-related events for security auditing and compliance

CREATE TABLE IF NOT EXISTS auth_gateway.identity_provenance (
  id BIGSERIAL PRIMARY KEY,

  -- The identity this event relates to
  auth_id UUID NOT NULL REFERENCES auth_gateway.auth_identities(auth_id) ON DELETE CASCADE,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'identity_created',      -- New identity created
    'identity_merged',       -- Two identities merged
    'identity_split',        -- Identity split into two
    'identity_suspended',    -- Identity suspended
    'identity_reactivated',  -- Identity reactivated
    'identity_deleted',      -- Identity soft-deleted

    'credential_added',      -- New auth method added
    'credential_removed',    -- Auth method removed
    'credential_rotated',    -- Credential secret rotated
    'credential_verified',   -- Credential verified
    'credential_expired',    -- Credential expired

    'primary_changed',       -- Primary credential changed
    'email_changed',         -- Primary email changed
    'organization_changed',  -- Organization association changed

    'auth_success',          -- Successful authentication
    'auth_failure',          -- Failed authentication attempt
    'token_issued',          -- New token issued
    'token_revoked'          -- Token revoked
  )),

  -- Related credential (if applicable)
  credential_id UUID REFERENCES auth_gateway.auth_credentials(id) ON DELETE SET NULL,

  -- Actor information (who performed this action)
  actor_auth_id UUID REFERENCES auth_gateway.auth_identities(auth_id) ON DELETE SET NULL,
  actor_type TEXT CHECK (actor_type IN ('user', 'admin', 'system', 'api')),

  -- Request context
  ip_address INET,
  user_agent TEXT,
  platform TEXT,

  -- Event details
  details JSONB DEFAULT '{}'::jsonb,

  -- For merge/split operations, reference to related identity
  related_auth_id UUID,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for provenance queries
CREATE INDEX IF NOT EXISTS idx_identity_provenance_auth_id ON auth_gateway.identity_provenance(auth_id);
CREATE INDEX IF NOT EXISTS idx_identity_provenance_event_type ON auth_gateway.identity_provenance(event_type);
CREATE INDEX IF NOT EXISTS idx_identity_provenance_created_at ON auth_gateway.identity_provenance(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_provenance_credential_id ON auth_gateway.identity_provenance(credential_id) WHERE credential_id IS NOT NULL;

-- =============================================================================
-- UPDATE user_accounts TO LINK TO UAI
-- =============================================================================
-- Add auth_id column to existing user_accounts table

ALTER TABLE auth_gateway.user_accounts
  ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth_gateway.auth_identities(auth_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_accounts_auth_id ON auth_gateway.user_accounts(auth_id) WHERE auth_id IS NOT NULL;

-- =============================================================================
-- IDENTITY RESOLUTION FUNCTION
-- =============================================================================
-- Core function to resolve any auth method to a canonical auth_id

CREATE OR REPLACE FUNCTION auth_gateway.resolve_identity(
  p_method TEXT,
  p_identifier TEXT,
  p_create_if_missing BOOLEAN DEFAULT false,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_auth_id UUID;
  v_credential_id UUID;
BEGIN
  -- Look up existing credential
  SELECT auth_id INTO v_auth_id
  FROM auth_gateway.auth_credentials
  WHERE method = p_method
    AND identifier = p_identifier
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());

  -- If found, update last_used_at and return
  IF v_auth_id IS NOT NULL THEN
    UPDATE auth_gateway.auth_credentials
    SET last_used_at = NOW()
    WHERE method = p_method AND identifier = p_identifier;

    UPDATE auth_gateway.auth_identities
    SET last_auth_at = NOW()
    WHERE auth_id = v_auth_id;

    RETURN v_auth_id;
  END IF;

  -- If not found and create_if_missing is true, create new identity
  IF p_create_if_missing THEN
    -- Create new identity
    INSERT INTO auth_gateway.auth_identities (
      primary_email,
      metadata
    ) VALUES (
      CASE WHEN p_method IN ('magic_link', 'otp_email', 'supabase_jwt')
           THEN p_identifier
           ELSE NULL END,
      p_metadata
    )
    RETURNING auth_id INTO v_auth_id;

    -- Create credential
    INSERT INTO auth_gateway.auth_credentials (
      auth_id,
      method,
      identifier,
      is_primary,
      metadata
    ) VALUES (
      v_auth_id,
      p_method,
      p_identifier,
      true,
      p_metadata
    )
    RETURNING id INTO v_credential_id;

    -- Log provenance
    INSERT INTO auth_gateway.identity_provenance (
      auth_id,
      event_type,
      credential_id,
      actor_type,
      details
    ) VALUES (
      v_auth_id,
      'identity_created',
      v_credential_id,
      'system',
      jsonb_build_object(
        'method', p_method,
        'identifier', p_identifier,
        'source', 'auto_creation'
      )
    );

    RETURN v_auth_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- LINK CREDENTIAL FUNCTION
-- =============================================================================
-- Link a new auth method to an existing identity

CREATE OR REPLACE FUNCTION auth_gateway.link_credential(
  p_auth_id UUID,
  p_method TEXT,
  p_identifier TEXT,
  p_is_primary BOOLEAN DEFAULT false,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_actor_auth_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_credential_id UUID;
  v_existing_auth_id UUID;
BEGIN
  -- Check if credential already exists
  SELECT auth_id INTO v_existing_auth_id
  FROM auth_gateway.auth_credentials
  WHERE method = p_method AND identifier = p_identifier;

  IF v_existing_auth_id IS NOT NULL THEN
    IF v_existing_auth_id = p_auth_id THEN
      -- Already linked to this identity
      SELECT id INTO v_credential_id
      FROM auth_gateway.auth_credentials
      WHERE method = p_method AND identifier = p_identifier;
      RETURN v_credential_id;
    ELSE
      -- Linked to different identity - error or merge required
      RAISE EXCEPTION 'Credential already linked to different identity';
    END IF;
  END IF;

  -- If setting as primary, unset other primaries for this method
  IF p_is_primary THEN
    UPDATE auth_gateway.auth_credentials
    SET is_primary = false
    WHERE auth_id = p_auth_id AND method = p_method AND is_primary = true;
  END IF;

  -- Create new credential
  INSERT INTO auth_gateway.auth_credentials (
    auth_id,
    method,
    identifier,
    is_primary,
    metadata
  ) VALUES (
    p_auth_id,
    p_method,
    p_identifier,
    p_is_primary,
    p_metadata
  )
  RETURNING id INTO v_credential_id;

  -- Log provenance
  INSERT INTO auth_gateway.identity_provenance (
    auth_id,
    event_type,
    credential_id,
    actor_auth_id,
    actor_type,
    details
  ) VALUES (
    p_auth_id,
    'credential_added',
    v_credential_id,
    p_actor_auth_id,
    CASE WHEN p_actor_auth_id IS NOT NULL THEN 'user' ELSE 'system' END,
    jsonb_build_object(
      'method', p_method,
      'identifier', p_identifier,
      'is_primary', p_is_primary
    )
  );

  RETURN v_credential_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MIGRATE EXISTING USER ACCOUNTS
-- =============================================================================
-- Create UAI for existing users in user_accounts who don't have one

DO $$
DECLARE
  v_user RECORD;
  v_auth_id UUID;
BEGIN
  FOR v_user IN
    SELECT user_id, email, role, provider, raw_metadata, created_at
    FROM auth_gateway.user_accounts
    WHERE auth_id IS NULL
  LOOP
    -- Create auth_identity for existing user
    INSERT INTO auth_gateway.auth_identities (
      primary_email,
      status,
      email_verified,
      metadata,
      created_at
    ) VALUES (
      v_user.email,
      'active',
      true,  -- Assume existing users are verified
      COALESCE(v_user.raw_metadata, '{}'::jsonb) ||
        jsonb_build_object('migrated_from', 'user_accounts', 'original_user_id', v_user.user_id),
      v_user.created_at
    )
    RETURNING auth_id INTO v_auth_id;

    -- Create credential for existing auth method
    INSERT INTO auth_gateway.auth_credentials (
      auth_id,
      method,
      identifier,
      provider,
      is_primary,
      is_active,
      metadata,
      created_at
    ) VALUES (
      v_auth_id,
      CASE
        WHEN v_user.provider IS NOT NULL THEN 'oauth_token'
        ELSE 'supabase_jwt'
      END,
      v_user.email,
      v_user.provider,
      true,
      true,
      jsonb_build_object('migrated_from', 'user_accounts', 'role', v_user.role),
      v_user.created_at
    );

    -- Link user_account to new UAI
    UPDATE auth_gateway.user_accounts
    SET auth_id = v_auth_id
    WHERE user_id = v_user.user_id;

    -- Log provenance
    INSERT INTO auth_gateway.identity_provenance (
      auth_id,
      event_type,
      actor_type,
      details
    ) VALUES (
      v_auth_id,
      'identity_created',
      'system',
      jsonb_build_object(
        'source', 'migration_015',
        'original_user_id', v_user.user_id,
        'email', v_user.email
      )
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE auth_gateway.auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.identity_provenance ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role can manage identities" ON auth_gateway.auth_identities
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage credentials" ON auth_gateway.auth_credentials
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can view provenance" ON auth_gateway.identity_provenance
  FOR SELECT USING (true);

-- Grant permissions
GRANT ALL ON auth_gateway.auth_identities TO service_role;
GRANT ALL ON auth_gateway.auth_credentials TO service_role;
GRANT SELECT, INSERT ON auth_gateway.identity_provenance TO service_role;
GRANT USAGE ON SEQUENCE auth_gateway.identity_provenance_id_seq TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE auth_gateway.auth_identities IS 'Canonical identity table - single UUID per real user (UAI)';
COMMENT ON TABLE auth_gateway.auth_credentials IS 'Links authentication methods to canonical identities';
COMMENT ON TABLE auth_gateway.identity_provenance IS 'Audit trail for all identity-related events';
COMMENT ON COLUMN auth_gateway.auth_identities.auth_id IS 'Universal Authentication Identifier (UAI) - the single canonical ID';
COMMENT ON FUNCTION auth_gateway.resolve_identity IS 'Resolves any auth method to a canonical auth_id';
COMMENT ON FUNCTION auth_gateway.link_credential IS 'Links a new auth method to an existing identity';

COMMIT;
