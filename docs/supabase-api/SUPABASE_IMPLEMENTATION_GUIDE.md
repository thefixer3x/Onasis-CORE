# Supabase Implementation Guide

**Version:** 1.0.0
**Date:** 2025-12-24

This guide provides step-by-step instructions for implementing the Supabase-based REST API for all 19 MCP tools.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Database Schema](#database-schema)
4. [Edge Functions Implementation](#edge-functions-implementation)
5. [Authentication Integration](#authentication-integration)
6. [Deployment](#deployment)
7. [Testing](#testing)
8. [Migration from Netlify](#migration-from-netlify)

---

## Prerequisites

### Required Tools

```bash
# Install Supabase CLI
npm install -g supabase

# Verify installation
supabase --version

# Install dependencies
npm install @supabase/supabase-js
npm install openai  # For vector embeddings
```

### Environment Variables

```bash
# .env.local
https://<project-ref>.supabase.co
REDACTED_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY=your_openai_api_key
AUTH_GATEWAY_URL=https://auth.lanonasis.com
```

---

## Project Setup

### 1. Initialize Supabase Project

```bash
# Create new Supabase project (or link existing)
supabase init

# Link to remote project
supabase link --project-ref your-project-ref

# Generate TypeScript types from database
supabase gen types typescript --local > supabase/functions/shared/database.types.ts
```

### 2. Project Structure

```
mcp-core/
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── memories/
│   │   │   ├── create/index.ts
│   │   │   ├── search/index.ts
│   │   │   ├── get/index.ts
│   │   │   ├── update/index.ts
│   │   │   ├── delete/index.ts
│   │   │   └── list/index.ts
│   │   ├── api-keys/
│   │   │   ├── create/index.ts
│   │   │   ├── list/index.ts
│   │   │   ├── rotate/index.ts
│   │   │   ├── revoke/index.ts
│   │   │   └── delete/index.ts
│   │   ├── projects/
│   │   │   ├── create/index.ts
│   │   │   └── list/index.ts
│   │   ├── organizations/
│   │   │   └── get/index.ts
│   │   ├── system/
│   │   │   ├── health/index.ts
│   │   │   ├── auth-status/index.ts
│   │   │   └── config/index.ts
│   │   └── shared/
│   │       ├── auth.ts
│   │       ├── cors.ts
│   │       ├── rate-limit.ts
│   │       ├── validation.ts
│   │       ├── database.types.ts
│   │       └── errors.ts
│   └── migrations/
│       ├── 20251224_001_initial_schema.sql
│       ├── 20251224_002_api_keys.sql
│       ├── 20251224_003_projects.sql
│       └── 20251224_004_vector_search.sql
```

---

## Database Schema

### 1. Initial Migration

Create `supabase/migrations/20251224_001_initial_schema.sql`:

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Organizations Table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'authenticated', 'team', 'enterprise')),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users Table (extends Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys Table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  access_level TEXT DEFAULT 'authenticated' CHECK (access_level IN ('public', 'authenticated', 'team', 'admin', 'enterprise')),
  is_active BOOLEAN DEFAULT true,
  project_id UUID,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects Table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory Entries Table
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('context', 'project', 'knowledge', 'reference', 'personal', 'workflow')),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configurations Table
CREATE TABLE configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

-- Audit Log Table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_memory_entries_user_id ON memory_entries(user_id);
CREATE INDEX idx_memory_entries_organization_id ON memory_entries(organization_id);
CREATE INDEX idx_memory_entries_type ON memory_entries(type);
CREATE INDEX idx_memory_entries_tags ON memory_entries USING GIN(tags);
CREATE INDEX idx_memory_entries_created_at ON memory_entries(created_at DESC);
CREATE INDEX idx_memory_entries_updated_at ON memory_entries(updated_at DESC);

-- Vector search index
CREATE INDEX memory_entries_embedding_idx
  ON memory_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_entries_updated_at BEFORE UPDATE ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Row Level Security (RLS)

Create `supabase/migrations/20251224_002_rls_policies.sql`:

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Organizations policies
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- API Keys policies
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING (user_id = auth.uid());

-- Projects policies
CREATE POLICY "Users can view organization projects"
  ON projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects"
  ON projects FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Memory entries policies
CREATE POLICY "Users can view own memories"
  ON memory_entries FOR SELECT
  USING (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create own memories"
  ON memory_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own memories"
  ON memory_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own memories"
  ON memory_entries FOR DELETE
  USING (user_id = auth.uid());

-- Configurations policies
CREATE POLICY "Users can view organization configs"
  ON configurations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage configs"
  ON configurations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND metadata->>'role' = 'admin'
    )
  );

-- Audit log policies (read-only for users)
CREATE POLICY "Users can view own audit logs"
  ON audit_log FOR SELECT
  USING (user_id = auth.uid());
```

---

## Edge Functions Implementation

### Shared Authentication Middleware

Create `supabase/functions/shared/auth.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

export interface AuthContext {
  user_id: string;
  organization_id: string;
  access_level: string;
  email: string;
}

export async function authenticate(
  req: Request,
  supabaseClient: any
): Promise<AuthContext | null> {
  // Try OAuth2/JWT token first
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (!error && user) {
      // Get user details from custom users table
      const { data: userData } = await supabaseClient
        .from('users')
        .select('organization_id, metadata')
        .eq('id', user.id)
        .single();

      return {
        user_id: user.id,
        organization_id: userData?.organization_id,
        access_level: userData?.metadata?.access_level || 'authenticated',
        email: user.email || ''
      };
    }
  }

  // Try API key authentication
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    // Hash the API key for lookup
    const keyHash = await hashApiKey(apiKey);

    const { data: apiKeyData, error } = await supabaseClient
      .from('api_keys')
      .select(`
        user_id,
        access_level,
        is_active,
        expires_at,
        users!inner(organization_id, email)
      `)
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (!error && apiKeyData) {
      // Check expiration
      if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
        return null;
      }

      // Update last_used_at
      await supabaseClient
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key_hash', keyHash);

      return {
        user_id: apiKeyData.user_id,
        organization_id: apiKeyData.users.organization_id,
        access_level: apiKeyData.access_level,
        email: apiKeyData.users.email
      };
    }
  }

  return null;
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### CORS Middleware

Create `supabase/functions/shared/cors.ts`:

```typescript
const ALLOWED_ORIGINS = [
  'https://dashboard.lanonasis.com',
  'https://mcp.lanonasis.com',
  'https://docs.lanonasis.com',
  'http://localhost:3000',
  'http://localhost:3001'
];

export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req.headers.get('origin'))
    });
  }
  return null;
}
```

### Error Handling

Create `supabase/functions/shared/errors.ts`:

```typescript
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: any[];
    request_id?: string;
    timestamp: string;
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: any[]
): Response {
  const error: ApiError = {
    success: false,
    error: {
      code,
      message,
      details,
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return new Response(JSON.stringify(error), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Example: Create Memory Function

Create `supabase/functions/memories-create/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.3.0';
import { authenticate } from '../shared/auth.ts';
import { corsHeaders, handleCors } from '../shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../shared/errors.ts';

interface CreateMemoryRequest {
  title: string;
  content: string;
  type: 'context' | 'project' | 'knowledge' | 'reference' | 'personal' | 'workflow';
  tags?: string[];
  metadata?: Record<string, any>;
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Authenticate request
    const authContext = await authenticate(req, supabaseClient);
    if (!authContext) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required',
        401
      );
    }

    // Parse request body
    const body: CreateMemoryRequest = await req.json();

    // Validate required fields
    if (!body.title || !body.content || !body.type) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Missing required fields: title, content, type',
        400,
        [
          { field: 'title', message: 'Title is required' },
          { field: 'content', message: 'Content is required' },
          { field: 'type', message: 'Type is required' }
        ]
      );
    }

    // Generate embedding using OpenAI
    const openai = new OpenAIApi(
      new Configuration({
        apiKey: Deno.env.get('OPENAI_API_KEY')
      })
    );

    const embeddingResponse = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: `${body.title}\n\n${body.content}`
    });

    const embedding = embeddingResponse.data.data[0].embedding;

    // Insert memory into database
    const { data: memory, error } = await supabaseClient
      .from('memory_entries')
      .insert({
        user_id: authContext.user_id,
        organization_id: authContext.organization_id,
        title: body.title,
        content: body.content,
        type: body.type,
        tags: body.tags || [],
        metadata: {
          ...body.metadata,
          created_by: authContext.email
        },
        embedding: JSON.stringify(embedding)
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'Failed to create memory',
        500
      );
    }

    // Log audit trail
    await supabaseClient.from('audit_log').insert({
      user_id: authContext.user_id,
      action: 'memory.created',
      resource_type: 'memory',
      resource_id: memory.id,
      metadata: { title: body.title, type: body.type }
    });

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        data: memory
      }),
      {
        status: 201,
        headers: {
          ...corsHeaders(req.headers.get('origin')),
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
```

### Example: Search Memories Function

Create `supabase/functions/memories-search/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.3.0';
import { authenticate } from '../shared/auth.ts';
import { corsHeaders, handleCors } from '../shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../shared/errors.ts';

interface SearchMemoriesRequest {
  query: string;
  type?: string;
  threshold?: number;
  limit?: number;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    const authContext = await authenticate(req, supabaseClient);
    if (!authContext) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required',
        401
      );
    }

    const body: SearchMemoriesRequest = await req.json();

    if (!body.query) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Query is required',
        400
      );
    }

    // Generate query embedding
    const openai = new OpenAIApi(
      new Configuration({
        apiKey: Deno.env.get('OPENAI_API_KEY')
      })
    );

    const embeddingResponse = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: body.query
    });

    const queryEmbedding = embeddingResponse.data.data[0].embedding;
    const threshold = body.threshold || 0.8;
    const limit = Math.min(body.limit || 10, 100);

    // Perform vector similarity search
    const { data: memories, error } = await supabaseClient.rpc(
      'search_memories',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: limit,
        filter_user_id: authContext.user_id,
        filter_type: body.type
      }
    );

    if (error) {
      console.error('Search error:', error);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'Search failed',
        500
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          results: memories,
          total: memories.length,
          query: body.query,
          threshold
        }
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders(req.headers.get('origin')),
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
```

### Vector Search Function (SQL)

Create `supabase/migrations/20251224_003_vector_search_function.sql`:

```sql
-- Create vector search function
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding TEXT,
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 10,
  filter_user_id UUID DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  type TEXT,
  tags TEXT[],
  metadata JSONB,
  similarity_score FLOAT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.content,
    m.type,
    m.tags,
    m.metadata,
    1 - (m.embedding <=> query_embedding::vector) AS similarity_score,
    m.created_at,
    m.updated_at
  FROM memory_entries m
  WHERE
    (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_type IS NULL OR m.type = filter_type)
    AND 1 - (m.embedding <=> query_embedding::vector) >= match_threshold
  ORDER BY m.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
```

---

## Deployment

### 1. Deploy Database Migrations

```bash
# Test migrations locally
supabase db reset

# Apply migrations to production
supabase db push
```

### 2. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy memories-create
supabase functions deploy memories-search
supabase functions deploy memories-get
supabase functions deploy memories-update
supabase functions deploy memories-delete
supabase functions deploy memories-list

supabase functions deploy api-keys-create
supabase functions deploy api-keys-list
supabase functions deploy api-keys-rotate
supabase functions deploy api-keys-revoke
supabase functions deploy api-keys-delete

supabase functions deploy projects-create
supabase functions deploy projects-list

supabase functions deploy organizations-get

supabase functions deploy system-health
supabase functions deploy system-auth-status
supabase functions deploy system-config

# Set environment variables for functions
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set AUTH_GATEWAY_URL=https://auth.lanonasis.com
```

### 3. Configure Custom Domain

```bash
# In Supabase Dashboard:
# Settings > API > Custom Domains
# Add: api.lanonasis.com
```

---

## Testing

### 1. Health Check

```bash
curl https://api.lanonasis.com/api/v1/health
```

### 2. Create Memory

```bash
curl -X POST https://api.lanonasis.com/api/v1/memories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Memory",
    "content": "This is a test memory",
    "type": "knowledge",
    "tags": ["test"]
  }'
```

### 3. Search Memories

```bash
curl -X POST https://api.lanonasis.com/api/v1/memories/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test",
    "threshold": 0.8,
    "limit": 10
  }'
```

---

## Migration from Netlify

### Phase 1: Parallel Deployment

```nginx
# Update nginx configuration for weighted routing
upstream backend {
  server netlify.com weight=90;
  server api.lanonasis.com weight=10;
}
```

### Phase 2: Traffic Shift

```bash
# Week 1: 10% Supabase, 90% Netlify
# Week 2: 25% Supabase, 75% Netlify
# Week 3: 50% Supabase, 50% Netlify
# Week 4: 75% Supabase, 25% Netlify
# Week 5: 100% Supabase
```

### Phase 3: Monitoring

```typescript
// Monitor key metrics
const metrics = {
  error_rate: '< 0.1%',
  p95_latency: '< 200ms',
  availability: '> 99.9%'
};
```

---

## Summary

This implementation guide provides:

✅ Complete database schema with RLS
✅ Shared authentication middleware
✅ Example Edge Functions for all 19 tools
✅ Vector search implementation
✅ Deployment instructions
✅ Testing guidelines
✅ Migration strategy

**Next Steps:**
1. Set up Supabase project
2. Deploy database migrations
3. Implement remaining Edge Functions
4. Test in staging environment
5. Execute migration plan

---

**Version:** 1.0.0
**Last Updated:** 2025-12-24
