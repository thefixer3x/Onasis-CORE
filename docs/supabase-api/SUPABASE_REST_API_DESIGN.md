# Supabase REST API Design for MCP Server (19 Tools)

**Version:** 1.0.0
**Date:** 2025-12-24
**Status:** Design Phase

## Executive Summary

This document outlines the complete REST API design for the Lanonasis MCP Server using Supabase as the primary backend platform. The design eliminates Netlify Functions dependency, reduces failure points, and provides consistent API patterns across the MCP server, SDK, and REST API.

### Key Objectives

1. ✅ **Eliminate Netlify Functions** - Replace with Supabase Edge Functions
2. ✅ **Consistent API Pattern** - All endpoints follow `/api/v1/**` structure
3. ✅ **Reduce Failure Points** - Centralized authentication and routing through Supabase
4. ✅ **Unified Experience** - Seamless integration between MCP, SDK, and REST API
5. ✅ **Production-Ready** - OAuth2 PKCE, API Keys, rate limiting, and monitoring

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                           │
├─────────────────────────────────────────────────────────────────────┤
│  VSCode Extension │ CLI Tools │ Web Dashboard │ Mobile Apps │ SDK   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   API Gateway Layer     │
                    │   (Supabase Edge)       │
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼────────┐    ┌─────────▼──────────┐    ┌───────▼────────┐
│ Authentication │    │   Tool Execution   │    │  Data Access   │
│  - OAuth2 PKCE │    │   - 19 MCP Tools   │    │  - PostgreSQL  │
│  - API Keys    │    │   - Validation     │    │  - pgvector    │
│  - JWT Tokens  │    │   - Rate Limiting  │    │  - Edge Cache  │
└────────────────┘    └────────────────────┘    └────────────────┘
```

---

## API Endpoint Structure

### Base URLs

- **Production:** `https://api.lanonasis.com/api/v1`
- **Staging:** `https://staging-api.lanonasis.com/api/v1`
- **Development:** `http://localhost:54321/functions/v1` (Supabase Local)

### API Categories

All 19 tools are organized into logical categories:

#### 1. Memory Management (7 tools)
#### 2. API Key Management (5 tools)
#### 3. Project & Organization (3 tools)
#### 4. System & Configuration (4 tools)

---

## Complete API Specification

### Category 1: Memory Management

#### 1.1 Create Memory
**Endpoint:** `POST /api/v1/memories`
**MCP Tool:** `create_memory`

**Request:**
```json
{
  "title": "Project Architecture Notes",
  "content": "The system uses a microservices architecture...",
  "type": "project",
  "tags": ["architecture", "design", "backend"],
  "metadata": {
    "priority": "high",
    "project_id": "proj_123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Project Architecture Notes",
    "content": "The system uses a microservices architecture...",
    "type": "project",
    "tags": ["architecture", "design", "backend"],
    "metadata": {
      "priority": "high",
      "project_id": "proj_123",
      "user_id": "usr_xyz",
      "organization_id": "org_456"
    },
    "embedding": [0.123, 0.456, ...],
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 1.2 Search Memories
**Endpoint:** `POST /api/v1/memories/search`
**MCP Tool:** `search_memories`

**Request:**
```json
{
  "query": "How does authentication work?",
  "type": "knowledge",
  "threshold": 0.8,
  "limit": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "mem_abc123",
        "title": "Authentication Flow",
        "content": "OAuth2 PKCE implementation...",
        "similarity_score": 0.95,
        "type": "knowledge",
        "tags": ["auth", "security"],
        "created_at": "2025-12-20T10:00:00Z"
      }
    ],
    "total": 1,
    "query": "How does authentication work?",
    "threshold": 0.8
  }
}
```

---

#### 1.3 Get Memory
**Endpoint:** `GET /api/v1/memories/{id}`
**MCP Tool:** `get_memory`

**Request:**
```
GET /api/v1/memories/mem_abc123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Project Architecture Notes",
    "content": "The system uses a microservices architecture...",
    "type": "project",
    "tags": ["architecture", "design", "backend"],
    "metadata": {
      "priority": "high",
      "project_id": "proj_123"
    },
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 1.4 Update Memory
**Endpoint:** `PUT /api/v1/memories/{id}`
**MCP Tool:** `update_memory`

**Request:**
```json
{
  "title": "Updated Architecture Notes",
  "content": "The system now uses event-driven architecture...",
  "tags": ["architecture", "design", "backend", "events"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Updated Architecture Notes",
    "content": "The system now uses event-driven architecture...",
    "type": "project",
    "tags": ["architecture", "design", "backend", "events"],
    "updated_at": "2025-12-24T11:00:00Z"
  }
}
```

---

#### 1.5 Delete Memory
**Endpoint:** `DELETE /api/v1/memories/{id}`
**MCP Tool:** `delete_memory`

**Request:**
```
DELETE /api/v1/memories/mem_abc123
```

**Response:**
```json
{
  "success": true,
  "message": "Memory deleted successfully",
  "data": {
    "id": "mem_abc123",
    "deleted_at": "2025-12-24T12:00:00Z"
  }
}
```

---

#### 1.6 List Memories
**Endpoint:** `GET /api/v1/memories`
**MCP Tool:** `list_memories`

**Request:**
```
GET /api/v1/memories?limit=20&offset=0&type=project&sortBy=updated_at&sortOrder=desc&tags=architecture,design
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "mem_abc123",
      "title": "Project Architecture Notes",
      "content": "The system uses a microservices architecture...",
      "type": "project",
      "tags": ["architecture", "design", "backend"],
      "created_at": "2025-12-24T10:00:00Z",
      "updated_at": "2025-12-24T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

---

#### 1.7 Search Documentation
**Endpoint:** `POST /api/v1/docs/search`
**MCP Tool:** `search_lanonasis_docs`

**Request:**
```json
{
  "query": "How to implement OAuth2 PKCE",
  "section": "guides",
  "limit": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "OAuth2 PKCE Implementation Guide",
        "section": "guides",
        "path": "/guides/auth/oauth2-pkce",
        "excerpt": "This guide covers implementing OAuth2 PKCE flow...",
        "relevance_score": 0.92
      }
    ],
    "total": 5,
    "query": "How to implement OAuth2 PKCE"
  }
}
```

---

### Category 2: API Key Management

#### 2.1 Create API Key
**Endpoint:** `POST /api/v1/auth/api-keys`
**MCP Tool:** `create_api_key`

**Request:**
```json
{
  "name": "Production API Key",
  "description": "Key for production deployment",
  "access_level": "authenticated",
  "expires_in_days": 365,
  "project_id": "proj_123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key_abc123",
    "name": "Production API Key",
    "key": "lms_live_abc123def456ghi789jkl012",
    "access_level": "authenticated",
    "created_at": "2025-12-24T10:00:00Z",
    "expires_at": "2026-12-24T10:00:00Z",
    "warning": "Save this key securely. It will not be shown again."
  }
}
```

---

#### 2.2 List API Keys
**Endpoint:** `GET /api/v1/auth/api-keys`
**MCP Tool:** `list_api_keys`

**Request:**
```
GET /api/v1/auth/api-keys?active_only=true&project_id=proj_123
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "key_abc123",
      "name": "Production API Key",
      "key_prefix": "lms_live_abc***",
      "access_level": "authenticated",
      "is_active": true,
      "last_used_at": "2025-12-24T09:00:00Z",
      "created_at": "2025-12-24T10:00:00Z",
      "expires_at": "2026-12-24T10:00:00Z"
    }
  ],
  "total": 3
}
```

---

#### 2.3 Rotate API Key
**Endpoint:** `POST /api/v1/auth/api-keys/{key_id}/rotate`
**MCP Tool:** `rotate_api_key`

**Request:**
```
POST /api/v1/auth/api-keys/key_abc123/rotate
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key_abc123",
    "name": "Production API Key",
    "key": "lms_live_new123key456xyz789abc",
    "old_key_expires_at": "2025-12-25T10:00:00Z",
    "rotated_at": "2025-12-24T10:00:00Z",
    "warning": "Old key will be valid for 24 hours. Update your applications."
  }
}
```

---

#### 2.4 Revoke API Key
**Endpoint:** `POST /api/v1/auth/api-keys/{key_id}/revoke`
**MCP Tool:** `revoke_api_key`

**Request:**
```
POST /api/v1/auth/api-keys/key_abc123/revoke
```

**Response:**
```json
{
  "success": true,
  "message": "API key revoked successfully",
  "data": {
    "id": "key_abc123",
    "is_active": false,
    "revoked_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 2.5 Delete API Key
**Endpoint:** `DELETE /api/v1/auth/api-keys/{key_id}`
**MCP Tool:** `delete_api_key`

**Request:**
```
DELETE /api/v1/auth/api-keys/key_abc123
```

**Response:**
```json
{
  "success": true,
  "message": "API key deleted permanently",
  "data": {
    "id": "key_abc123",
    "deleted_at": "2025-12-24T10:00:00Z"
  }
}
```

---

### Category 3: Project & Organization Management

#### 3.1 Get Organization Info
**Endpoint:** `GET /api/v1/organizations/{org_id}`
**MCP Tool:** `get_organization_info`

**Request:**
```
GET /api/v1/organizations/org_456
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "org_456",
    "name": "Acme Corporation",
    "plan": "enterprise",
    "settings": {
      "max_users": 100,
      "features": ["vector_search", "api_keys", "sso"]
    },
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 3.2 Create Project
**Endpoint:** `POST /api/v1/projects`
**MCP Tool:** `create_project`

**Request:**
```json
{
  "name": "Mobile App Backend",
  "description": "Backend services for mobile application",
  "organization_id": "org_456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "proj_789",
    "name": "Mobile App Backend",
    "description": "Backend services for mobile application",
    "organization_id": "org_456",
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 3.3 List Projects
**Endpoint:** `GET /api/v1/projects`
**MCP Tool:** `list_projects`

**Request:**
```
GET /api/v1/projects?organization_id=org_456
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj_789",
      "name": "Mobile App Backend",
      "description": "Backend services for mobile application",
      "organization_id": "org_456",
      "created_at": "2025-12-24T10:00:00Z"
    }
  ],
  "total": 3
}
```

---

### Category 4: System & Configuration

#### 4.1 Get Health Status
**Endpoint:** `GET /api/v1/health`
**MCP Tool:** `get_health_status`

**Request:**
```
GET /api/v1/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": {
      "database": "connected",
      "cache": "connected",
      "mcp": "running"
    },
    "uptime": "5d 12h 34m",
    "version": "1.0.0",
    "timestamp": "2025-12-24T10:00:00Z",
    "memory_usage": {
      "used": 134217728,
      "total": 268435456,
      "percentage": 50
    }
  }
}
```

---

#### 4.2 Get Auth Status
**Endpoint:** `GET /api/v1/auth/status`
**MCP Tool:** `get_auth_status`

**Request:**
```
GET /api/v1/auth/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user_id": "usr_xyz",
    "organization_id": "org_456",
    "access_level": "authenticated",
    "token_expires_at": "2025-12-25T10:00:00Z",
    "scopes": ["mcp:full", "memories:read", "memories:write"],
    "session_info": {
      "created_at": "2025-12-24T09:00:00Z",
      "last_activity": "2025-12-24T10:00:00Z"
    }
  }
}
```

---

#### 4.3 Get Configuration
**Endpoint:** `GET /api/v1/config`
**MCP Tool:** `get_config`

**Request:**
```
GET /api/v1/config?key=search_threshold
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "search_threshold",
    "value": "0.8",
    "type": "number",
    "description": "Similarity threshold for vector search",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

#### 4.4 Set Configuration
**Endpoint:** `PUT /api/v1/config`
**MCP Tool:** `set_config`

**Request:**
```json
{
  "key": "search_threshold",
  "value": "0.85"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "search_threshold",
    "value": "0.85",
    "type": "number",
    "previous_value": "0.8",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

## Authentication Strategy

### Supported Methods

#### 1. OAuth2 PKCE (Primary)
```
Authorization: Bearer <access_token>
```

**Flow:**
1. Client initiates PKCE flow
2. User authenticates via browser at `https://auth.lanonasis.com/oauth/authorize`
3. Client receives authorization code
4. Client exchanges code for access token at `https://auth.lanonasis.com/oauth/token`
5. Client includes access token in API requests

---

#### 2. API Key (Fallback)
```
X-API-Key: lms_live_abc123def456ghi789jkl012
```

**Usage:**
- Server-to-server integrations
- CLI tools
- Long-running services

---

#### 3. JWT Token (Legacy)
```
Authorization: Bearer <jwt_token>
```

**Usage:**
- Backward compatibility
- Internal services
- Development/testing

---

## Supabase Implementation Architecture

### Edge Functions Structure

```
supabase/
├── functions/
│   ├── memories/
│   │   ├── create.ts          # POST /api/v1/memories
│   │   ├── search.ts          # POST /api/v1/memories/search
│   │   ├── get.ts             # GET /api/v1/memories/{id}
│   │   ├── update.ts          # PUT /api/v1/memories/{id}
│   │   ├── delete.ts          # DELETE /api/v1/memories/{id}
│   │   └── list.ts            # GET /api/v1/memories
│   │
│   ├── api-keys/
│   │   ├── create.ts          # POST /api/v1/auth/api-keys
│   │   ├── list.ts            # GET /api/v1/auth/api-keys
│   │   ├── rotate.ts          # POST /api/v1/auth/api-keys/{id}/rotate
│   │   ├── revoke.ts          # POST /api/v1/auth/api-keys/{id}/revoke
│   │   └── delete.ts          # DELETE /api/v1/auth/api-keys/{id}
│   │
│   ├── projects/
│   │   ├── create.ts          # POST /api/v1/projects
│   │   └── list.ts            # GET /api/v1/projects
│   │
│   ├── organizations/
│   │   └── get.ts             # GET /api/v1/organizations/{id}
│   │
│   ├── system/
│   │   ├── health.ts          # GET /api/v1/health
│   │   ├── auth-status.ts     # GET /api/v1/auth/status
│   │   └── config.ts          # GET/PUT /api/v1/config
│   │
│   └── shared/
│       ├── auth.ts            # Authentication middleware
│       ├── cors.ts            # CORS configuration
│       ├── rate-limit.ts      # Rate limiting
│       └── validation.ts      # Request validation
│
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_api_keys_table.sql
│   ├── 003_projects_table.sql
│   └── 004_vector_search.sql
│
└── config.toml                # Supabase configuration
```

---

### Database Schema (PostgreSQL + pgvector)

```sql
-- Users Table (Supabase Auth integration)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations Table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys Table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  access_level TEXT DEFAULT 'authenticated',
  is_active BOOLEAN DEFAULT true,
  project_id UUID REFERENCES projects(id),
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

-- Memory Entries Table (with vector search)
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536),  -- OpenAI ada-002 embedding size
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector search index
CREATE INDEX memory_entries_embedding_idx
ON memory_entries
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Configuration Table
CREATE TABLE configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
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
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY users_policy ON users
  FOR ALL
  USING (auth.uid() = id);

-- Users can access their organization's data
CREATE POLICY organizations_policy ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- API Keys policies
CREATE POLICY api_keys_policy ON api_keys
  FOR ALL
  USING (user_id = auth.uid());

-- Projects policies
CREATE POLICY projects_policy ON projects
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Memory entries policies
CREATE POLICY memory_entries_policy ON memory_entries
  FOR ALL
  USING (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Configurations policies
CREATE POLICY configurations_policy ON configurations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

---

## Rate Limiting Strategy

### Tiered Rate Limits

```typescript
// supabase/functions/shared/rate-limit.ts

const RATE_LIMITS = {
  free: {
    requests_per_minute: 10,
    requests_per_hour: 100,
    requests_per_day: 1000
  },
  authenticated: {
    requests_per_minute: 30,
    requests_per_hour: 500,
    requests_per_day: 5000
  },
  team: {
    requests_per_minute: 60,
    requests_per_hour: 1000,
    requests_per_day: 10000
  },
  enterprise: {
    requests_per_minute: 120,
    requests_per_hour: 5000,
    requests_per_day: 50000
  }
};

// Endpoint-specific limits
const ENDPOINT_LIMITS = {
  '/api/v1/memories/search': {
    requests_per_minute: 20,  // Higher cost operation
    burst: 5
  },
  '/api/v1/auth/api-keys': {
    requests_per_minute: 5,   // Sensitive operation
    burst: 2
  }
};
```

---

## Migration Strategy from Netlify to Supabase

### Phase 1: Preparation (Week 1)

1. ✅ Set up Supabase project
2. ✅ Create database schema with migrations
3. ✅ Implement Edge Functions for all 19 tools
4. ✅ Set up authentication integration
5. ✅ Configure RLS policies
6. ✅ Set up monitoring and logging

### Phase 2: Parallel Deployment (Week 2-3)

1. ✅ Deploy Supabase functions to staging
2. ✅ Configure DNS with weighted routing:
   - 90% traffic → Netlify (existing)
   - 10% traffic → Supabase (new)
3. ✅ Monitor error rates and performance
4. ✅ Gradually increase Supabase traffic

### Phase 3: Migration (Week 4)

1. ✅ Route 50% traffic to Supabase
2. ✅ Validate all 19 tools functionality
3. ✅ Monitor authentication flows
4. ✅ Check database performance

### Phase 4: Cutover (Week 5)

1. ✅ Route 100% traffic to Supabase
2. ✅ Keep Netlify functions as backup (24-48 hours)
3. ✅ Monitor all metrics
4. ✅ Decommission Netlify functions

### Phase 5: Optimization (Week 6+)

1. ✅ Optimize Edge Function performance
2. ✅ Fine-tune RLS policies
3. ✅ Implement caching strategies
4. ✅ Set up auto-scaling

---

## Monitoring & Observability

### Key Metrics

```typescript
// Metrics to track
const METRICS = {
  api: {
    request_count: 'Total API requests',
    response_time_p50: 'Median response time',
    response_time_p95: '95th percentile response time',
    response_time_p99: '99th percentile response time',
    error_rate: 'Percentage of failed requests',
    success_rate: 'Percentage of successful requests'
  },
  auth: {
    auth_attempts: 'Total authentication attempts',
    auth_failures: 'Failed authentication attempts',
    token_refreshes: 'Token refresh operations',
    api_key_usage: 'API key authentication count'
  },
  tools: {
    tool_executions: 'Total tool executions',
    tool_failures: 'Failed tool executions',
    avg_execution_time: 'Average tool execution time'
  },
  database: {
    query_count: 'Total database queries',
    query_time_avg: 'Average query time',
    connection_pool_usage: 'Connection pool utilization',
    vector_search_time: 'Vector search query time'
  }
};
```

### Logging Strategy

```typescript
// Structured logging
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  endpoint: string;
  user_id?: string;
  organization_id?: string;
  duration_ms?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      },
      {
        "field": "content",
        "message": "Content must be at least 10 characters"
      }
    ],
    "request_id": "req_abc123",
    "timestamp": "2025-12-24T10:00:00Z"
  }
}
```

### Error Codes

```typescript
enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}
```

---

## Security Considerations

### 1. Authentication Security
- ✅ OAuth2 PKCE with S256 challenge method
- ✅ API keys use SHA-256 hashing
- ✅ JWT tokens with short expiration (15 minutes)
- ✅ Refresh tokens with rotation
- ✅ Rate limiting on auth endpoints

### 2. Data Security
- ✅ Row Level Security (RLS) on all tables
- ✅ Encrypted connections (TLS 1.3)
- ✅ API key prefix exposure only
- ✅ Audit logging for sensitive operations
- ✅ Input validation and sanitization

### 3. Network Security
- ✅ CORS configuration
- ✅ CSP headers
- ✅ DDoS protection via Supabase
- ✅ IP allowlisting (optional)
- ✅ Request signing (optional)

---

## OpenAPI Specification

See companion file: `SUPABASE_REST_API_OPENAPI.yaml`

---

## Summary

This design provides:

1. ✅ **Complete API coverage** for all 19 MCP tools
2. ✅ **Consistent patterns** across all endpoints (`/api/v1/**`)
3. ✅ **Supabase-native** implementation (Edge Functions + PostgreSQL)
4. ✅ **Production-ready** authentication (OAuth2 + API Keys)
5. ✅ **Scalable architecture** with RLS and rate limiting
6. ✅ **Clear migration path** from Netlify to Supabase
7. ✅ **Comprehensive monitoring** and error handling

### Next Steps

1. Review and approve this design
2. Set up Supabase project
3. Implement Edge Functions
4. Deploy to staging environment
5. Execute migration plan
6. Monitor and optimize

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-24
**Status:** Ready for Review
