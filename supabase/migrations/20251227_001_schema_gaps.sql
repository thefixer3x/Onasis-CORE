-- ============================================================================
-- Supabase REST API Migration - Schema Gaps
-- Date: 2025-12-27
-- Purpose: Create missing tables and functions for Supabase REST API
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_sensitive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

-- Indexes for configurations
CREATE INDEX IF NOT EXISTS idx_configurations_organization_id ON configurations(organization_id);
CREATE INDEX IF NOT EXISTS idx_configurations_key ON configurations(key);

-- Trigger for updated_at
CREATE TRIGGER update_configurations_updated_at
  BEFORE UPDATE ON configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  organization_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_organization_id ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================================================
-- 4. VECTOR SEARCH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  metadata JSONB,
  similarity_score FLOAT,
  user_id UUID,
  organization_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.title::TEXT,
    m.content,
    m.memory_type::TEXT,
    m.tags,
    m.metadata,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity_score,
    m.user_id,
    m.organization_id,
    m.created_at,
    m.updated_at
  FROM memory_entries m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) >= match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 5. COUNT MEMORIES FUNCTION (for PostgREST RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION count_memories(
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM memory_entries m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type);

  RETURN json_build_object('count', total_count);
END;
$$;

-- ============================================================================
-- 6. MEMORY STATS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION memory_stats(
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', (
      SELECT COUNT(*) FROM memory_entries m
      WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
        AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    ),
    'by_type', (
      SELECT json_object_agg(memory_type, cnt)
      FROM (
        SELECT memory_type::TEXT, COUNT(*) as cnt
        FROM memory_entries m
        WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
          AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
        GROUP BY memory_type
      ) t
    ),
    'with_embedding', (
      SELECT COUNT(*) FROM memory_entries m
      WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
        AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
        AND m.embedding IS NOT NULL
    ),
    'recent_24h', (
      SELECT COUNT(*) FROM memory_entries m
      WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
        AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
        AND m.created_at > NOW() - INTERVAL '24 hours'
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================================
-- 7. UPDATE UPDATED_AT TRIGGER FUNCTION (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on functions to authenticated and anon roles
GRANT EXECUTE ON FUNCTION search_memories TO authenticated, anon;
GRANT EXECUTE ON FUNCTION count_memories TO authenticated, anon;
GRANT EXECUTE ON FUNCTION memory_stats TO authenticated, anon;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON configurations TO authenticated;
GRANT SELECT, INSERT ON audit_log TO authenticated;

-- Service role gets full access
GRANT ALL ON projects TO service_role;
GRANT ALL ON configurations TO service_role;
GRANT ALL ON audit_log TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION search_memories IS 'Semantic vector search for memories using pgvector cosine similarity';
COMMENT ON FUNCTION count_memories IS 'Count memories with optional filters for organization, user, and type';
COMMENT ON FUNCTION memory_stats IS 'Get memory statistics including counts by type and recent activity';
COMMENT ON TABLE projects IS 'Projects for organizing memories and API keys';
COMMENT ON TABLE configurations IS 'Organization-level configuration settings';
COMMENT ON TABLE audit_log IS 'Audit trail for compliance and debugging';
