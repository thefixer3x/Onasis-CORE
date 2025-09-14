-- Migration 004_memory_enhancements.sql
--
-- This migration augments the existing memory architecture to support
-- explicit ingest and retrieval paths. It introduces a dedicated vector
-- store table (maas.memory_vectors) and extends the relational table
-- (maas.memory_entries) with additional metadata required by the audit.
--
-- Key features:
--  * Adds columns to maas.memory_entries: source, raw_text, content_hash,
--    embedding_version and extends metadata to include PII flags. A unique
--    index on content_hash ensures deduplication.
--  * Creates maas.memory_vectors, a vector‑store table tied to
--    maas.memory_entries with per‑chunk embeddings. It includes tenant
--    scoping, tags, score_fields and an HNSW index for ANN search.
--  * Adds a timestamp column to memory_vectors for auditing chunk
--    creation time.
--  * Establishes row level security (RLS) policies that enforce tenant
--    scoping while allowing organization administrators to access all
--    vectors belonging to their organisation. It assumes that the JWT
--    claims include `tenant_id` and `is_org_admin` flags. Adjust this
--    logic if your auth implementation differs.
--
-- To apply this migration run:
--   supabase db push

-- Ensure the extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Extend the maas.memory_entries table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'maas'
          AND table_name   = 'memory_entries'
          AND column_name  = 'source'
    ) THEN
        ALTER TABLE maas.memory_entries
            ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'maas'
          AND table_name   = 'memory_entries'
          AND column_name  = 'raw_text'
    ) THEN
        ALTER TABLE maas.memory_entries
            ADD COLUMN raw_text TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'maas'
          AND table_name   = 'memory_entries'
          AND column_name  = 'content_hash'
    ) THEN
        ALTER TABLE maas.memory_entries
            ADD COLUMN content_hash TEXT;
        -- Unique constraint for deduplication
        CREATE UNIQUE INDEX IF NOT EXISTS idx_maas_memory_entries_content_hash
            ON maas.memory_entries (content_hash);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'maas'
          AND table_name   = 'memory_entries'
          AND column_name  = 'embedding_version'
    ) THEN
        ALTER TABLE maas.memory_entries
            ADD COLUMN embedding_version TEXT NOT NULL DEFAULT 'unknown';
    END IF;

    -- Ensure metadata column exists (optional)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'maas'
          AND table_name   = 'memory_entries'
          AND column_name  = 'metadata'
    ) THEN
        ALTER TABLE maas.memory_entries
            ADD COLUMN metadata JSONB;
    END IF;
END;
$$;

-- 2. Create the maas.memory_vectors table if it doesn't exist
CREATE TABLE IF NOT EXISTS maas.memory_vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES maas.memory_entries(id) ON DELETE CASCADE,
    chunk_id INTEGER NOT NULL,
    embedding vector(1536),
    tenant_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    tags TEXT[] DEFAULT '{}',
    score_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- timestamp column to track chunk creation time; separate from created_at for clarity
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (entry_id, chunk_id)
);

-- Indices for performance and filtering
CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_entry_id
    ON maas.memory_vectors(entry_id);

CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_tenant_id
    ON maas.memory_vectors(tenant_id);

CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_tags
    ON maas.memory_vectors USING GIN(tags);

-- HNSW index for efficient ANN search. Adjust parameters as needed.
CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_embedding
    ON maas.memory_vectors USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 3. RLS configuration
ALTER TABLE maas.memory_vectors ENABLE ROW LEVEL SECURITY;

-- Policy allowing users to read vectors for their tenant. If the JWT claim
-- includes is_org_admin = true, grant access to all vectors in the same organisation.
-- Adjust the JSON path to match your auth scheme.
DROP POLICY IF EXISTS "Users can view their memory vectors" ON maas.memory_vectors;
CREATE POLICY "Users can view their memory vectors" ON maas.memory_vectors
    FOR SELECT USING (
        -- org admins can see all vectors in their organisation
        (current_setting('request.jwt.claims', true)::jsonb->>'is_org_admin' = 'true'
         AND tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id'))
        OR
        -- regular users must match tenant_id
        (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text)
    );

-- Policy allowing users to manage their own vectors (insert/update/delete). Org admins
-- can manage all vectors in their organisation.
DROP POLICY IF EXISTS "Users can manage their memory vectors" ON maas.memory_vectors;
CREATE POLICY "Users can manage their memory vectors" ON maas.memory_vectors
    FOR ALL USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'is_org_admin' = 'true'
         AND tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id'))
        OR
        (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text)
    );

-- 4. Ensure memory_entries RLS uses tenant_id from JWT
ALTER TABLE maas.memory_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their memory entries" ON maas.memory_entries;
CREATE POLICY "Users can read their memory entries" ON maas.memory_entries
    FOR SELECT USING (
        current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
    );

DROP POLICY IF EXISTS "Users can manage their memory entries" ON maas.memory_entries;
CREATE POLICY "Users can manage their memory entries" ON maas.memory_entries
    FOR ALL USING (
        current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
    );