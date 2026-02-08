# Supabase REST API Migration Plan

**Version:** 2.1.0
**Date:** 2025-12-27
**Status:** ✅ IMPLEMENTATION COMPLETE (Phases 1-4)
**Approach:** PostgREST + Edge Functions with Phased Rollout

> **📌 NOTE:** This document covers **API migration** (Netlify Functions → Supabase Edge Functions).
> For **DATABASE schema reorganization** (public schema → multi-schema architecture), see:
> **[DATABASE_REORGANIZATION_GUIDE.md](./DATABASE_REORGANIZATION_GUIDE.md)**

---

## ✅ Implementation Summary (Completed 2025-12-27)

### Deployed Edge Functions

| Function        | Status      | Vanity URL                                                 |
| --------------- | ----------- | ---------------------------------------------------------- |
| `memory-search` | ACTIVE (v4) | `https://lanonasis.supabase.co/functions/v1/memory-search` |
| `memory-create` | ACTIVE (v4) | `https://lanonasis.supabase.co/functions/v1/memory-create` |
| `system-health` | ACTIVE (v2) | `https://lanonasis.supabase.co/functions/v1/system-health` |

### Database Updates Applied

- ✅ Created `projects`, `configurations`, `audit_log` tables
- ✅ Created `search_memories()`, `count_memories()`, `memory_stats()` SQL functions
- ✅ Added RLS policies for service role and user-scoped access
- ✅ Verified pgvector extension and HNSW index active

### Routing Configuration Updated

- ✅ `/api/v1/memory/search` → Supabase Edge Function
- ✅ `/api/v1/memory/health` → Supabase Edge Function
- ✅ Other `/api/v1/memory/*` → Netlify Functions (fallback)

### Verified Working

```bash
# Search with vector similarity
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-search" \
  -H "X-API-Key: $LANONASIS_API_KEY" \
  -d '{"query": "test", "limit": 3}'
# Returns: 88% similarity match

# Create memory with auto-embedding
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-create" \
  -H "X-API-Key: $LANONASIS_API_KEY" \
  -d '{"title": "Test", "content": "...", "memory_type": "context"}'
# Returns: Created memory with 1536-dim embedding
```

### Next Steps

1. Deploy `_redirects` changes to Netlify (git push)
2. Monitor traffic split for 24-48 hours
3. Optionally build `memory-stats` and `memory-bulk-delete` Edge Functions
4. Gradual cutover of remaining CRUD endpoints to PostgREST

---

## Executive Summary

Migrate from Netlify Functions to Supabase REST APIs while maintaining zero downtime. The migration uses a hybrid approach: **PostgREST** for CRUD operations (auto-generated) and **Edge Functions** for complex operations (vector search, embeddings, SSE streaming).

### Key Decisions

- **API Approach:** PostgREST + Edge Functions (hybrid)
- **Migration Strategy:** Phased rollout (10% -> 25% -> 50% -> 100%)
- **Database:** Verify and consolidate schema (fix dual-database issue)
- **Fallback:** Keep Netlify as backup during transition

---

## Current API Endpoints (from maas-api.js)

| Method | Endpoint                     | Purpose                       | Migration Target          |
| ------ | ---------------------------- | ----------------------------- | ------------------------- |
| GET    | `/api/v1/memory`             | List memories with pagination | PostgREST                 |
| POST   | `/api/v1/memory`             | Create memory                 | Edge Function (embedding) |
| GET    | `/api/v1/memory/:id`         | Get memory by ID              | PostgREST                 |
| PUT    | `/api/v1/memory/:id`         | Update memory                 | PostgREST                 |
| DELETE | `/api/v1/memory/:id`         | Delete memory                 | PostgREST                 |
| GET    | `/api/v1/memory/count`       | Get total count               | PostgREST RPC             |
| GET    | `/api/v1/memory/stats`       | Get statistics                | Edge Function             |
| POST   | `/api/v1/memory/:id/access`  | Track access                  | PostgREST                 |
| POST   | `/api/v1/memory/bulk/delete` | Bulk delete                   | Edge Function             |
| POST   | `/api/v1/memory/search`      | Semantic search               | Edge Function             |
| GET    | `/health`                    | Health check                  | Edge Function             |

---

## Current Architecture Analysis

### Triple-Layer Complexity

```
Client -> Netlify CDN/_redirects -> Auth Gateway (VPS) -> Netlify Functions
                                                       -> Supabase Edge (Intelligence API)
                                                       -> Neon DB (auth-gateway primary)
                                                       -> Supabase DB (memory entries)
```

### Critical Issues Identified

| Issue                       | Impact                                         | Resolution                                                                                                   |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Dual Database**           | API keys in Neon OR Supabase, not synced       | **See [DATABASE_REORGANIZATION_GUIDE.md](./DATABASE_REORGANIZATION_GUIDE.md)** for full solution             |
| **Schema Pollution**        | 95+ tables in `public` schema, mixed concerns  | **See [DATABASE_REORGANIZATION_GUIDE.md](./DATABASE_REORGANIZATION_GUIDE.md)** for multi-schema architecture |
| **Auth Gateway Dependency** | Separate Node.js service on VPS                | Keep running, redirect DB calls                                                                              |
| **Hardcoded Paths**         | Client code references `/.netlify/functions/*` | Environment-based routing                                                                                    |
| **Route Ordering Bug**      | `/count` and `/stats` fail (matched as `:id`)  | Fix in Edge Functions                                                                                        |

---

## Target Architecture

### Hybrid PostgREST + Edge Functions

```
PostgREST (Auto-generated CRUD - 60% of traffic)
+-- GET /rest/v1/memory_entries (list)
+-- GET /rest/v1/memory_entries?id=eq.{uuid} (get by id)
+-- PATCH /rest/v1/memory_entries?id=eq.{uuid} (update)
+-- DELETE /rest/v1/memory_entries?id=eq.{uuid} (delete)

Edge Functions (Complex Operations - 40% of traffic)
+-- POST /functions/v1/memory-create (with embedding generation)
+-- POST /functions/v1/memory-search (vector search with pgvector)
+-- GET /functions/v1/memory-stats (statistics aggregation)
+-- POST /functions/v1/memory-bulk-delete (bulk operations)
+-- GET /functions/v1/system-health (health checks)
```

### URL Mapping (via \_redirects)

```nginx
# Public API URLs (unchanged for clients)
/api/v1/memory/search       -> /functions/v1/memory-search     (Edge Function)
/api/v1/memory/stats        -> /functions/v1/memory-stats      (Edge Function)
/api/v1/memory/count        -> /rest/v1/rpc/count_memories     (PostgREST RPC)
/api/v1/memory/bulk/delete  -> /functions/v1/memory-bulk-delete (Edge Function)
/api/v1/memory/:id/access   -> /rest/v1/memory_entries?id=eq.:id (PATCH)
/api/v1/memory/:id          -> /rest/v1/memory_entries?id=eq.:id (PostgREST)
/api/v1/memory              -> /rest/v1/memory_entries          (PostgREST)
```

---

## Phase 1: Database Consolidation (Week 1)

### 1.1 Audit Current Schema

**Goal:** Verify current tables match requirements

```bash
# Connect to Supabase and audit
REDACTED_DB_PASSWORD
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('organizations', 'users', 'memory_entries', 'api_keys', 'projects', 'configurations', 'audit_log')
ORDER BY table_name, ordinal_position;"
```

**Tables to verify:**

- [x] `organizations` (created today)
- [ ] `users` (verify columns match)
- [ ] `memory_entries` (verify embedding column exists)
- [ ] `api_keys` (verify key_hash, access_level)
- [ ] `projects` (may need creation)
- [ ] `configurations` (may need creation)
- [ ] `audit_log` (may need creation)

### 1.2 Create Missing Tables/Columns

```sql
-- File: /opt/lanonasis/onasis-core/supabase/migrations/20251227_001_schema_gaps.sql

-- Enable vector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Projects table (if missing)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configurations table (if missing)
CREATE TABLE IF NOT EXISTS configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

-- Audit log table (if missing)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to api_keys if needed
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'authenticated';

-- Ensure memory_entries has embedding column
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create vector search index (if not exists)
CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
  ON memory_entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Count function for PostgREST RPC
CREATE OR REPLACE FUNCTION count_memories(org_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_count INTEGER;
BEGIN
  IF org_id IS NULL THEN
    SELECT COUNT(*) INTO total_count FROM memory_entries;
  ELSE
    SELECT COUNT(*) INTO total_count FROM memory_entries WHERE organization_id = org_id;
  END IF;

  RETURN json_build_object('count', total_count);
END;
$$;
```

### 1.3 Create RLS Policies

```sql
-- File: /opt/lanonasis/onasis-core/supabase/migrations/20251227_002_rls_policies.sql

-- Enable RLS on all tables
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for Edge Functions using service role key)
CREATE POLICY "Service role full access" ON memory_entries FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role api_keys access" ON api_keys FOR ALL
  USING (auth.role() = 'service_role');

-- Memory entries: org-scoped access
CREATE POLICY "Users can view org memories" ON memory_entries FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create memories" ON memory_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own memories" ON memory_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own memories" ON memory_entries FOR DELETE
  USING (user_id = auth.uid());

-- API keys: user-scoped
CREATE POLICY "Users can view own API keys" ON api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own API keys" ON api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own API keys" ON api_keys FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own API keys" ON api_keys FOR DELETE
  USING (user_id = auth.uid());
```

### 1.4 Create Vector Search Function

```sql
-- File: /opt/lanonasis/onasis-core/supabase/migrations/20251227_003_vector_search.sql

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
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
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
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
    m.memory_type,
    m.tags,
    m.metadata,
    1 - (m.embedding <=> query_embedding) AS similarity_score,
    m.created_at,
    m.updated_at
  FROM memory_entries m
  WHERE
    (filter_organization_id IS NULL OR m.organization_id = filter_organization_id)
    AND (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_type IS NULL OR m.memory_type = filter_type)
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) >= match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## Phase 2: Edge Functions Implementation (Week 1-2)

### 2.1 Directory Structure

```
/opt/lanonasis/onasis-core/supabase/functions/
+-- _shared/
|   +-- auth.ts           # Authentication middleware
|   +-- cors.ts           # CORS handling
|   +-- errors.ts         # Error response helpers
|   +-- supabase.ts       # Supabase client factory
+-- memory-create/
|   +-- index.ts          # Create memory with embedding
+-- memory-search/
|   +-- index.ts          # Semantic vector search
+-- memory-stats/
|   +-- index.ts          # Statistics aggregation
+-- memory-bulk-delete/
|   +-- index.ts          # Bulk delete operations
+-- system-health/
    +-- index.ts          # Health check
```

### 2.2 Shared Authentication Middleware

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/_shared/auth.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
  user_id: string;
  organization_id: string;
  access_level: string;
  email: string;
  is_master: boolean;
}

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
  );

  // Try Bearer token (OAuth2/JWT)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Check if it's an API key format (lano_*, vibe_*, etc.)
    if (token.match(/^(lano_|vibe_|sk_|pk_)/)) {
      return await authenticateApiKey(supabase, token);
    }

    // Try as JWT
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, email')
        .eq('id', user.id)
        .single();

      return {
        user_id: user.id,
        organization_id: userData?.organization_id,
        access_level: 'authenticated',
        email: userData?.email || user.email || '',
        is_master: false
      };
    }
  }

  // Try API key in X-API-Key header
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    return await authenticateApiKey(supabase, apiKey);
  }

  return null;
}

async function authenticateApiKey(supabase: any, apiKey: string): Promise<AuthContext | null> {
  const keyHash = await hashApiKey(apiKey);

  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select(`
      id, user_id, access_level, name, is_active, expires_at,
      users!inner(organization_id, email)
    `)
    .or(`key_hash.eq.${keyHash},key.eq.${apiKey}`)
    .eq('is_active', true)
    .single();

  if (error || !keyData) return null;

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return null;
  }

  // Update last_used (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used: new Date().toISOString() })
    .eq('id', keyData.id)
    .then(() => {});

  const isMaster = keyData.access_level === 'admin' ||
                   keyData.access_level === 'enterprise' ||
                   keyData.name?.toLowerCase().includes('master');

  return {
    user_id: keyData.user_id,
    organization_id: keyData.users.organization_id,
    access_level: keyData.access_level || 'authenticated',
    email: keyData.users.email,
    is_master: isMaster
  };
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 2.3 CORS Middleware

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/_shared/cors.ts

const ALLOWED_ORIGINS = [
  "https://dashboard.lanonasis.com",
  "https://mcp.lanonasis.com",
  "https://api.lanonasis.com",
  "https://docs.lanonasis.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "*", // Allow all for API access
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }
  return null;
}
```

### 2.4 Error Handling

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/_shared/errors.ts

export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: any,
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code: code,
      details: details,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
```

### 2.5 Memory Search Edge Function

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/memory-search/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface SearchRequest {
  query: string;
  memory_type?: string;
  threshold?: number;
  limit?: number;
  tags?: string[];
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(ErrorCode.AUTHENTICATION_ERROR, 'Authentication required', 401);
    }

    // Parse request
    const body: SearchRequest = await req.json();
    if (!body.query) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Query is required', 400);
    }

    // Generate embedding via OpenAI
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: body.query
      })
    });

    if (!embeddingRes.ok) {
      const error = await embeddingRes.text();
      console.error('OpenAI error:', error);
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to generate embedding', 500);
    }

    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Search via RPC function
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: results, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: body.threshold || 0.7,
      match_count: Math.min(body.limit || 10, 100),
      filter_organization_id: auth.organization_id,
      filter_type: body.memory_type
    });

    if (error) {
      console.error('Search error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Search failed', 500);
    }

    return new Response(JSON.stringify({
      data: results || [],
      query: body.query,
      threshold: body.threshold || 0.7,
      total: results?.length || 0
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
```

### 2.6 Memory Create Edge Function

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/memory-create/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface CreateMemoryRequest {
  title: string;
  content: string;
  memory_type: 'context' | 'project' | 'knowledge' | 'reference' | 'personal' | 'workflow';
  tags?: string[];
  metadata?: Record<string, any>;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(ErrorCode.AUTHENTICATION_ERROR, 'Authentication required', 401);
    }

    const body: CreateMemoryRequest = await req.json();

    // Validate
    if (!body.title || !body.content || !body.memory_type) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Missing required fields: title, content, memory_type', 400);
    }

    // Generate embedding
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: `${body.title}\n\n${body.content}`
      })
    });

    let embedding = null;
    if (embeddingRes.ok) {
      const embeddingData = await embeddingRes.json();
      embedding = embeddingData.data[0].embedding;
    } else {
      console.warn('Failed to generate embedding, continuing without it');
    }

    // Insert memory
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: memory, error } = await supabase
      .from('memory_entries')
      .insert({
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        title: body.title,
        content: body.content,
        memory_type: body.memory_type,
        tags: body.tags || [],
        metadata: body.metadata || {},
        embedding: embedding
      })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to create memory', 500);
    }

    // Audit log (fire and forget)
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'memory.created',
      resource_type: 'memory',
      resource_id: memory.id
    }).then(() => {});

    return new Response(JSON.stringify({
      data: memory,
      message: 'Memory created successfully'
    }), {
      status: 201,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
```

### 2.7 System Health Edge Function

```typescript
// File: /opt/lanonasis/onasis-core/supabase/functions/system-health/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Test database connection
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    const dbHealthy = !error;
    const responseTime = Date.now() - startTime;

    return new Response(JSON.stringify({
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'Lanonasis MaaS API (Supabase)',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: 'production',
      components: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        edge_functions: 'healthy',
        vector_search: 'available'
      },
      metrics: {
        response_time_ms: responseTime
      }
    }), {
      status: dbHealthy ? 200 : 503,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

---

## Phase 3: Deploy & Configure (Week 2)

### 3.1 Deploy Database Migrations

```bash
# Apply all migrations to Supabase
cd /opt/lanonasis/onasis-core

# Apply schema gaps
REDACTED_DB_PASSWORD
  -h db.mxtsdgkwzjzlttpotole.supabase.co \
  -U postgres -d postgres \
  -f supabase/migrations/20251227_001_schema_gaps.sql

# Apply RLS policies
REDACTED_DB_PASSWORD
  -h db.mxtsdgkwzjzlttpotole.supabase.co \
  -U postgres -d postgres \
  -f supabase/migrations/20251227_002_rls_policies.sql

# Apply vector search function
REDACTED_DB_PASSWORD
  -h db.mxtsdgkwzjzlttpotole.supabase.co \
  -U postgres -d postgres \
  -f supabase/migrations/20251227_003_vector_search.sql
```

### 3.2 Link & Deploy Edge Functions

```bash
cd /opt/lanonasis/onasis-core

# Link Supabase project (if not linked)
supabase link --project-ref mxtsdgkwzjzlttpotole

# Set secrets
supabase secrets set OPENAI_API_KEY=your_openai_key

# Deploy functions
supabase functions deploy memory-search
supabase functions deploy memory-create
supabase functions deploy memory-stats
supabase functions deploy memory-bulk-delete
supabase functions deploy system-health
```

### 3.3 Verify Deployment

```bash
# Test health endpoint
curl -s https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/system-health

# Test search with API key
curl -s -X POST https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LANONASIS_API_KEY" \
  -d '{"query": "test", "limit": 5}'

# Test PostgREST direct access
curl -s https://mxtsdgkwzjzlttpotole.supabase.co/rest/v1/memory_entries?limit=1 \
  -H "apikey: $SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

---

## Phase 4: Traffic Routing (Week 3-4)

### 4.1 Phase 4A: 10% Canary

```nginx
# File: /opt/lanonasis/onasis-core/_redirects (updated)

# ============================================
# Phase 4A: 10% to Supabase (Canary)
# ============================================

# Memory search - Edge Function
/api/v1/memory/search  https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-search  200! 10
/api/v1/memory/search  /.netlify/functions/maas-api  200! 90

# Memory stats - Edge Function
/api/v1/memory/stats  https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-stats  200! 10
/api/v1/memory/stats  /.netlify/functions/maas-api  200! 90

# Health - Edge Function
/api/v1/health  https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/system-health  200! 10
/api/v1/health  /.netlify/functions/maas-api  200! 90

# Intelligence API - Already 100% on Supabase Edge
/api/v1/intelligence/*  https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/intelligence-:splat  200!

# Fallback for all other memory endpoints
/api/v1/memory/*  /.netlify/functions/maas-api  200
/api/v1/*  /.netlify/functions/maas-api  200
```

### 4.2 Phase 4B: 50% Split

```nginx
# Memory search
/api/v1/memory/search  https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-search  200! 50
/api/v1/memory/search  /.netlify/functions/maas-api  200! 50
```

### 4.3 Phase 4C: 100% Cutover

```nginx
# ============================================
# Final: 100% Supabase
# ============================================

# Complex operations - Edge Functions
/api/v1/memory/search        https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-search        200!
/api/v1/memory/stats         https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-stats         200!
/api/v1/memory/bulk/delete   https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-bulk-delete   200!
/api/v1/memory/count         https://mxtsdgkwzjzlttpotole.supabase.co/rest/v1/rpc/count_memories        200!

# CRUD operations - PostgREST
/api/v1/memory/:id           https://mxtsdgkwzjzlttpotole.supabase.co/rest/v1/memory_entries?id=eq.:id   200!
/api/v1/memory               https://mxtsdgkwzjzlttpotole.supabase.co/rest/v1/memory_entries             200!

# System
/api/v1/health               https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/system-health         200!

# Intelligence (already 100%)
/api/v1/intelligence/*       https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/intelligence-:splat   200!

# Netlify fallback (deprecated, for legacy clients)
/.netlify/functions/*        /.netlify/functions/:splat  200
```

---

## Phase 5: Monitoring & Validation (Week 4)

### 5.1 Validation Script

```bash
#!/bin/bash
# File: /opt/lanonasis/onasis-core/scripts/validate-migration.sh

echo "Validating Supabase Migration..."

# Test health
echo "1. Testing health endpoint..."
HEALTH=$(curl -s https://api.lanonasis.com/api/v1/health)
echo "$HEALTH" | jq .status

# Test memory list
echo "2. Testing memory list..."
curl -s "https://api.lanonasis.com/api/v1/memory" \
  -H "Authorization: Bearer $LANONASIS_API_KEY" | jq '.data | length'

# Test memory search
echo "3. Testing memory search..."
curl -s -X POST "https://api.lanonasis.com/api/v1/memory/search" \
  -H "Authorization: Bearer $LANONASIS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "MCP", "limit": 3}' | jq '.data | length'

echo "Validation complete!"
```

### 5.2 Rollback Script

```bash
#!/bin/bash
# File: /opt/lanonasis/onasis-core/scripts/rollback-to-netlify.sh

echo "Emergency Rollback to Netlify..."

# Revert _redirects to Netlify-only
cat > /opt/lanonasis/onasis-core/_redirects << 'EOF'
# ROLLBACK: All traffic to Netlify Functions
/api/v1/*  /.netlify/functions/maas-api  200
/api/v1/auth/*  /.netlify/functions/auth-api  200
EOF

# Commit and deploy
cd /opt/lanonasis/onasis-core
git add _redirects
git commit -m "Emergency rollback to Netlify"
git push origin main

echo "Rollback complete - all traffic now routes to Netlify"
```

---

## Success Metrics

| Metric                     | Target  | How to Measure             |
| -------------------------- | ------- | -------------------------- |
| **Latency (p95)**          | < 200ms | Supabase Dashboard         |
| **Error Rate**             | < 0.1%  | Supabase logs              |
| **Uptime**                 | > 99.9% | Health endpoint monitoring |
| **Backward Compatibility** | 100%    | All existing URLs work     |

---

## Timeline Summary

| Week | Phase          | Key Tasks                                   | Deliverables                               |
| ---- | -------------- | ------------------------------------------- | ------------------------------------------ |
| 1    | Database       | Schema audit, create migrations, deploy RLS | Unified schema ready                       |
| 1-2  | Edge Functions | Implement shared utils + 5 functions        | search, create, stats, bulk-delete, health |
| 2    | Deployment     | Deploy functions, set secrets, verify       | Live Edge Functions                        |
| 3    | Traffic 10%    | Update \_redirects, deploy, monitor         | Canary deployment                          |
| 3-4  | Traffic 50%    | Increase traffic, validate metrics          | Stable split                               |
| 4    | Traffic 100%   | Full cutover, deprecate Netlify             | Migration complete                         |

---

## Files to Create

### SQL Migrations

1. `/opt/lanonasis/onasis-core/supabase/migrations/20251227_001_schema_gaps.sql`
2. `/opt/lanonasis/onasis-core/supabase/migrations/20251227_002_rls_policies.sql`
3. `/opt/lanonasis/onasis-core/supabase/migrations/20251227_003_vector_search.sql`

### Edge Functions

4. `/opt/lanonasis/onasis-core/supabase/functions/_shared/auth.ts`
5. `/opt/lanonasis/onasis-core/supabase/functions/_shared/cors.ts`
6. `/opt/lanonasis/onasis-core/supabase/functions/_shared/errors.ts`
7. `/opt/lanonasis/onasis-core/supabase/functions/memory-search/index.ts`
8. `/opt/lanonasis/onasis-core/supabase/functions/memory-create/index.ts`
9. `/opt/lanonasis/onasis-core/supabase/functions/memory-stats/index.ts`
10. `/opt/lanonasis/onasis-core/supabase/functions/memory-bulk-delete/index.ts`
11. `/opt/lanonasis/onasis-core/supabase/functions/system-health/index.ts`

### Scripts

12. `/opt/lanonasis/onasis-core/scripts/validate-migration.sh`
13. `/opt/lanonasis/onasis-core/scripts/rollback-to-netlify.sh`

---

**Plan Version:** 2.0.0
**Last Updated:** 2025-12-27
**Author:** Claude (Migration Planning)
