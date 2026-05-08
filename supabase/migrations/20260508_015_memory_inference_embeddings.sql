-- Phase 1 addendum: embedding column for conclusions + org-level threshold function
-- File: apps/onasis-core/supabase/migrations/20260508_015_memory_inference_embeddings.sql

BEGIN;

-- 1a. Add embedding column to memory_inferred_conclusions (needed for contradiction detection via pgvector)
ALTER TABLE security_service.memory_inferred_conclusions
  ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

CREATE INDEX IF NOT EXISTS idx_memory_inferred_conclusions_embedding
  ON security_service.memory_inferred_conclusions
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- 1b. Per-org reasoning token threshold function
-- Called by the cron worker to look up threshold without embedding org logic in TypeScript
CREATE OR REPLACE FUNCTION public.get_reasoning_token_threshold(
  p_organization_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'security_service', 'maas', 'extensions'
AS $$
DECLARE
  v_threshold INTEGER;
  v_plan TEXT;
BEGIN
  -- Per-org override takes highest priority
  IF p_organization_id IS NOT NULL THEN
    SELECT (settings->>'reasoning_token_threshold')::INTEGER
    INTO v_threshold
    FROM maas.organizations
    WHERE id = p_organization_id
      AND settings ? 'reasoning_token_threshold';

    IF v_threshold IS NOT NULL AND v_threshold > 0 THEN
      RETURN v_threshold;
    END IF;

    -- Fall back to plan-based threshold
    SELECT plan INTO v_plan
    FROM maas.organizations
    WHERE id = p_organization_id;

    RETURN CASE v_plan
      WHEN 'enterprise' THEN 500
      WHEN 'pro'        THEN 1000
      ELSE                   2000  -- free / unknown
    END;
  END IF;

  -- No org: personal user, use free-tier default
  RETURN 2000;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reasoning_token_threshold(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_reasoning_token_threshold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reasoning_token_threshold(UUID) TO anon;

COMMIT;