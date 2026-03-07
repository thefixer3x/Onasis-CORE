-- ============================================================================
-- Phase 1: Organization membership foundation
-- Date: 2026-03-07
-- Purpose:
--   1. Introduce membership-based organization access without breaking the
--      existing home-org model on security_service.users.organization_id.
--   2. Keep the real table in security_service and expose a public facade view
--      so future code can read memberships without bypassing the protected
--      schema layout.
--   3. Backfill one default membership per existing user from their current
--      home/default organization assignment.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'org_member_role'
  ) THEN
    CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'member', 'viewer');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security_service.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES security_service.users(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'member',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES security_service.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT org_members_org_user_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON security_service.org_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON security_service.org_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_active
  ON security_service.org_members(is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_one_default_per_user
  ON security_service.org_members(user_id)
  WHERE is_default = true;

DROP TRIGGER IF EXISTS update_org_members_updated_at ON security_service.org_members;
CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON security_service.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE security_service.org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to org_members" ON security_service.org_members;
CREATE POLICY "Service role full access to org_members"
  ON security_service.org_members
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own org memberships" ON security_service.org_members;
CREATE POLICY "Users can view own org memberships"
  ON security_service.org_members
  FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE security_service.org_members IS
  'Canonical organization memberships. Use this for authorization; security_service.users.organization_id remains the home/default org pointer.';

COMMENT ON COLUMN security_service.users.organization_id IS
  'Home/default organization pointer. Do not use this column as the sole authorization source once org_members is available.';

CREATE OR REPLACE VIEW public.org_members
WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  user_id,
  role,
  is_default,
  is_active,
  invited_by,
  joined_at,
  created_at,
  updated_at,
  metadata
FROM security_service.org_members;

COMMENT ON VIEW public.org_members IS
  'Facade view over security_service.org_members for membership-aware application reads.';

CREATE OR REPLACE FUNCTION public.is_org_member(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, security_service
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM security_service.org_members om
    WHERE om.user_id = p_user_id
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  );
$$;

COMMENT ON FUNCTION public.is_org_member(UUID, UUID) IS
  'Returns true when the given user has an active membership in the given organization.';

INSERT INTO security_service.org_members (
  organization_id,
  user_id,
  role,
  is_default,
  is_active,
  joined_at,
  created_at,
  updated_at,
  metadata
)
SELECT
  u.organization_id,
  u.id,
  CASE
    WHEN u.role = 'viewer' THEN 'viewer'::public.org_member_role
    WHEN u.role IN ('admin', 'superadmin', 'system') THEN 'admin'::public.org_member_role
    ELSE 'owner'::public.org_member_role
  END AS role,
  true AS is_default,
  true AS is_active,
  COALESCE(u.created_at, NOW()) AS joined_at,
  COALESCE(u.created_at, NOW()) AS created_at,
  COALESCE(u.updated_at, NOW()) AS updated_at,
  jsonb_build_object(
    'source', '20260307_006_org_members_foundation',
    'home_org', true,
    'legacy_user_role', u.role::text
  ) AS metadata
FROM security_service.users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE
SET
  is_default = EXCLUDED.is_default,
  is_active = true,
  updated_at = NOW(),
  metadata = COALESCE(security_service.org_members.metadata, '{}'::jsonb) || jsonb_build_object(
    'backfilled_at', NOW(),
    'home_org', true
  );

COMMIT;
