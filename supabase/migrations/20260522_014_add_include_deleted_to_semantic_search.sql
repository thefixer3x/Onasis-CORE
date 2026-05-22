-- Migration: 20260522_014_add_include_deleted_to_semantic_search.sql
-- Section 7 / Tier B patch from CODA SDK contract patch plan
-- Adds include_deleted parameter to search_memories and search_memories_voyage
-- so that the semantic RPC path respects the flag (matching lexical fallback behavior).
-- Requires: Supabase MCP apply_migration (NOT db push)

BEGIN;

-- =============================================================================
-- Drop existing 6-arg signatures before re-creating with 7-arg signature.
-- CREATE OR REPLACE FUNCTION only replaces on EXACT arg-type match, so without
-- this DROP the old 6-arg versions would coexist with the new 7-arg versions
-- and any caller not passing include_deleted would silently hit the OLD function
-- with hardcoded `m.deleted_at IS NULL`, defeating the fix.
--
-- Verified safe via pg_depend (2026-05-22): no views/triggers/functions depend
-- on either function. Only EF runtime callers reference them.
-- =============================================================================
DROP FUNCTION IF EXISTS public.search_memories(vector, double precision, integer, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.search_memories_voyage(vector, double precision, integer, uuid, uuid, text);

-- =============================================================================
-- search_memories — add include_deleted BOOLEAN DEFAULT FALSE parameter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector,
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  include_deleted BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  metadata JSONB,
  similarity DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'security_service', 'extensions'
AS $$
DECLARE
  query_dim INT;
  deleted_filter TEXT;
BEGIN
  query_dim := vector_dims(query_embedding);

  -- Conditional deleted_at filter based on include_deleted parameter
  -- include_deleted=true → no filter (include soft-deleted rows)
  -- include_deleted=false (default) → exclude soft-deleted rows
  deleted_filter := CASE WHEN include_deleted THEN 'TRUE' ELSE 'm.deleted_at IS NULL' END;

  IF query_dim = 1024 THEN
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content::TEXT,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      (1 - (m.voyage_embedding <=> query_embedding))::DOUBLE PRECISION AS similarity,
      m.created_at,
      m.updated_at
    FROM public.memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND m.voyage_embedding IS NOT NULL
      AND (deleted_filter = 'TRUE' OR m.deleted_at IS NULL)
      AND (1 - (m.voyage_embedding <=> query_embedding)) > match_threshold
    ORDER BY m.voyage_embedding <=> query_embedding
    LIMIT match_count;
  ELSE
    RETURN QUERY
    SELECT
      m.id,
      m.title::TEXT,
      m.content::TEXT,
      m.memory_type::TEXT,
      m.tags,
      m.metadata,
      (1 - (m.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity,
      m.created_at,
      m.updated_at
    FROM public.memory_entries m
    WHERE
      (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
      AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
      AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
      AND m.embedding IS NOT NULL
      AND (deleted_filter = 'TRUE' OR m.deleted_at IS NULL)
      AND (1 - (m.embedding <=> query_embedding)) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$$;

-- =============================================================================
-- search_memories_voyage — add include_deleted BOOLEAN DEFAULT FALSE parameter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.search_memories_voyage(
  query_embedding vector,
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  include_deleted BOOLEAN DEFAULT FALSE
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
SET search_path TO 'public', 'security_service', 'extensions'
AS $$
DECLARE
  source_table TEXT;
  type_expr TEXT;
  deleted_expr TEXT := 'TRUE';
BEGIN
  IF to_regclass('security_service.memory_entries') IS NOT NULL THEN
    source_table := 'security_service.memory_entries';
  ELSIF to_regclass('maas.memory_entries') IS NOT NULL THEN
    source_table := 'maas.memory_entries';
  ELSIF to_regclass('public.memory_entries') IS NOT NULL THEN
    source_table := 'public.memory_entries';
  ELSE
    RETURN;
  END IF;

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

  -- Conditional deleted_at filter based on include_deleted parameter
  -- include_deleted=true → deleted_expr becomes 'TRUE' (no filter)
  -- include_deleted=false (default) → deleted_expr = 'm.deleted_at IS NULL'
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = split_part(source_table, '.', 1)
      AND table_name = split_part(source_table, '.', 2)
      AND column_name = 'deleted_at'
  ) THEN
    deleted_expr := CASE WHEN include_deleted THEN 'TRUE' ELSE 'm.deleted_at IS NULL' END;
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
      AND %3$s
      AND (1 - (m.voyage_embedding <=> $1)) >= $5
    ORDER BY m.voyage_embedding <=> $1
    LIMIT $6',
    type_expr,
    source_table,
    deleted_expr
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

COMMIT;