-- ============================================================================
-- Phase 1: Memory inference derived-state foundation
-- Date: 2026-05-08
-- Purpose:
--   1. Add async reasoning queue state for memory writes.
--   2. Track token-threshold batches per subject.
--   3. Store inferred conclusions separately from raw memories.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS security_service.memory_inference_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  organization_id UUID,
  user_id UUID,
  source_memory_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  source_event TEXT NOT NULL DEFAULT 'memory.create'
    CHECK (source_event IN ('memory.create', 'memory.update', 'manual.flush', 'reprocess')),
  pending_token_count INTEGER NOT NULL DEFAULT 0
    CHECK (pending_token_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  CHECK (cardinality(source_memory_ids) > 0)
);

CREATE TABLE IF NOT EXISTS security_service.memory_inference_batches (
  subject_id UUID PRIMARY KEY,
  organization_id UUID,
  pending_token_count INTEGER NOT NULL DEFAULT 0
    CHECK (pending_token_count >= 0),
  pending_memory_count INTEGER NOT NULL DEFAULT 0
    CHECK (pending_memory_count >= 0),
  source_memory_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  last_job_id UUID REFERENCES security_service.memory_inference_jobs(id)
    ON DELETE SET NULL,
  last_flushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_service.memory_inferred_conclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  organization_id UUID,
  conclusion_type TEXT NOT NULL
    CHECK (conclusion_type IN ('explicit', 'deductive', 'inductive', 'abductive')),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2)
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence_memory_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  scope TEXT,
  freshness TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by UUID REFERENCES security_service.memory_inferred_conclusions(id)
    ON DELETE SET NULL,
  contradiction_group_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_job_id UUID REFERENCES security_service.memory_inference_jobs(id)
    ON DELETE SET NULL,
  CHECK (cardinality(evidence_memory_ids) > 0)
);

CREATE INDEX IF NOT EXISTS idx_memory_inference_jobs_status_created
  ON security_service.memory_inference_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_memory_inference_jobs_subject_created
  ON security_service.memory_inference_jobs(subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_inference_jobs_organization_status
  ON security_service.memory_inference_jobs(organization_id, status, created_at)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_inference_batches_threshold
  ON security_service.memory_inference_batches(pending_token_count DESC, updated_at)
  WHERE pending_token_count > 0;

CREATE INDEX IF NOT EXISTS idx_memory_inferred_conclusions_subject
  ON security_service.memory_inferred_conclusions(subject_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_memory_inferred_conclusions_freshness
  ON security_service.memory_inferred_conclusions(freshness DESC);

CREATE INDEX IF NOT EXISTS idx_memory_inferred_conclusions_source_job
  ON security_service.memory_inferred_conclusions(source_job_id)
  WHERE source_job_id IS NOT NULL;

COMMENT ON TABLE security_service.memory_inference_jobs IS
  'Async units of reasoning work created after successful memory writes.';

COMMENT ON TABLE security_service.memory_inference_batches IS
  'Per-subject token accumulator used to decide when background reasoning should flush.';

COMMENT ON TABLE security_service.memory_inferred_conclusions IS
  'Derived conclusions inferred from raw memories, stored separately from source memory entries.';

CREATE OR REPLACE VIEW public.memory_inference_jobs AS
SELECT
  id,
  subject_id,
  organization_id,
  user_id,
  source_memory_ids,
  status,
  source_event,
  pending_token_count,
  metadata,
  created_at,
  started_at,
  completed_at,
  error
FROM security_service.memory_inference_jobs;

CREATE OR REPLACE VIEW public.memory_inference_batches AS
SELECT
  subject_id,
  organization_id,
  pending_token_count,
  pending_memory_count,
  source_memory_ids,
  last_job_id,
  last_flushed_at,
  created_at,
  updated_at
FROM security_service.memory_inference_batches;

CREATE OR REPLACE VIEW public.memory_inferred_conclusions AS
SELECT
  id,
  subject_id,
  organization_id,
  conclusion_type,
  content,
  confidence,
  evidence_memory_ids,
  scope,
  freshness,
  superseded_by,
  contradiction_group_id,
  metadata,
  created_at,
  source_job_id
FROM security_service.memory_inferred_conclusions;

CREATE OR REPLACE FUNCTION public.enqueue_memory_inference_job(
  p_subject_id UUID,
  p_organization_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_source_memory_id UUID DEFAULT NULL,
  p_source_event TEXT DEFAULT 'memory.create',
  p_pending_token_count INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'security_service', 'extensions'
AS $$
DECLARE
  v_job_id UUID;
  v_source_memory_ids UUID[];
  v_pending_token_count INTEGER;
BEGIN
  IF p_subject_id IS NULL THEN
    RAISE EXCEPTION 'subject_id is required';
  END IF;

  IF p_source_memory_id IS NULL THEN
    RAISE EXCEPTION 'source_memory_id is required';
  END IF;

  v_source_memory_ids := ARRAY[p_source_memory_id]::UUID[];
  v_pending_token_count := GREATEST(COALESCE(p_pending_token_count, 0), 0);

  INSERT INTO security_service.memory_inference_jobs (
    subject_id,
    organization_id,
    user_id,
    source_memory_ids,
    status,
    source_event,
    pending_token_count,
    metadata
  )
  VALUES (
    p_subject_id,
    p_organization_id,
    p_user_id,
    v_source_memory_ids,
    'pending',
    COALESCE(p_source_event, 'memory.create'),
    v_pending_token_count,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_job_id;

  INSERT INTO security_service.memory_inference_batches AS batch (
    subject_id,
    organization_id,
    pending_token_count,
    pending_memory_count,
    source_memory_ids,
    last_job_id,
    updated_at
  )
  VALUES (
    p_subject_id,
    p_organization_id,
    v_pending_token_count,
    1,
    v_source_memory_ids,
    v_job_id,
    NOW()
  )
  ON CONFLICT (subject_id) DO UPDATE SET
    organization_id = COALESCE(EXCLUDED.organization_id, batch.organization_id),
    pending_token_count = batch.pending_token_count + EXCLUDED.pending_token_count,
    pending_memory_count = batch.pending_memory_count + EXCLUDED.pending_memory_count,
    source_memory_ids = ARRAY(
      SELECT DISTINCT source_memory_id
      FROM unnest(batch.source_memory_ids || EXCLUDED.source_memory_ids) AS source_memory_id
    ),
    last_job_id = EXCLUDED.last_job_id,
    updated_at = NOW();

  RETURN v_job_id;
END;
$$;

GRANT SELECT ON public.memory_inference_jobs TO service_role;
GRANT SELECT ON public.memory_inference_batches TO service_role;
GRANT SELECT ON public.memory_inferred_conclusions TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_memory_inference_job(
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  INTEGER,
  JSONB
) TO service_role;

COMMIT;
