BEGIN;

CREATE TABLE IF NOT EXISTS security_service.memory_context_views (
  viewer_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  visibility_policy TEXT NOT NULL
    CHECK (visibility_policy IN ('full', 'team_only', 'redacted', 'denied')),
  key_context_constraints JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_id, subject_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_context_views_viewer
  ON security_service.memory_context_views(viewer_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_memory_context_views_subject
  ON security_service.memory_context_views(subject_id, organization_id);

CREATE OR REPLACE VIEW public.memory_context_views AS
  SELECT viewer_id, subject_id, organization_id, visibility_policy,
         key_context_constraints, created_at, updated_at
  FROM security_service.memory_context_views;

GRANT SELECT ON public.memory_context_views TO service_role;

COMMENT ON TABLE security_service.memory_context_views IS
  'Visibility policy rows: defines how a viewer sees a subject''s memories.';
COMMENT ON COLUMN security_service.memory_context_views.visibility_policy IS
  'full=no extra filter, team_only=org_id filter, redacted=[REDACTED] content, denied=empty result';
COMMENT ON COLUMN security_service.memory_context_views.key_context_constraints IS
  'Optional additional constraints (reserved for future key-context refinement)';

COMMIT;