-- Memory Service Schema for MaaS
-- Comprehensive memory storage with vector embeddings and multi-tenant support
-- Designed for the lanonasis-maas service integration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create maas schema for MaaS-specific tables
CREATE SCHEMA IF NOT EXISTS maas;

-- Organizations table for MaaS multi-tenancy
CREATE TABLE IF NOT EXISTS maas.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    
    -- Limits based on plan
    max_memories INTEGER DEFAULT 1000,
    max_storage_mb INTEGER DEFAULT 100,
    vector_search_enabled BOOLEAN DEFAULT true,
    
    -- Billing and usage
    current_memories_count INTEGER DEFAULT 0,
    current_storage_mb DECIMAL(10,2) DEFAULT 0,
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Settings
    settings JSONB DEFAULT '{}'::jsonb
);

-- Users table for MaaS authentication (integrated with Core auth)
CREATE TABLE IF NOT EXISTS maas.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Reference to Core auth user
    organization_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    
    -- User preferences
    preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, organization_id)
);

-- Topics for organizing memories
CREATE TABLE IF NOT EXISTS maas.topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color code
    icon VARCHAR(50) DEFAULT 'folder',
    
    -- Hierarchy support
    parent_id UUID REFERENCES maas.topics(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    
    -- Statistics
    memory_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(organization_id, user_id, name)
);

-- Memory entries with vector embeddings
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
    
    -- Vector embedding for semantic search
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
    content_size INTEGER GENERATED ALWAYS AS (LENGTH(content)) STORED
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

-- API keys for programmatic access (delegated to Core but tracked here)
CREATE TABLE IF NOT EXISTS maas.api_key_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL, -- Reference to Core API key
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
    partition_date DATE GENERATED ALWAYS AS (created_at::date) STORED
);

-- Usage analytics (partitioned by month for performance)
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
    partition_month DATE GENERATED ALWAYS AS (date_trunc('month', recorded_at)::date) STORED
);

-- Create indexes for performance

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_maas_organizations_slug ON maas.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_maas_organizations_status ON maas.organizations(status);
CREATE INDEX IF NOT EXISTS idx_maas_organizations_plan ON maas.organizations(plan);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_maas_users_user_id ON maas.users(user_id);
CREATE INDEX IF NOT EXISTS idx_maas_users_organization_id ON maas.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_maas_users_email ON maas.users(email);
CREATE INDEX IF NOT EXISTS idx_maas_users_status ON maas.users(status);

-- Topics indexes
CREATE INDEX IF NOT EXISTS idx_maas_topics_organization_user ON maas.topics(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_maas_topics_parent_id ON maas.topics(parent_id);
CREATE INDEX IF NOT EXISTS idx_maas_topics_name ON maas.topics(name);

-- Memory entries indexes (critical for performance)
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

-- Analytics indexes (partitioned)
CREATE INDEX IF NOT EXISTS idx_maas_analytics_org_month ON maas.usage_analytics(organization_id, partition_month);
CREATE INDEX IF NOT EXISTS idx_maas_analytics_metric_type ON maas.usage_analytics(metric_type);
CREATE INDEX IF NOT EXISTS idx_maas_analytics_user_recorded ON maas.usage_analytics(user_id, recorded_at);

-- Enable Row Level Security (RLS)
ALTER TABLE maas.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.memory_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE maas.usage_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Organizations
CREATE POLICY "Users can view their organizations" ON maas.organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Org admins can update their organizations" ON maas.organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for Users
CREATE POLICY "Users can view users in their organization" ON maas.users
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own profile" ON maas.users
    FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for Topics
CREATE POLICY "Users can manage topics in their organization" ON maas.topics
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id 
            FROM maas.users 
            WHERE user_id = auth.uid()
        )
    );

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

-- Functions for memory operations

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_memories(
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
CREATE OR REPLACE FUNCTION update_memory_access(memory_id uuid)
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
CREATE OR REPLACE FUNCTION create_memory_version()
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
CREATE TRIGGER create_memory_version_trigger
    AFTER INSERT OR UPDATE ON maas.memory_entries
    FOR EACH ROW
    EXECUTE FUNCTION create_memory_version();

-- Function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_maas_organizations_updated_at BEFORE UPDATE ON maas.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maas_users_updated_at BEFORE UPDATE ON maas.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maas_topics_updated_at BEFORE UPDATE ON maas.topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maas_memory_entries_updated_at BEFORE UPDATE ON maas.memory_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA maas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA maas TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA maas TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA maas TO authenticated;

-- Grant permissions to service role for API operations
GRANT ALL ON SCHEMA maas TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA maas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA maas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA maas TO service_role;

-- Insert demo data for development
INSERT INTO maas.organizations (name, slug, description, plan) VALUES 
('Demo Organization', 'demo-org', 'Demo organization for testing MaaS', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- Comments for documentation
COMMENT ON SCHEMA maas IS 'Memory as a Service schema for lanonasis-maas integration';
COMMENT ON TABLE maas.organizations IS 'Multi-tenant organizations with plan-based limits';
COMMENT ON TABLE maas.users IS 'Users within organizations, linked to Core auth system';
COMMENT ON TABLE maas.topics IS 'Hierarchical topic organization for memories';
COMMENT ON TABLE maas.memory_entries IS 'Core memory storage with vector embeddings for semantic search';
COMMENT ON TABLE maas.memory_versions IS 'Audit trail and versioning for memory changes';
COMMENT ON TABLE maas.api_key_usage IS 'Usage tracking for API keys (keys managed in Core)';
COMMENT ON TABLE maas.usage_analytics IS 'Usage analytics partitioned by month';

COMMENT ON FUNCTION match_memories IS 'Vector similarity search for memories with configurable threshold';
COMMENT ON FUNCTION update_memory_access IS 'Updates access tracking counters for memories';
COMMENT ON FUNCTION create_memory_version IS 'Trigger function to create version history on memory changes';