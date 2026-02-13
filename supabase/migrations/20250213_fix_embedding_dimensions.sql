-- Migration: Fix Embedding Provider Mismatch
-- Adds support for multiple embedding providers with correct dimensions
-- OpenAI: 1536, Voyage AI: 1024
-- Date: 2025-02-13

-- ============================================================================
-- ALTER MEMORY ENTRIES TABLE FOR MULTIPLE EMBEDDING PROVIDERS
-- ============================================================================

-- Add provider-specific embedding columns
ALTER TABLE memory_entries
ADD COLUMN IF NOT EXISTS embedding_provider TEXT DEFAULT 'openai' CHECK (embedding_provider IN ('openai', 'voyage', 'cohere')),
ADD COLUMN IF NOT EXISTS embedding_openai vector(1536),
ADD COLUMN IF NOT EXISTS embedding_voyage vector(1024),
ADD COLUMN IF NOT EXISTS embedding_cohere vector(4096);

-- Create index on embedding_provider for faster filtering
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding_provider ON memory_entries(embedding_provider);

-- ============================================================================
-- UPDATE EXISTING EMBEDDINGS
-- ============================================================================

-- Copy existing embeddings to openai column (assuming they're OpenAI embeddings)
UPDATE memory_entries
SET embedding_openai = embedding
WHERE embedding IS NOT NULL
  AND embedding_provider = 'openai'
  AND embedding_openai IS NULL;

-- ============================================================================
-- UPDATE SEARCH FUNCTIONS FOR MULTIPLE PROVIDERS
-- ============================================================================

-- Drop the old search function
DROP FUNCTION IF EXISTS search_memories(vector, FLOAT, INT, UUID, UUID, TEXT);

-- Create new search function that supports multiple embedding providers
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  embedding_provider_filter TEXT DEFAULT 'openai'
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
  embedding_provider TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Query based on the provider
  IF embedding_provider_filter = 'openai' THEN
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      (1 - (m.embedding_openai <=> query_embedding))::FLOAT AS similarity_score,
      m.user_id,
      m.organization_id,
      m.embedding_provider,
      m.created_at,
      m.updated_at
    FROM memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND m.embedding_openai IS NOT NULL
      AND (1 - (m.embedding_openai <=> query_embedding)) >= match_threshold
    ORDER BY m.embedding_openai <=> query_embedding
    LIMIT match_count;

  ELSIF embedding_provider_filter = 'voyage' THEN
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      (1 - (m.embedding_voyage <=> query_embedding))::FLOAT AS similarity_score,
      m.user_id,
      m.organization_id,
      m.embedding_provider,
      m.created_at,
      m.updated_at
    FROM memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND m.embedding_voyage IS NOT NULL
      AND (1 - (m.embedding_voyage <=> query_embedding)) >= match_threshold
    ORDER BY m.embedding_voyage <=> query_embedding
    LIMIT match_count;

  ELSIF embedding_provider_filter = 'cohere' THEN
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      (1 - (m.embedding_cohere <=> query_embedding))::FLOAT AS similarity_score,
      m.user_id,
      m.organization_id,
      m.embedding_provider,
      m.created_at,
      m.updated_at
    FROM memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND m.embedding_cohere IS NOT NULL
      AND (1 - (m.embedding_cohere <=> query_embedding)) >= match_threshold
    ORDER BY m.embedding_cohere <=> query_embedding
    LIMIT match_count;

  ELSE
    -- Default: search across all embeddings
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      COALESCE(
        (1 - (m.embedding_openai <=> query_embedding))::FLOAT,
        (1 - (m.embedding_voyage <=> query_embedding))::FLOAT,
        (1 - (m.embedding_cohere <=> query_embedding))::FLOAT,
        0
      ) AS similarity_score,
      m.user_id,
      m.organization_id,
      m.embedding_provider,
      m.created_at,
      m.updated_at
    FROM memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND (m.embedding_openai IS NOT NULL OR m.embedding_voyage IS NOT NULL OR m.embedding_cohere IS NOT NULL)
    ORDER BY COALESCE(
      (1 - (m.embedding_openai <=> query_embedding))::FLOAT,
      (1 - (m.embedding_voyage <=> query_embedding))::FLOAT,
      (1 - (m.embedding_cohere <=> query_embedding))::FLOAT,
      0
    ) DESC
    LIMIT match_count;
  END IF;
END;
$$;

-- ============================================================================
-- KEEP BACKWARD COMPATIBILITY
-- ============================================================================

-- Keep the old embedding column populated for backward compatibility
-- This can be removed after a migration period
CREATE OR REPLACE FUNCTION sync_embeddings()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync the primary embedding based on provider
  IF NEW.embedding_provider = 'openai' AND NEW.embedding_openai IS NOT NULL THEN
    NEW.embedding = NEW.embedding_openai;
  ELSIF NEW.embedding_provider = 'voyage' AND NEW.embedding_voyage IS NOT NULL THEN
    -- Voyage embeddings are 1024-dim, need to pad to 1536 for compatibility
    NEW.embedding = NEW.embedding_voyage || array_fill(0::real, ARRAY[512]);
  ELSIF NEW.embedding_provider = 'cohere' AND NEW.embedding_cohere IS NOT NULL THEN
    NEW.embedding = NEW.embedding_cohere[1:1536];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS sync_embeddings_trigger ON memory_entries;

-- Create trigger to sync embeddings
CREATE TRIGGER sync_embeddings_trigger
  BEFORE INSERT OR UPDATE ON memory_entries
  FOR EACH ROW
  EXECUTE FUNCTION sync_embeddings();

-- ============================================================================
-- UPDATE MEMORY STATS FUNCTION
-- ============================================================================

-- Update the memory_stats function to include embedding provider info
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
    'by_embedding_provider', (
      SELECT json_object_agg(embedding_provider, cnt)
      FROM (
        SELECT embedding_provider, COUNT(*) as cnt
        FROM memory_entries m
        WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
          AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
          AND embedding_provider IS NOT NULL
        GROUP BY embedding_provider
      ) t
    ),
    'with_embedding', (
      SELECT COUNT(*) FROM memory_entries m
      WHERE (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
        AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
        AND (m.embedding_openai IS NOT NULL OR m.embedding_voyage IS NOT NULL OR m.embedding_cohere IS NOT NULL)
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
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION search_memories TO authenticated, anon;
GRANT EXECUTE ON FUNCTION memory_stats TO authenticated, anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON COLUMN memory_entries.embedding_provider IS 'Embedding provider used (openai, voyage, cohere)';
COMMENT ON COLUMN memory_entries.embedding_openai IS 'OpenAI embeddings (1536 dimensions)';
COMMENT ON COLUMN memory_entries.embedding_voyage IS 'Voyage AI embeddings (1024 dimensions)';
COMMENT ON COLUMN memory_entries.embedding_cohere IS 'Cohere embeddings (4096 dimensions)';
