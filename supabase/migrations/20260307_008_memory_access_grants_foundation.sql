-- ============================================================================
-- Phase 1: Memory access grants foundation
-- Date: 2026-03-07
-- Purpose:
--   1. Create the canonical grant table for non-owner memory access.
--   2. Keep the real table in security_service with a public facade view.
--   3. Prepare for membership-aware RLS without changing live access behavior
--      yet.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'memory_grant_principal_type'
  ) THEN
    CREATE TYPE public.memory_grant_principal_type AS ENUM (
      'user',
      'agent',
      'team',
      'channel'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'memory_permission'
  ) THEN
    CREATE TYPE public.memory_permission AS ENUM (
      'read',
      'write',
      'share',
      'delete'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security_service.memory_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES security_service.memory_entries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  principal_type public.memory_grant_principal_type NOT NULL,
  principal_id UUID NOT NULL,
  permissions public.memory_permission[] NOT NULL DEFAULT ARRAY['read']::public.memory_permission[],
  granted_by UUID REFERENCES security_service.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT memory_access_grants_unique UNIQUE (memory_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_access_grants_memory_id
  ON security_service.memory_access_grants(memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_access_grants_org_id
  ON security_service.memory_access_grants(organization_id);

CREATE INDEX IF NOT EXISTS idx_memory_access_grants_principal
  ON security_service.memory_access_grants(principal_type, principal_id);

DROP TRIGGER IF EXISTS update_memory_access_grants_updated_at ON security_service.memory_access_grants;
CREATE TRIGGER update_memory_access_grants_updated_at
  BEFORE UPDATE ON security_service.memory_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE security_service.memory_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to memory_access_grants" ON security_service.memory_access_grants;
CREATE POLICY "Service role full access to memory_access_grants"
  ON security_service.memory_access_grants
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view direct memory grants" ON security_service.memory_access_grants;
CREATE POLICY "Users can view direct memory grants"
  ON security_service.memory_access_grants
  FOR SELECT
  USING (
    (
      principal_type = 'user'
      AND principal_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM security_service.memory_entries m
      WHERE m.id = memory_access_grants.memory_id
        AND m.created_by = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.memory_access_grants
WITH (security_invoker = true) AS
SELECT
  id,
  memory_id,
  organization_id,
  principal_type,
  principal_id,
  permissions,
  granted_by,
  created_at,
  updated_at,
  metadata
FROM security_service.memory_access_grants;

COMMENT ON TABLE security_service.memory_access_grants IS
  'Canonical ACL grants for memories beyond owner/default scope access.';

COMMENT ON VIEW public.memory_access_grants IS
  'Facade view over security_service.memory_access_grants.';

CREATE OR REPLACE FUNCTION public.user_has_memory_grant(
  p_user_id UUID,
  p_memory_id UUID,
  p_permission public.memory_permission DEFAULT 'read'::public.memory_permission
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, security_service
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM security_service.memory_access_grants mag
    WHERE mag.memory_id = p_memory_id
      AND mag.principal_type = 'user'
      AND mag.principal_id = p_user_id
      AND p_permission = ANY (mag.permissions)
  );
$$;

COMMENT ON FUNCTION public.user_has_memory_grant(UUID, UUID, public.memory_permission) IS
  'Returns true when a user has a direct explicit grant for the given permission on a memory.';

COMMIT;
