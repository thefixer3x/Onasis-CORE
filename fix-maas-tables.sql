-- Fix MaaS Tables - Create missing memory_entries and related tables
-- This fixes the vector type issue from migration 002

-- Memory entries with vector embeddings (fixed vector type)
CREATE TABLE IF NOT EXISTS maas.memory_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    topic_id UUID REFERENCES maas.topics(id) ON DELETE SET NULL,
    
    -- Core content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT, -- Auto-generated summary
    
    -- Categorization
    type VARCHAR(50) DEFAULT 'context' CHECK (type IN (
        'context', 'project', 'knowledge', 'reference', 
        'personal', 'workflow', 'note', 'document'
    )),
    tags TEXT[] DEFAULT '{}',
    
    -- Vector embedding for semantic search (using proper vector type)
    embedding vector(1536), -- OpenAI text-embedding-ada-002 dimension
    
    -- Metadata and settings
    metadata JSONB DEFAULT '{}'::jsonb,
    is_private BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    
    -- File attachments support
    attachments JSONB DEFAULT '[]'::jsonb,
    
    -- Access tracking
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Content size tracking
    content_size INTEGER
);

-- Memory versions for audit trail
CREATE TABLE IF NOT EXISTS maas.memory_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES maas.memory_entries(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Snapshot of memory at this version
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    tags TEXT[],
    metadata JSONB,
    
    -- Change tracking
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'restore')),
    changed_fields TEXT[],
    change_summary TEXT,
    
    -- Version metadata
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(memory_id, version_number)
);

-- API keys for programmatic access
CREATE TABLE IF NOT EXISTS maas.api_key_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Usage tracking
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    
    -- Request metadata
    request_size INTEGER,
    response_size INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Partitioning key for performance
    partition_date DATE
);

-- Usage analytics
CREATE TABLE IF NOT EXISTS maas.usage_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    user_id UUID,
    
    -- Metrics
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN (
        'memory_created', 'memory_updated', 'memory_deleted', 
        'search_performed', 'api_call', 'login', 'export'
    )),
    metric_value DECIMAL(10,4) DEFAULT 1,
    
    -- Dimensions
    dimensions JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamp for partitioning
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    partition_month DATE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maas_memory_organization_user ON maas.memory_entries(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_maas_memory_user_created ON maas.memory_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maas_memory_topic_id ON maas.memory_entries(topic_id);
CREATE INDEX IF NOT EXISTS idx_maas_memory_type ON maas.memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_maas_memory_tags ON maas.memory_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_maas_memory_content_search ON maas.memory_entries USING GIN(to_tsvector('english', title || ' ' || content));
CREATE INDEX IF NOT EXISTS idx_maas_memory_archived ON maas.memory_entries(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_maas_memory_private ON maas.memory_entries(is_private);

-- Vector similarity search index (HNSW for best performance)
CREATE INDEX IF NOT EXISTS idx_maas_memory_embedding ON maas.memory_entries USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Memory versions indexes
CREATE INDEX IF NOT EXISTS idx_maas_memory_versions_memory_id ON maas.memory_versions(memory_id);
CREATE INDEX IF NOT EXISTS idx_maas_memory_versions_created_at ON maas.memory_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maas_memory_versions_change_type ON maas.memory_versions(change_type);

-- API usage indexes
CREATE INDEX IF NOT EXISTS idx_maas_api_usage_org_date ON maas.api_key_usage(organization_id, partition_date);
CREATE INDEX IF NOT EXISTS idx_maas_api_usage_key_id ON maas.api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_maas_api_usage_endpoint ON maas.api_key_usage(endpoint);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_maas_analytics_org_month ON maas.usage_analytics(organization_id, partition_month);
CREATE INDEX IF NOT EXISTS idx_maas_analytics_metric_type ON maas.usage_analytics(metric_type);
CREATE INDEX IF NOT EXISTS idx_maas_analytics_user_recorded ON maas.usage_analytics(user_id, recorded_at);

-- Enable RLS
ALTER TABLE maas.memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.memory_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.usage_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Memory Entries
CREATE POLICY "Users can view memories in their organization" ON maas.memory_entries
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        ) AND (
            is_private = false OR user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own memories" ON maas.memory_entries
    FOR ALL USING (user_id = auth.uid());

-- RLS Policies for Memory Versions
CREATE POLICY "Users can view versions of accessible memories" ON maas.memory_versions
    FOR SELECT USING (
        memory_id IN (
            SELECT id 
            FROM maas.memory_entries 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for API Usage
CREATE POLICY "Users can view their organization's API usage" ON maas.api_key_usage
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for Analytics
CREATE POLICY "Users can view their organization's analytics" ON maas.usage_analytics
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        )
    );

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION maas.match_memories(
    query_embedding vector(1536),
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

-- Function to update memory access tracking
CREATE OR REPLACE FUNCTION maas.update_memory_access(memory_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE maas.memory_entries
    SET 
        access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE id = memory_id;
END;
$$;

-- Function to create memory version on update
CREATE OR REPLACE FUNCTION maas.create_memory_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    version_num integer;
    changed_fields text[] := '{}';
BEGIN
    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO version_num
    FROM maas.memory_versions
    WHERE memory_id = NEW.id;
    
    -- Detect changed fields
    IF TG_OP = 'UPDATE' THEN
        IF OLD.title != NEW.title THEN
            changed_fields := array_append(changed_fields, 'title');
        END IF;
        IF OLD.content != NEW.content THEN
            changed_fields := array_append(changed_fields, 'content');
        END IF;
        IF OLD.type != NEW.type THEN
            changed_fields := array_append(changed_fields, 'type');
        END IF;
        IF OLD.tags != NEW.tags THEN
            changed_fields := array_append(changed_fields, 'tags');
        END IF;
    END IF;
    
    -- Insert version record
    INSERT INTO maas.memory_versions (
        memory_id,
        version_number,
        title,
        content,
        type,
        tags,
        metadata,
        change_type,
        changed_fields,
        created_by
    ) VALUES (
        NEW.id,
        version_num,
        NEW.title,
        NEW.content,
        NEW.type,
        NEW.tags,
        NEW.metadata,
        CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
        changed_fields,
        NEW.user_id
    );
    
    RETURN NEW;
END;
$$;

-- Create trigger for memory versioning
DROP TRIGGER IF EXISTS create_memory_version_trigger ON maas.memory_entries;
CREATE TRIGGER create_memory_version_trigger
    AFTER INSERT OR UPDATE ON maas.memory_entries
    FOR EACH ROW
    EXECUTE FUNCTION maas.create_memory_version();

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_maas_memory_entries_updated_at ON maas.memory_entries;
CREATE TRIGGER update_maas_memory_entries_updated_at 
    BEFORE UPDATE ON maas.memory_entries 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON maas.memory_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maas.memory_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maas.api_key_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maas.usage_analytics TO authenticated;

GRANT ALL ON maas.memory_entries TO service_role;
GRANT ALL ON maas.memory_versions TO service_role;
GRANT ALL ON maas.api_key_usage TO service_role;
GRANT ALL ON maas.usage_analytics TO service_role;

-- Comments
COMMENT ON TABLE maas.memory_entries IS 'Core memory storage with vector embeddings for semantic search';
COMMENT ON TABLE maas.memory_versions IS 'Audit trail and versioning for memory changes';
COMMENT ON TABLE maas.api_key_usage IS 'Usage tracking for API keys';
COMMENT ON TABLE maas.usage_analytics IS 'Usage analytics partitioned by month';
COMMENT ON FUNCTION maas.match_memories IS 'Vector similarity search for memories with configurable threshold';
COMMENT ON FUNCTION maas.update_memory_access IS 'Updates access tracking counters for memories';
COMMENT ON FUNCTION maas.create_memory_version IS 'Trigger function to create version history on memory changes';
