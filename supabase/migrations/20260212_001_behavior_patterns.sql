-- ============================================================================
-- Behavior Patterns Storage (Intelligence API)
-- Date: 2026-02-12
-- Purpose: Support behavior pattern record/recall/suggest endpoints
-- Notes:
--   - Uses security_service as canonical storage schema
--   - Keeps public.behavior_patterns as a facade view when possible
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS security_service;

CREATE TABLE IF NOT EXISTS security_service.behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  context JSONB NOT NULL,
  actions JSONB NOT NULL,
  final_outcome TEXT NOT NULL CHECK (final_outcome IN ('success', 'partial', 'failed')),
  confidence DOUBLE PRECISION DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  use_count INTEGER DEFAULT 1 CHECK (use_count >= 0),
  last_used_at TIMESTAMPTZ,
  trigger_embedding vector,
  voyage_trigger_embedding vector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavior_patterns_user_id
  ON security_service.behavior_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_final_outcome
  ON security_service.behavior_patterns(final_outcome);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_last_used_at
  ON security_service.behavior_patterns(last_used_at DESC);

-- Keep updated_at current
DROP TRIGGER IF EXISTS update_behavior_patterns_updated_at ON security_service.behavior_patterns;
DROP TRIGGER IF EXISTS behavior_patterns_updated_at ON security_service.behavior_patterns;
CREATE TRIGGER update_behavior_patterns_updated_at
  BEFORE UPDATE ON security_service.behavior_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE security_service.behavior_patterns ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to behavior_patterns" ON security_service.behavior_patterns;
DROP POLICY IF EXISTS "Service role full access" ON security_service.behavior_patterns;
CREATE POLICY "Service role full access to behavior_patterns" ON security_service.behavior_patterns
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can manage their own patterns
DROP POLICY IF EXISTS "Users can view own behavior patterns" ON security_service.behavior_patterns;
DROP POLICY IF EXISTS "Users can view own patterns" ON security_service.behavior_patterns;
CREATE POLICY "Users can view own behavior patterns" ON security_service.behavior_patterns
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own behavior patterns" ON security_service.behavior_patterns;
DROP POLICY IF EXISTS "Users can insert own patterns" ON security_service.behavior_patterns;
CREATE POLICY "Users can create own behavior patterns" ON security_service.behavior_patterns
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own behavior patterns" ON security_service.behavior_patterns;
DROP POLICY IF EXISTS "Users can update own patterns" ON security_service.behavior_patterns;
CREATE POLICY "Users can update own behavior patterns" ON security_service.behavior_patterns
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own behavior patterns" ON security_service.behavior_patterns;
DROP POLICY IF EXISTS "Users can delete own patterns" ON security_service.behavior_patterns;
CREATE POLICY "Users can delete own behavior patterns" ON security_service.behavior_patterns
  FOR DELETE
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON security_service.behavior_patterns TO authenticated;
GRANT ALL ON security_service.behavior_patterns TO service_role;

-- Maintain public facade view if public.behavior_patterns is absent or already a view.
DO $$
DECLARE
  public_relkind "char";
BEGIN
  SELECT c.relkind
    INTO public_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'behavior_patterns';

  IF public_relkind IS NULL THEN
    EXECUTE '
      CREATE VIEW public.behavior_patterns AS
      SELECT
        id,
        user_id,
        trigger,
        trigger_embedding,
        voyage_trigger_embedding,
        context,
        actions,
        final_outcome,
        confidence,
        use_count,
        last_used_at,
        created_at,
        updated_at
      FROM security_service.behavior_patterns
    ';
  ELSIF public_relkind = 'v' THEN
    EXECUTE '
      CREATE OR REPLACE VIEW public.behavior_patterns AS
      SELECT
        id,
        user_id,
        trigger,
        trigger_embedding,
        voyage_trigger_embedding,
        context,
        actions,
        final_outcome,
        confidence,
        use_count,
        last_used_at,
        created_at,
        updated_at
      FROM security_service.behavior_patterns
    ';
  END IF;
END $$;
