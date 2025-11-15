-- Create API Keys table for vendor key authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Key identification
  key_hash TEXT NOT NULL UNIQUE,  -- Hashed vendor key (never store plain text)
  key_prefix TEXT NOT NULL,        -- First 8 chars for display (e.g., "vx_pmtwf")
  
  -- Association
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_scope TEXT NOT NULL DEFAULT 'lanonasis-maas',
  
  -- Metadata
  name TEXT,                        -- User-friendly name for the key
  description TEXT,                 -- Optional description
  
  -- Permissions (JSON array of scopes)
  permissions JSONB DEFAULT '["read", "write"]'::jsonb,
  
  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_reason TEXT,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Usage tracking
  last_used_at TIMESTAMP WITH TIME ZONE,
  usage_count BIGINT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();

-- Function to check if API key is valid
CREATE OR REPLACE FUNCTION is_api_key_valid(p_key_hash TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  user_id UUID,
  project_scope TEXT,
  permissions JSONB,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE
      WHEN k.id IS NULL THEN false
      WHEN NOT k.is_active THEN false
      WHEN k.is_revoked THEN false
      WHEN k.expires_at IS NOT NULL AND k.expires_at < NOW() THEN false
      ELSE true
    END as valid,
    k.user_id,
    k.project_scope,
    k.permissions,
    CASE
      WHEN k.id IS NULL THEN 'API key not found'
      WHEN NOT k.is_active THEN 'API key is inactive'
      WHEN k.is_revoked THEN 'API key has been revoked'
      WHEN k.expires_at IS NOT NULL AND k.expires_at < NOW() THEN 'API key has expired'
      ELSE 'Valid'
    END as reason
  FROM api_keys k
  WHERE k.key_hash = p_key_hash
  LIMIT 1;
  
  -- If no rows returned, return invalid with reason
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::JSONB, 'API key not found'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE api_keys IS 'Stores API keys (vendor keys) for programmatic authentication';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the vendor key - never store plain text keys';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of the key for display purposes (e.g., vx_pmtwf...)';
