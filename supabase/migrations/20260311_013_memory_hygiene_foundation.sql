-- ============================================================================
-- Memory hygiene foundation (compatibility mode)
-- Date: 2026-03-11
-- Purpose:
--   1. Add additive hygiene fields to the backing memory table.
--   2. Introduce revision storage without changing live CRUD behavior yet.
--   3. Make deleted memories invisible by default in shared views/search RPCs.
-- ============================================================================

BEGIN;

LOCK TABLE public.memory_entries IN ACCESS EXCLUSIVE MODE;
LOCK TABLE security_service.memory_entries IN ACCESS EXCLUSIVE MODE;

ALTER TABLE security_service.memory_entries
  ADD COLUMN IF NOT EXISTS topic_key TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicate_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS superseded_by UUID;

ALTER TABLE security_service.memory_entries
  DROP CONSTRAINT IF EXISTS memory_entries_duplicate_count_nonnegative,
  DROP CONSTRAINT IF EXISTS memory_entries_revision_count_nonnegative,
  DROP CONSTRAINT IF EXISTS memory_entries_superseded_by_fkey;

ALTER TABLE security_service.memory_entries
  ADD CONSTRAINT memory_entries_duplicate_count_nonnegative
    CHECK (duplicate_count >= 0),
  ADD CONSTRAINT memory_entries_revision_count_nonnegative
    CHECK (revision_count >= 0),
  ADD CONSTRAINT memory_entries_superseded_by_fkey
    FOREIGN KEY (superseded_by)
    REFERENCES security_service.memory_entries(id)
    ON DELETE SET NULL;

UPDATE security_service.memory_entries
SET
  deleted_at = NULL,
  duplicate_count = COALESCE(duplicate_count, 0),
  last_seen_at = COALESCE(last_seen_at, updated_at, created_at),
  revision_count = COALESCE(revision_count, 0),
  topic_key = NULL
WHERE
  deleted_at IS DISTINCT FROM NULL
  OR duplicate_count IS NULL
  OR last_seen_at IS NULL
  OR revision_count IS NULL
  OR topic_key IS DISTINCT FROM NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_active_rows
  ON security_service.memory_entries(updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_deleted_at
  ON security_service.memory_entries(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_org_topic_key
  ON security_service.memory_entries(organization_id, topic_key)
  WHERE topic_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_scope_owner_topic_key
  ON security_service.memory_entries(scope, owner_type, owner_id, topic_key)
  WHERE topic_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_last_seen_at
  ON security_service.memory_entries(last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_superseded_by
  ON security_service.memory_entries(superseded_by)
  WHERE superseded_by IS NOT NULL;

COMMENT ON COLUMN security_service.memory_entries.topic_key IS
  'Optional normalized topic key for upsert-style writes and retrieval grouping.';

COMMENT ON COLUMN security_service.memory_entries.deleted_at IS
  'Soft delete tombstone. Deleted rows stay in storage but should be excluded from default reads.';

COMMENT ON COLUMN security_service.memory_entries.duplicate_count IS
  'Number of duplicate write hits merged into the canonical memory.';

COMMENT ON COLUMN security_service.memory_entries.last_seen_at IS
  'Most recent time the memory or its duplicate equivalent was observed.';

COMMENT ON COLUMN security_service.memory_entries.revision_count IS
  'Curated revision count for important updates that snapshot into memory_revisions.';

COMMENT ON COLUMN security_service.memory_entries.superseded_by IS
  'Optional pointer to a canonical replacement memory when this row is superseded.';

CREATE TABLE IF NOT EXISTS security_service.memory_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES security_service.memory_entries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  changed_by UUID,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_revisions_memory_revision_number
  ON security_service.memory_revisions(memory_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory_id_created_at
  ON security_service.memory_revisions(memory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_revisions_organization_id
  ON security_service.memory_revisions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_revisions_changed_by
  ON security_service.memory_revisions(changed_by)
  WHERE changed_by IS NOT NULL;

COMMENT ON TABLE security_service.memory_revisions IS
  'Curated revision snapshots for important memory updates.';

CREATE OR REPLACE VIEW public.memory_entries AS
SELECT
  id,
  title,
  content,
  memory_type,
  tags,
  topic_id,
  user_id,
  organization_id,
  embedding,
  voyage_embedding,
  embedding_provider,
  embedding_model,
  metadata,
  created_at,
  updated_at,
  last_accessed,
  access_count,
  type,
  scope,
  owner_type,
  owner_id,
  created_by,
  team_id,
  channel_id,
  agent_id,
  access_mode,
  archived_at,
  topic_key,
  deleted_at,
  duplicate_count,
  last_seen_at,
  revision_count,
  superseded_by
FROM security_service.memory_entries;

CREATE OR REPLACE VIEW public.memory_revisions AS
SELECT
  id,
  memory_id,
  organization_id,
  revision_number,
  title,
  content,
  tags,
  metadata,
  changed_by,
  change_reason,
  created_at
FROM security_service.memory_revisions;

CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector,
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
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
BEGIN
  query_dim := vector_dims(query_embedding);

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
      AND m.deleted_at IS NULL
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
      AND m.deleted_at IS NULL
      AND (1 - (m.embedding <=> query_embedding)) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_memories_voyage(
  query_embedding vector,
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
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

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = split_part(source_table, '.', 1)
      AND table_name = split_part(source_table, '.', 2)
      AND column_name = 'deleted_at'
  ) THEN
    deleted_expr := 'm.deleted_at IS NULL';
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

CREATE OR REPLACE FUNCTION public.count_memories(
  filter_organization_id UUID DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM public.memory_entries m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_type IS NULL OR m.memory_type::TEXT = filter_type)
    AND m.deleted_at IS NULL;

  RETURN json_build_object('count', total_count);
END;
$$;

COMMIT;
