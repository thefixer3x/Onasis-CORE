# Revised Supabase REST API Design - Matching Actual Schema

**Version:** 2.0.0 (Revised)
**Date:** 2025-12-24
**Status:** Based on Actual Database Structure

## Important Changes from v1.0

🔄 **This design has been revised to match the ACTUAL database schema:**

1. ✅ Using `memory_entries` table (not `memory` or `maas.memories`)
2. ✅ Chunking handled in-memory by MemoryService (no `memory_chunks` table)
3. ✅ Tags stored as `TEXT[]` array (no separate `tags` table)
4. ✅ Memory intelligence in `metadata` JSONB (no `memory_intelligence` table)
5. ✅ Single `api_keys` table for user keys
6. ✅ Added `memory_topics` support
7. ✅ Added analytics endpoints (`memory_search_analytics`, `memory_access_patterns`)
8. ✅ Multi-tenant with organizations and projects

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Complete API Endpoint Mapping](#complete-api-endpoint-mapping)
3. [Memory Management APIs](#memory-management-apis)
4. [Analytics APIs](#analytics-apis)
5. [Topics APIs](#topics-apis)
6. [Enhanced Schemas](#enhanced-schemas)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│  (VSCode, CLI, Web, Mobile, SDK)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │   Supabase Edge         │
            │   Functions             │
            │   (/api/v1/**)          │
            └────────────┬────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼───────┐ ┌─────▼────┐ ┌────────▼─────────┐
│ Authentication│ │PostgreSQL│ │  Content Service │
│  - OAuth2     │ │  + RLS   │ │  - Chunking      │
│  - API Keys   │ │  +pgvector│ │  - Intelligence  │
│  - JWT        │ │          │ │  - Validation    │
└───────────────┘ └──────────┘ └──────────────────┘
```

**Key Components:**
- **Supabase Edge Functions**: Serverless API endpoints
- **PostgreSQL + RLS**: Data storage with row-level security
- **pgvector**: Vector similarity search
- **MemoryService**: In-memory content preprocessing (TypeScript)
- **Multi-tenancy**: Organizations → Projects → Memories

---

## Complete API Endpoint Mapping

### Memory Management (7 endpoints)

| Endpoint | Method | MCP Tool | Description |
|----------|--------|----------|-------------|
| `/api/v1/memories` | POST | `create_memory` | Create memory with preprocessing |
| `/api/v1/memories/search` | POST | `search_memories` | Semantic vector search |
| `/api/v1/memories/{id}` | GET | `get_memory` | Get specific memory |
| `/api/v1/memories/{id}` | PUT | `update_memory` | Update memory |
| `/api/v1/memories/{id}` | DELETE | `delete_memory` | Delete memory |
| `/api/v1/memories` | GET | `list_memories` | List with filters |
| `/api/v1/docs/search` | POST | `search_lanonasis_docs` | Search docs |

### Topics Management (3 endpoints) 🆕

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/topics` | POST | Create topic |
| `/api/v1/topics` | GET | List topics |
| `/api/v1/topics/{id}` | GET | Get topic with memories |

### Analytics (3 endpoints) 🆕

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/analytics/search` | GET | Search analytics |
| `/api/v1/analytics/access` | GET | Access patterns |
| `/api/v1/analytics/stats` | GET | Memory statistics |

### API Keys (5 endpoints)

| Endpoint | Method | MCP Tool | Description |
|----------|--------|----------|-------------|
| `/api/v1/auth/api-keys` | POST | `create_api_key` | Create API key |
| `/api/v1/auth/api-keys` | GET | `list_api_keys` | List API keys |
| `/api/v1/auth/api-keys/{id}/rotate` | POST | `rotate_api_key` | Rotate key |
| `/api/v1/auth/api-keys/{id}/revoke` | POST | `revoke_api_key` | Revoke key |
| `/api/v1/auth/api-keys/{id}` | DELETE | `delete_api_key` | Delete key |

### Projects & Organizations (3 endpoints)

| Endpoint | Method | MCP Tool | Description |
|----------|--------|----------|-------------|
| `/api/v1/projects` | POST | `create_project` | Create project |
| `/api/v1/projects` | GET | `list_projects` | List projects |
| `/api/v1/organizations/{id}` | GET | `get_organization_info` | Get org info |

### System & Configuration (4 endpoints)

| Endpoint | Method | MCP Tool | Description |
|----------|--------|----------|-------------|
| `/api/v1/health` | GET | `get_health_status` | System health |
| `/api/v1/auth/status` | GET | `get_auth_status` | Auth status |
| `/api/v1/config` | GET | `get_config` | Get config |
| `/api/v1/config` | PUT | `set_config` | Set config |

**Total: 25 endpoints** (19 MCP tools + 6 additional features)

---

## Memory Management APIs

### 1. Create Memory (with Content Preprocessing)

**Endpoint:** `POST /api/v1/memories`
**MCP Tool:** `create_memory`

**Request:**
```json
{
  "title": "Authentication System Architecture",
  "content": "The authentication system uses OAuth2 PKCE for secure authentication...",
  "type": "knowledge",
  "tags": ["auth", "oauth2", "security"],
  "project_id": "proj_abc123",
  "topic_id": "topic_xyz789",
  "metadata": {
    "source": "documentation",
    "priority": "high"
  },
  "preprocessing": {
    "chunking": {
      "strategy": "semantic",
      "maxChunkSize": 1000,
      "overlap": 100
    },
    "cleanContent": true,
    "extractMetadata": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Authentication System Architecture",
    "content": "The authentication system uses OAuth2 PKCE...",
    "type": "knowledge",
    "tags": ["auth", "oauth2", "security"],
    "project_id": "proj_abc123",
    "topic_id": "topic_xyz789",
    "user_id": "usr_xyz",
    "organization_id": "org_456",
    "is_archived": false,
    "metadata": {
      "source": "documentation",
      "priority": "high",
      "chunks": [
        {
          "index": 0,
          "content": "The authentication system...",
          "startChar": 0,
          "endChar": 998,
          "tokens": 245
        },
        {
          "index": 1,
          "content": "...uses OAuth2 PKCE for...",
          "startChar": 898,
          "endChar": 1895,
          "tokens": 242
        }
      ],
      "total_chunks": 2,
      "chunking_strategy": "semantic",
      "content_type": "text",
      "intelligence": {
        "entities": ["OAuth2", "PKCE"],
        "keywords": ["authentication", "security", "oauth2"],
        "language": "english",
        "complexity": "medium"
      }
    },
    "embedding": [0.123, 0.456, ...],  // 1536 dimensions
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

**Database Operation:**
```sql
INSERT INTO memory_entries (
    title, content, type, tags, metadata, embedding,
    user_id, project_id, organization_id, topic_id
) VALUES (
    $1, $2, $3, $4::text[], $5::jsonb, $6::vector,
    $7, $8, $9, $10
) RETURNING *;
```

---

### 2. Search Memories (Vector + Text)

**Endpoint:** `POST /api/v1/memories/search`
**MCP Tool:** `search_memories`

**Request:**
```json
{
  "query": "How does authentication work?",
  "type": "knowledge",
  "threshold": 0.8,
  "limit": 10,
  "search_mode": "hybrid",  // "vector" | "text" | "hybrid"
  "filters": {
    "tags": ["auth", "security"],
    "project_id": "proj_abc123",
    "date_range": {
      "from": "2025-01-01",
      "to": "2025-12-31"
    }
  }
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
        "title": "Authentication System Architecture",
        "content": "The authentication system uses OAuth2 PKCE...",
        "type": "knowledge",
        "tags": ["auth", "oauth2", "security"],
        "similarity_score": 0.95,  // Vector similarity
        "text_rank": 1,             // Text search rank
        "combined_score": 0.97,     // Hybrid score
        "metadata": {
          "chunks": [...],
          "intelligence": {...}
        },
        "matching_chunks": [        // Chunks that matched query
          {
            "index": 0,
            "content": "...OAuth2 PKCE for secure authentication...",
            "similarity": 0.93
          }
        ],
        "created_at": "2025-12-24T10:00:00Z"
      }
    ],
    "total": 5,
    "query": "How does authentication work?",
    "search_mode": "hybrid",
    "threshold": 0.8,
    "execution_time_ms": 45
  }
}
```

**Database Operation:**
```sql
-- Hybrid search combining vector and text
SELECT
    m.*,
    1 - (m.embedding <=> $1::vector) as similarity_score,
    ts_rank_cd(to_tsvector('english', m.title || ' ' || m.content),
               plainto_tsquery('english', $2)) as text_rank,
    (
        (1 - (m.embedding <=> $1::vector)) * 0.7 +
        ts_rank_cd(to_tsvector('english', m.title || ' ' || m.content),
                   plainto_tsquery('english', $2)) * 0.3
    ) as combined_score
FROM memory_entries m
WHERE
    m.user_id = $3
    AND m.type = $4
    AND (
        1 - (m.embedding <=> $1::vector) > $5  -- Vector threshold
        OR to_tsvector('english', m.title || ' ' || m.content) @@ plainto_tsquery('english', $2)
    )
ORDER BY combined_score DESC
LIMIT $6;
```

---

### 3. Get Memory with Chunks

**Endpoint:** `GET /api/v1/memories/{id}?include_chunks=true`
**MCP Tool:** `get_memory`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Authentication System Architecture",
    "content": "Full content...",
    "type": "knowledge",
    "tags": ["auth", "oauth2", "security"],
    "metadata": {
      "chunks": [
        {
          "index": 0,
          "content": "Chunk 1 content...",
          "startChar": 0,
          "endChar": 998,
          "tokens": 245,
          "metadata": {
            "type": "paragraph",
            "isComplete": true
          }
        }
      ],
      "total_chunks": 5,
      "chunking_strategy": "semantic",
      "intelligence": {
        "entities": ["OAuth2", "PKCE", "JWT"],
        "keywords": ["authentication", "security"],
        "topics": ["backend", "security"]
      }
    },
    "project": {
      "id": "proj_abc123",
      "name": "Backend Services",
      "status": "active"
    },
    "topic": {
      "id": "topic_xyz789",
      "name": "Authentication",
      "parent": "Security"
    },
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

### 4. Update Memory (with Re-chunking)

**Endpoint:** `PUT /api/v1/memories/{id}`
**MCP Tool:** `update_memory`

**Request:**
```json
{
  "content": "Updated content with new information...",
  "tags": ["auth", "oauth2", "pkce", "jwt"],
  "rechunk": true,  // Trigger re-chunking
  "regenerate_embedding": true  // Generate new embedding
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "mem_abc123",
    "title": "Authentication System Architecture",
    "content": "Updated content...",
    "tags": ["auth", "oauth2", "pkce", "jwt"],
    "metadata": {
      "chunks": [...],  // New chunks generated
      "total_chunks": 3,  // Changed from 5
      "chunking_strategy": "semantic",
      "last_rechunked_at": "2025-12-24T11:00:00Z"
    },
    "embedding": [0.234, 0.567, ...],  // New embedding
    "updated_at": "2025-12-24T11:00:00Z"
  }
}
```

---

### 5. List Memories with Advanced Filters

**Endpoint:** `GET /api/v1/memories`
**MCP Tool:** `list_memories`

**Query Parameters:**
```
GET /api/v1/memories?limit=20&offset=0
  &type=knowledge
  &tags=auth,security
  &project_id=proj_abc123
  &topic_id=topic_xyz789
  &is_archived=false
  &sortBy=updated_at
  &sortOrder=desc
  &search=authentication
  &date_from=2025-01-01
  &date_to=2025-12-31
  &include_chunks=false
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "mem_abc123",
      "title": "Authentication System Architecture",
      "content": "Preview...",
      "type": "knowledge",
      "tags": ["auth", "oauth2", "security"],
      "project_id": "proj_abc123",
      "topic_id": "topic_xyz789",
      "metadata": {
        "total_chunks": 5,
        "content_type": "text"
      },
      "created_at": "2025-12-24T10:00:00Z",
      "updated_at": "2025-12-24T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 156,
    "page": 1,
    "limit": 20,
    "hasMore": true,
    "totalPages": 8
  },
  "filters": {
    "type": "knowledge",
    "tags": ["auth", "security"],
    "project_id": "proj_abc123"
  }
}
```

---

## Analytics APIs 🆕

### 1. Memory Search Analytics

**Endpoint:** `GET /api/v1/analytics/search`

**Query Parameters:**
```
GET /api/v1/analytics/search?
  from=2025-12-01&
  to=2025-12-31&
  group_by=day
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_searches": 1523,
    "avg_results_count": 8.5,
    "avg_execution_time_ms": 45,
    "search_types": {
      "vector": 892,
      "text": 431,
      "hybrid": 200
    },
    "by_date": [
      {
        "date": "2025-12-24",
        "searches": 45,
        "avg_results": 9.2,
        "avg_time_ms": 42
      }
    ],
    "popular_queries": [
      {
        "query": "authentication",
        "count": 45,
        "avg_results": 12
      }
    ]
  }
}
```

**Database:**
```sql
SELECT
    DATE(created_at) as date,
    COUNT(*) as searches,
    AVG(results_count) as avg_results,
    AVG(execution_time_ms) as avg_time_ms
FROM memory_search_analytics
WHERE user_id = $1
  AND created_at BETWEEN $2 AND $3
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

### 2. Memory Access Patterns

**Endpoint:** `GET /api/v1/analytics/access`

**Response:**
```json
{
  "success": true,
  "data": {
    "total_accesses": 3456,
    "by_type": {
      "read": 2890,
      "update": 456,
      "delete": 110
    },
    "by_method": {
      "api": 2345,
      "search": 890,
      "direct": 221
    },
    "most_accessed": [
      {
        "memory_id": "mem_abc123",
        "title": "Authentication System",
        "access_count": 156,
        "last_accessed": "2025-12-24T10:00:00Z"
      }
    ],
    "access_by_hour": [
      {"hour": 9, "count": 245},
      {"hour": 10, "count": 312}
    ]
  }
}
```

---

### 3. Memory Statistics

**Endpoint:** `GET /api/v1/analytics/stats`
**MCP Tool:** `get_health_status` (extended)

**Response:**
```json
{
  "success": true,
  "data": {
    "total_memories": 1523,
    "by_type": {
      "knowledge": 892,
      "context": 431,
      "project": 200
    },
    "by_project": [
      {
        "project_id": "proj_abc123",
        "project_name": "Backend Services",
        "count": 456
      }
    ],
    "storage": {
      "total_size_mb": 245.6,
      "avg_memory_size_kb": 165.3,
      "total_chunks": 7845
    },
    "activity": {
      "created_today": 12,
      "updated_today": 45,
      "searched_today": 156
    },
    "top_tags": [
      {"tag": "auth", "count": 234},
      {"tag": "security", "count": 189}
    ]
  }
}
```

---

## Topics APIs 🆕

### 1. Create Topic

**Endpoint:** `POST /api/v1/topics`

**Request:**
```json
{
  "name": "Authentication",
  "description": "Authentication and authorization topics",
  "parent_topic_id": "topic_security",
  "metadata": {
    "icon": "🔐",
    "color": "#FF5733"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "topic_auth123",
    "name": "Authentication",
    "description": "Authentication and authorization topics",
    "parent_topic_id": "topic_security",
    "organization_id": "org_456",
    "metadata": {
      "icon": "🔐",
      "color": "#FF5733"
    },
    "created_at": "2025-12-24T10:00:00Z",
    "updated_at": "2025-12-24T10:00:00Z"
  }
}
```

---

### 2. List Topics (Hierarchical)

**Endpoint:** `GET /api/v1/topics?include_hierarchy=true`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "topic_security",
      "name": "Security",
      "description": "Security-related topics",
      "children": [
        {
          "id": "topic_auth123",
          "name": "Authentication",
          "description": "Authentication and authorization",
          "memory_count": 45,
          "children": []
        },
        {
          "id": "topic_crypto",
          "name": "Cryptography",
          "memory_count": 23,
          "children": []
        }
      ],
      "memory_count": 68
    }
  ],
  "total": 5
}
```

---

### 3. Get Topic with Memories

**Endpoint:** `GET /api/v1/topics/{id}/memories`

**Response:**
```json
{
  "success": true,
  "data": {
    "topic": {
      "id": "topic_auth123",
      "name": "Authentication",
      "description": "Authentication and authorization",
      "parent": {
        "id": "topic_security",
        "name": "Security"
      }
    },
    "memories": [
      {
        "id": "mem_abc123",
        "title": "OAuth2 PKCE Flow",
        "type": "knowledge",
        "created_at": "2025-12-24T10:00:00Z"
      }
    ],
    "total_memories": 45,
    "subtopics": [
      {
        "id": "topic_oauth",
        "name": "OAuth2",
        "memory_count": 12
      }
    ]
  }
}
```

---

## Enhanced Schemas

### Memory Entry Schema (Complete)

```typescript
interface MemoryEntry {
  id: string;  // UUID
  title: string;  // max 500 chars
  content: string;  // Full text content
  type: 'context' | 'project' | 'knowledge' | 'reference' | 'personal' | 'workflow';
  tags: string[];  // PostgreSQL TEXT[] array
  metadata: {
    // Chunking information
    chunks?: ContentChunk[];
    total_chunks?: number;
    chunking_strategy?: 'semantic' | 'fixed-size' | 'paragraph' | 'sentence' | 'code-block';

    // Content intelligence
    intelligence?: {
      entities: string[];
      keywords: string[];
      language: string;
      topics: string[];
      sentiment?: 'positive' | 'neutral' | 'negative';
      complexity?: 'low' | 'medium' | 'high';
    };

    // Content metadata
    content_type?: 'text' | 'code' | 'markdown' | 'json' | 'yaml';
    language?: string;  // Programming language if code
    tokens?: number;

    // Custom metadata
    source?: string;
    priority?: 'high' | 'medium' | 'low';
    [key: string]: any;
  };
  embedding: number[];  // 1536 dimensions (OpenAI ada-002/text-embedding-3-small)
  user_id: string;  // UUID
  project_id?: string;  // UUID
  organization_id: string;  // UUID
  topic_id?: string;  // UUID
  is_archived: boolean;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}

interface ContentChunk {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
  tokens: number;
  metadata: {
    type: 'paragraph' | 'sentence' | 'code' | 'section';
    isComplete: boolean;
  };
}
```

---

## Key Differences from v1.0

| Feature | v1.0 (Initial Design) | v2.0 (Actual Schema) |
|---------|----------------------|----------------------|
| Memory Table | `memory` or `memory_entries` | ✅ `memory_entries` only |
| Chunking | Separate `memory_chunks` table | ✅ In-memory, stored in metadata |
| Tags | Separate `tags` + `memory_tags` tables | ✅ `TEXT[]` array on memory_entries |
| Intelligence | Separate `memory_intelligence` table | ✅ JSONB in metadata |
| API Keys | Dual table system | ✅ Single `api_keys` table |
| Topics | Not included | ✅ `memory_topics` table |
| Analytics | Not included | ✅ `memory_search_analytics` + `memory_access_patterns` |
| Projects | Simplified | ✅ Full project support |
| Organizations | Basic | ✅ Multi-tenant with plans |

---

## Migration Strategy

### Phase 1: Edge Functions (Week 1-2)
1. Create Supabase Edge Functions for all 25 endpoints
2. Use existing database schema (no changes needed)
3. Implement MemoryService preprocessing in Edge Functions
4. Deploy to staging

### Phase 2: Testing (Week 3)
1. Test all 19 MCP tools via REST API
2. Validate chunking and intelligence extraction
3. Test analytics endpoints
4. Performance testing with pgvector

### Phase 3: Cutover (Week 4)
1. Route 10% traffic to Supabase
2. Monitor metrics
3. Gradually increase to 100%
4. Decommission Netlify

---

**Document Version:** 2.0.0 (Revised)
**Last Updated:** 2025-12-24
**Status:** Ready for Implementation
**Based On:** Actual production database schema
