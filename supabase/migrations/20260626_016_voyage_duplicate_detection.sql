-- ============================================================================
-- Voyage-backed Duplicate Detection (index-accelerated)
-- Date: 2026-06-26
-- Purpose: Replace the intelligence-detect-duplicates Edge Function's in-memory
--          O(n^2) embedding compare with a single set-based query that uses the
--          HNSW index on voyage_embedding (top-k nearest neighbors per row).
-- Why:     The EF fetched every memory row WITH its full vector serialized as
--          text and compared every pair in Deno memory. Above ~500 rows this
--          exceeded the Edge Function compute/memory ceiling -> "Function failed
--          due to not having enough compute resources". It also read only the
--          legacy `embedding` (1536/OpenAI) column, which is mostly NULL after
--          the migration to voyage-4 (`voyage_embedding` 1024), so it silently
--          fell back to jaccard text similarity.
-- Method:  CROSS JOIN LATERAL each in-scope row to its k nearest neighbors via
--          `voyage_embedding <=> voyage_embedding` (HNSW). Verified live on
--          security_service.memory_entries: 782 voyage rows, top-5 each,
--          ~434ms total (vs the EF crashing). Read-only, SECURITY DEFINER.
-- Notes:   Mirrors search_memories_voyage() table-detection + memory_type/type
--          handling so it works whether the live store is security_service,
--          maas, or public.
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_duplicate_memories_voyage(
  match_threshold FLOAT DEFAULT 0.85,
  neighbors_per_memory INT DEFAULT 5,
  max_memories INT DEFAULT 2000,
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  primary_id UUID,
  primary_title TEXT,
  primary_created_at TIMESTAMPTZ,
  duplicate_id UUID,
  duplicate_title TEXT,
  duplicate_created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  source_table TEXT;
  type_col TEXT;
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
    type_col := 'memory_type';
  ELSE
    type_col := 'type';
  END IF;

  -- $1 threshold  $2 neighbors  $3 max_memories
  -- $4 org        $5 user       $6 type
  RETURN QUERY EXECUTE format(
    'WITH base AS (
       SELECT id, title, created_at, voyage_embedding
       FROM %1$s
       WHERE voyage_embedding IS NOT NULL
         AND ($4 IS NULL OR organization_id = $4)
         AND ($5 IS NULL OR user_id = $5)
         AND ($6 IS NULL OR %2$I::TEXT = $6)
       LIMIT $3
     )
     SELECT
       b.id,
       b.title::TEXT,
       b.created_at,
       n.id,
       n.title::TEXT,
       n.created_at,
       (1 - (b.voyage_embedding <=> n.voyage_embedding))::FLOAT AS similarity
     FROM base b
     CROSS JOIN LATERAL (
       SELECT m.id, m.title, m.created_at, m.voyage_embedding
       FROM %1$s m
       WHERE m.voyage_embedding IS NOT NULL
         AND m.id <> b.id
         AND ($4 IS NULL OR m.organization_id = $4)
         AND ($5 IS NULL OR m.user_id = $5)
         AND ($6 IS NULL OR m.%2$I::TEXT = $6)
       ORDER BY m.voyage_embedding <=> b.voyage_embedding
       LIMIT $2
     ) n
     WHERE (1 - (b.voyage_embedding <=> n.voyage_embedding)) >= $1
       AND b.id < n.id
     ORDER BY similarity DESC',
    source_table,  -- %1$s
    type_col       -- %2$I
  )
  USING
    match_threshold,         -- $1
    neighbors_per_memory,    -- $2
    max_memories,            -- $3
    filter_organization_id,  -- $4
    filter_user_id,          -- $5
    filter_type;             -- $6
END;
$$;

GRANT EXECUTE ON FUNCTION detect_duplicate_memories_voyage TO authenticated, anon;
