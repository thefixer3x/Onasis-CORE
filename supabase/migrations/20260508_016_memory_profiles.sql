-- ============================================================================
-- Phase 2: Living memory profile
-- Date: 2026-05-09
-- Purpose:
--   1. Per-subject living profile synthesised from inferred conclusions.
--   2. Versioned profile history for auditability.
--   3. Atomic upsert function used exclusively for all profile writes.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS security_service.memory_profiles (
  subject_id UUID PRIMARY KEY,
  organization_id UUID,
  profile_summary TEXT,
  structured_fields JSONB NOT NULL DEFAULT '{
    "preferences": [],
    "goals": [],
    "constraints": [],
    "tendencies": [],
    "facts": []
  }'::JSONB,
  last_reasoned_at TIMESTAMPTZ,
  freshness TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence_by_field JSONB NOT NULL DEFAULT '{}'::JSONB,
  head_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_service.memory_profile_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES security_service.memory_profiles(subject_id) ON DELETE CASCADE,
  diff JSONB NOT NULL,
  source_job_id UUID REFERENCES security_service.memory_inference_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_service.memory_profiles
  ADD CONSTRAINT fk_head_version
  FOREIGN KEY (head_version_id)
  REFERENCES security_service.memory_profile_versions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_memory_profile_versions_profile
  ON security_service.memory_profile_versions(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_profiles_organization
  ON security_service.memory_profiles(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE VIEW public.memory_profiles AS
  SELECT subject_id, organization_id, profile_summary, structured_fields,
         last_reasoned_at, freshness, confidence_by_field, head_version_id,
         created_at, updated_at
  FROM security_service.memory_profiles;

CREATE OR REPLACE VIEW public.memory_profile_versions AS
  SELECT id, profile_id, diff, source_job_id, created_at
  FROM security_service.memory_profile_versions;

CREATE OR REPLACE FUNCTION public.upsert_memory_profile(
  p_subject_id UUID,
  p_organization_id UUID DEFAULT NULL,
  p_profile_summary TEXT DEFAULT NULL,
  p_structured_fields JSONB DEFAULT NULL,
  p_confidence_by_field JSONB DEFAULT NULL,
  p_source_job_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'security_service', 'extensions'
AS $$
DECLARE
  v_version_id UUID;
  v_current_fields JSONB;
  v_diff JSONB;
BEGIN
  SELECT structured_fields INTO v_current_fields
  FROM security_service.memory_profiles
  WHERE subject_id = p_subject_id;

  v_diff := jsonb_build_object(
    'profile_summary_changed', (v_current_fields IS DISTINCT FROM p_structured_fields),
    'structured_fields', p_structured_fields,
    'source_job_id', p_source_job_id
  );

  INSERT INTO security_service.memory_profiles (
    subject_id, organization_id, profile_summary, structured_fields,
    confidence_by_field, last_reasoned_at, freshness, updated_at
  )
  VALUES (
    p_subject_id, p_organization_id, p_profile_summary,
    COALESCE(p_structured_fields, '{"preferences":[],"goals":[],"constraints":[],"tendencies":[],"facts":[]}'::JSONB),
    COALESCE(p_confidence_by_field, '{}'::JSONB),
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (subject_id) DO UPDATE SET
    organization_id        = COALESCE(EXCLUDED.organization_id, memory_profiles.organization_id),
    profile_summary        = COALESCE(EXCLUDED.profile_summary, memory_profiles.profile_summary),
    structured_fields      = COALESCE(EXCLUDED.structured_fields, memory_profiles.structured_fields),
    confidence_by_field    = COALESCE(EXCLUDED.confidence_by_field, memory_profiles.confidence_by_field),
    last_reasoned_at       = NOW(),
    freshness              = NOW(),
    updated_at             = NOW();

  INSERT INTO security_service.memory_profile_versions (profile_id, diff, source_job_id)
  VALUES (p_subject_id, v_diff, p_source_job_id)
  RETURNING id INTO v_version_id;

  UPDATE security_service.memory_profiles
  SET head_version_id = v_version_id,
      updated_at = NOW()
  WHERE subject_id = p_subject_id;

  RETURN v_version_id;
END;
$$;

GRANT SELECT ON public.memory_profiles TO service_role;
GRANT SELECT ON public.memory_profile_versions TO service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_memory_profile(UUID, UUID, TEXT, JSONB, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_memory_profile(UUID, UUID, TEXT, JSONB, JSONB, UUID) TO service_role;

COMMIT;
