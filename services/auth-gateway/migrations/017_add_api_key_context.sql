-- Migration: add key_context to canonical auth-gateway API keys
-- Legacy keys remain NULL (= legacy/unbounded behavior).

ALTER TABLE security_service.api_keys
  ADD COLUMN IF NOT EXISTS key_context TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_keys_key_context_check'
      AND conrelid = 'security_service.api_keys'::regclass
  ) THEN
    ALTER TABLE security_service.api_keys
      ADD CONSTRAINT api_keys_key_context_check
      CHECK (key_context IS NULL OR key_context IN ('personal', 'team', 'enterprise'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_key_context
  ON security_service.api_keys (key_context)
  WHERE key_context IS NOT NULL;
