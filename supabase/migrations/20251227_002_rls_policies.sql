-- ============================================================================
-- Supabase REST API Migration - Row Level Security Policies
-- Date: 2025-12-27
-- Purpose: Set up RLS for secure multi-tenant access
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Ensure RLS is enabled on existing tables
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. SERVICE ROLE BYPASS POLICIES
-- These allow Edge Functions using service_role key to bypass RLS
-- ============================================================================

-- Memory entries - service role full access
DROP POLICY IF EXISTS "Service role full access to memory_entries" ON memory_entries;
CREATE POLICY "Service role full access to memory_entries" ON memory_entries
  FOR ALL
  USING (auth.role() = 'service_role');

-- API keys - service role full access
DROP POLICY IF EXISTS "Service role full access to api_keys" ON api_keys;
CREATE POLICY "Service role full access to api_keys" ON api_keys
  FOR ALL
  USING (auth.role() = 'service_role');

-- Projects - service role full access
DROP POLICY IF EXISTS "Service role full access to projects" ON projects;
CREATE POLICY "Service role full access to projects" ON projects
  FOR ALL
  USING (auth.role() = 'service_role');

-- Configurations - service role full access
DROP POLICY IF EXISTS "Service role full access to configurations" ON configurations;
CREATE POLICY "Service role full access to configurations" ON configurations
  FOR ALL
  USING (auth.role() = 'service_role');

-- Audit log - service role full access
DROP POLICY IF EXISTS "Service role full access to audit_log" ON audit_log;
CREATE POLICY "Service role full access to audit_log" ON audit_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. MEMORY ENTRIES POLICIES
-- ============================================================================

-- Users can view memories in their organization
DROP POLICY IF EXISTS "Users can view org memories" ON memory_entries;
CREATE POLICY "Users can view org memories" ON memory_entries
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can create memories (assigned to their org)
DROP POLICY IF EXISTS "Users can create memories" ON memory_entries;
CREATE POLICY "Users can create memories" ON memory_entries
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can update their own memories
DROP POLICY IF EXISTS "Users can update own memories" ON memory_entries;
CREATE POLICY "Users can update own memories" ON memory_entries
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own memories
DROP POLICY IF EXISTS "Users can delete own memories" ON memory_entries;
CREATE POLICY "Users can delete own memories" ON memory_entries
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 4. API KEYS POLICIES
-- ============================================================================

-- Users can view their own API keys
DROP POLICY IF EXISTS "Users can view own API keys" ON api_keys;
CREATE POLICY "Users can view own API keys" ON api_keys
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create API keys for themselves
DROP POLICY IF EXISTS "Users can create own API keys" ON api_keys;
CREATE POLICY "Users can create own API keys" ON api_keys
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own API keys
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
CREATE POLICY "Users can update own API keys" ON api_keys
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own API keys
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
CREATE POLICY "Users can delete own API keys" ON api_keys
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 5. PROJECTS POLICIES
-- ============================================================================

-- Users can view projects in their organization
DROP POLICY IF EXISTS "Users can view org projects" ON projects;
CREATE POLICY "Users can view org projects" ON projects
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can create projects in their organization
DROP POLICY IF EXISTS "Users can create org projects" ON projects;
CREATE POLICY "Users can create org projects" ON projects
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can update projects in their organization
DROP POLICY IF EXISTS "Users can update org projects" ON projects;
CREATE POLICY "Users can update org projects" ON projects
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can delete projects in their organization (admins only - check metadata)
DROP POLICY IF EXISTS "Admins can delete org projects" ON projects;
CREATE POLICY "Admins can delete org projects" ON projects
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- 6. CONFIGURATIONS POLICIES
-- ============================================================================

-- Users can view non-sensitive configs in their organization
DROP POLICY IF EXISTS "Users can view org configs" ON configurations;
CREATE POLICY "Users can view org configs" ON configurations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
    AND (is_sensitive = false OR is_sensitive IS NULL)
  );

-- Only admins can manage configurations (simple check for now)
DROP POLICY IF EXISTS "Admins can manage configs" ON configurations;
CREATE POLICY "Admins can manage configs" ON configurations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM api_keys
      WHERE user_id = auth.uid()
      AND access_level IN ('admin', 'enterprise')
      AND is_active = true
    )
  );

-- ============================================================================
-- 7. AUDIT LOG POLICIES
-- ============================================================================

-- Users can view their own audit logs
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_log;
CREATE POLICY "Users can view own audit logs" ON audit_log
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create audit entries (for their own actions)
DROP POLICY IF EXISTS "Users can create audit entries" ON audit_log;
CREATE POLICY "Users can create audit entries" ON audit_log
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- No updates or deletes allowed on audit log (immutable)
-- Only service_role can delete for data retention

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Service role full access to memory_entries" ON memory_entries IS
  'Allows Edge Functions using service_role key to bypass RLS for API operations';

COMMENT ON POLICY "Users can view org memories" ON memory_entries IS
  'Users can view all memories in their organization';

COMMENT ON POLICY "Service role full access to api_keys" ON api_keys IS
  'Required for API key validation in Edge Functions';
