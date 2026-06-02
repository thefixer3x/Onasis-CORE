-- ============================================================================
-- Enable RLS on all security_service tables
-- Date: 2026-05-29
-- Purpose: Close cross-tenant access on 8 tables in the security_service
--          schema that were created without RLS enabled. All new tables
--          in this schema should now require explicit RLS enablement.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENABLE RLS ON ALL 8 TABLES
-- ============================================================================

ALTER TABLE security_service.memory_inference_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_inference_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_inferred_conclusions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_profile_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.users_backup                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_entries_backup        ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_revisions             ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. SERVICE ROLE BYPASS POLICIES
-- Edge Functions use service_role key and must be able to read/write all rows.
-- SECURITY DEFINER functions run as the table owner and bypass RLS entirely,
-- so these policies cover the service_role connection path only.
-- ============================================================================

DROP POLICY IF EXISTS "service_role full access to memory_inference_jobs"
  ON security_service.memory_inference_jobs;
CREATE POLICY "service_role full access to memory_inference_jobs"
  ON security_service.memory_inference_jobs
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_inference_batches"
  ON security_service.memory_inference_batches;
CREATE POLICY "service_role full access to memory_inference_batches"
  ON security_service.memory_inference_batches
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_inferred_conclusions"
  ON security_service.memory_inferred_conclusions;
CREATE POLICY "service_role full access to memory_inferred_conclusions"
  ON security_service.memory_inferred_conclusions
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_profiles"
  ON security_service.memory_profiles;
CREATE POLICY "service_role full access to memory_profiles"
  ON security_service.memory_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_profile_versions"
  ON security_service.memory_profile_versions;
CREATE POLICY "service_role full access to memory_profile_versions"
  ON security_service.memory_profile_versions
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to users_backup"
  ON security_service.users_backup;
CREATE POLICY "service_role full access to users_backup"
  ON security_service.users_backup
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_entries_backup"
  ON security_service.memory_entries_backup;
CREATE POLICY "service_role full access to memory_entries_backup"
  ON security_service.memory_entries_backup
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access to memory_revisions"
  ON security_service.memory_revisions;
CREATE POLICY "service_role full access to memory_revisions"
  ON security_service.memory_revisions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. AUTHENTICATED USER POLICIES — organization-scoped
--
-- These are defense-in-depth. Currently only service_role and SECURITY
-- DEFINER functions touch these tables. But if an authenticated JWT session
-- ever gains direct query access to these tables, RLS will enforce the
-- organization boundary.
-- ============================================================================

-- memory_inference_jobs — scoped by organization_id, user_id
DROP POLICY IF EXISTS "authenticated select own org memory_inference_jobs"
  ON security_service.memory_inference_jobs;
CREATE POLICY "authenticated select own org memory_inference_jobs"
  ON security_service.memory_inference_jobs
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_inference_batches — scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org memory_inference_batches"
  ON security_service.memory_inference_batches;
CREATE POLICY "authenticated select own org memory_inference_batches"
  ON security_service.memory_inference_batches
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_inferred_conclusions — scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org memory_inferred_conclusions"
  ON security_service.memory_inferred_conclusions;
CREATE POLICY "authenticated select own org memory_inferred_conclusions"
  ON security_service.memory_inferred_conclusions
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_profiles — scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org memory_profiles"
  ON security_service.memory_profiles;
CREATE POLICY "authenticated select own org memory_profiles"
  ON security_service.memory_profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_profile_versions — does not have direct organization_id column.
-- Scoped by JOINing through memory_profiles via profile_id.
DROP POLICY IF EXISTS "authenticated select own org memory_profile_versions"
  ON security_service.memory_profile_versions;
CREATE POLICY "authenticated select own org memory_profile_versions"
  ON security_service.memory_profile_versions
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM security_service.memory_profiles mp
      WHERE mp.subject_id = memory_profile_versions.profile_id
        AND mp.organization_id IN (
          SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    )
  );

-- users_backup — mirrors public.users, scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org users_backup"
  ON security_service.users_backup;
CREATE POLICY "authenticated select own org users_backup"
  ON security_service.users_backup
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_entries_backup — mirrors security_service.memory_entries, scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org memory_entries_backup"
  ON security_service.memory_entries_backup;
CREATE POLICY "authenticated select own org memory_entries_backup"
  ON security_service.memory_entries_backup
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- memory_revisions — scoped by organization_id
DROP POLICY IF EXISTS "authenticated select own org memory_revisions"
  ON security_service.memory_revisions;
CREATE POLICY "authenticated select own org memory_revisions"
  ON security_service.memory_revisions
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON POLICY "service_role full access to memory_inference_jobs"
  ON security_service.memory_inference_jobs IS
  'Allows Edge Functions using service_role key to bypass RLS for inference job operations';

COMMENT ON POLICY "service_role full access to memory_inference_batches"
  ON security_service.memory_inference_batches IS
  'Allows Edge Functions using service_role key to bypass RLS for inference batch operations';

COMMENT ON POLICY "service_role full access to memory_inferred_conclusions"
  ON security_service.memory_inferred_conclusions IS
  'Allows Edge Functions using service_role key to bypass RLS for inferred conclusion operations';

COMMENT ON POLICY "service_role full access to memory_profiles"
  ON security_service.memory_profiles IS
  'Allows Edge Functions using service_role key to bypass RLS for memory profile operations';

COMMENT ON POLICY "service_role full access to memory_profile_versions"
  ON security_service.memory_profile_versions IS
  'Allows Edge Functions using service_role key to bypass RLS for profile version operations';

COMMENT ON POLICY "service_role full access to users_backup"
  ON security_service.users_backup IS
  'Allows Edge Functions using service_role key to bypass RLS on user backup table';

COMMENT ON POLICY "service_role full access to memory_entries_backup"
  ON security_service.memory_entries_backup IS
  'Allows Edge Functions using service_role key to bypass RLS on memory entries backup table';

COMMENT ON POLICY "service_role full access to memory_revisions"
  ON security_service.memory_revisions IS
  'Allows Edge Functions using service_role key to bypass RLS for memory revision operations';

COMMIT;
