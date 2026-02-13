-- Fix embedding dimensions for Voyage AI migration
-- Root Cause: Vector dimension mismatch between Voyage AI (1024) and OpenAI (1536)
-- This migration updates the schema to support Voyage AI's 1024-dimensional embeddings

-- Step 1: Alter the memory_entries table column to use vector(1024)
ALTER TABLE maas.memory_entries
  ALTER COLUMN embedding TYPE vector(1024);

-- Step 2: Drop and recreate the HNSW index with correct dimensions
DROP INDEX IF EXISTS idx_maas_memory_embedding;
CREATE INDEX idx_maas_memory_embedding ON maas.memory_entries
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 3: Update match_memories function to accept vector(1024)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(1024),  -- Updated from 1536 to 1024 for Voyage AI
    match_threshold float DEFAULT 0.8,
    match_count int DEFAULT 10,
    p_user_id uuid DEFAULT auth.uid(),
    p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title varchar,
    content text,
    type varchar,
    tags text[],
    similarity float,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.title,
        m.content,
        m.type,
        m.tags,
        (1 - (m.embedding <=> query_embedding)) as similarity,
        m.created_at
    FROM maas.memory_entries m
    JOIN maas.users u ON u.user_id = p_user_id AND u.organization_id = m.organization_id
    WHERE
        (p_organization_id IS NULL OR m.organization_id = p_organization_id)
        AND m.embedding IS NOT NULL
        AND (1 - (m.embedding <=> query_embedding)) > match_threshold
        AND m.is_archived = false
        AND (m.is_private = false OR m.user_id = p_user_id)
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_memories IS 'Vector similarity search for memories with Voyage AI embeddings (1024 dimensions)';

-- Step 4: Update any other functions that reference vector(1536)
-- Check if search_memories function exists in public schema and update it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'search_memories'
    ) THEN
        EXECUTE '
        CREATE OR REPLACE FUNCTION search_memories(
            query_embedding vector(1024),
            match_threshold float DEFAULT 0.7,
            match_count int DEFAULT 10,
            filter_organization_id uuid DEFAULT NULL,
            filter_type varchar DEFAULT NULL
        )
        RETURNS TABLE (
            id uuid,
            title varchar,
            content text,
            type varchar,
            tags text[],
            metadata jsonb,
            similarity float,
            created_at timestamptz,
            updated_at timestamptz
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $func$
        BEGIN
            RETURN QUERY
            SELECT
                m.id,
                m.title,
                m.content,
                m.type,
                m.tags,
                m.metadata,
                (1 - (m.embedding <=> query_embedding)) as similarity,
                m.created_at,
                m.updated_at
            FROM maas.memory_entries m
            WHERE
                (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
                AND (filter_type IS NULL OR m.type = filter_type)
                AND m.embedding IS NOT NULL
                AND (1 - (m.embedding <=> query_embedding)) > match_threshold
                AND m.is_archived = false
            ORDER BY m.embedding <=> query_embedding
            LIMIT match_count;
        END;
        $func$;
        ';
    END IF;
END $$;
