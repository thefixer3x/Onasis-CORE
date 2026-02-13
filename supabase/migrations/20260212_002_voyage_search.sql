-- ============================================================================
-- Voyage Embeddings Support for Semantic Search
-- Date: 2026-02-12
-- Purpose: Store voyage embeddings and provide voyage-specific search function
-- Notes:
--   - Handles deployments where public.memory_entries is a facade view
--   - Prefers real storage tables in security_service / maas schemas
-- ============================================================================

DO $$
DECLARE
  target_table TEXT;
BEGIN
  -- Prefer real base tables over public facade views
  IF to_regclass('security_service.memory_entries') IS NOT NULL THEN
    target_table := 'security_service.memory_entries';
  ELSIF to_regclass('maas.memory_entries') IS NOT NULL THEN
    target_table := 'maas.memory_entries';
  ELSIF to_regclass('public.memory_entries') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'memory_entries'
        AND c.relkind = 'r'
    )
  THEN
    target_table := 'public.memory_entries';
  END IF;

  IF target_table IS NULL THEN
    RAISE NOTICE 'No writable memory_entries table found; skipping voyage_embedding column/index creation.';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %s ADD COLUMN IF NOT EXISTS voyage_embedding vector(1024);',
    target_table
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_memory_entries_voyage_embedding ON %s USING hnsw (voyage_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);',
    target_table
  );
END $$;

CREATE OR REPLACE FUNCTION search_memories_voyage(
  query_embedding vector(1024),
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
DECLARE
  source_table TEXT;
  type_expr TEXT;
BEGIN
  -- Prefer real base tables, fall back to public relation only if needed
  IF to_regclass('security_service.memory_entries') IS NOT NULL THEN
    source_table := 'security_service.memory_entries';
  ELSIF to_regclass('maas.memory_entries') IS NOT NULL THEN
    source_table := 'maas.memory_entries';
  ELSIF to_regclass('public.memory_entries') IS NOT NULL THEN
    source_table := 'public.memory_entries';
  ELSE
    RETURN;
  END IF;

  -- If voyage_embedding isn't exposed on chosen relation, return empty result.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = split_part(source_table, '.', 1)
      AND table_name = split_part(source_table, '.', 2)
      AND column_name = 'voyage_embedding'
  ) THEN
    RETURN;
  END IF;

  -- Support both memory_type (public/security_service) and type (maas legacy)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = split_part(source_table, '.', 1)
      AND table_name = split_part(source_table, '.', 2)
      AND column_name = 'memory_type'
  ) THEN
    type_expr := 'm.memory_type::TEXT';
  ELSE
    type_expr := 'm.type::TEXT';
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT
      m.id,
      m.title::TEXT,
      m.content,
      %1$s AS memory_type,
      m.tags,
      m.metadata,
      (1 - (m.voyage_embedding <=> $1))::FLOAT AS similarity_score,
      m.user_id,
      m.organization_id,
      m.created_at,
      m.updated_at
    FROM %2$s m
    WHERE
      ($2 IS NULL OR m.organization_id = $2)
      AND ($3 IS NULL OR m.user_id = $3)
      AND ($4 IS NULL OR %1$s = $4)
      AND m.voyage_embedding IS NOT NULL
      AND (1 - (m.voyage_embedding <=> $1)) >= $5
    ORDER BY m.voyage_embedding <=> $1
    LIMIT $6',
    type_expr,
    source_table
  )
  USING
    query_embedding,
    filter_organization_id,
    filter_user_id,
    filter_type,
    match_threshold,
    match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_memories_voyage TO authenticated, anon;
