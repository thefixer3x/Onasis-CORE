-- Migration: add optional caller binding metadata to API keys
-- Purpose:
--   Let auth-gateway bind an API key to an intended audience/client/installation
--   and, for stronger clients, a request-signing public key.
--
-- Rollout model:
--   - Existing rows get '{}' and remain legacy-compatible.
--   - Per-key binding becomes enforceable when binding JSON contains audience,
--     client_id, installation_id, or require_request_signature.
--   - Global enforcement can be enabled later with AUTH_GATEWAY_REQUIRE_API_KEY_BINDING=true.

DO $$
BEGIN
  IF to_regclass('security_service.api_keys') IS NOT NULL THEN
    ALTER TABLE security_service.api_keys
      ADD COLUMN IF NOT EXISTS binding JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_security_service_api_keys_binding
      ON security_service.api_keys USING GIN (binding);

    COMMENT ON COLUMN security_service.api_keys.binding IS
      'Optional auth-gateway API key binding metadata: audiences, client_id, installation_id, public_key_pem/public_key_jwk, require_request_signature.';
  END IF;

  IF to_regclass('public.api_keys') IS NOT NULL THEN
    ALTER TABLE public.api_keys
      ADD COLUMN IF NOT EXISTS binding JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_public_api_keys_binding
      ON public.api_keys USING GIN (binding);

    COMMENT ON COLUMN public.api_keys.binding IS
      'Optional auth-gateway API key binding metadata for legacy public api_keys.';
  END IF;
END $$;
