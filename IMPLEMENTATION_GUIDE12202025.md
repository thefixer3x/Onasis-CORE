# LanOnasis Hybrid Scope Implementation Guide

> **Purpose**: Systematic implementation of unified memory scoping across all LanOnasis channels
> **Target Agent**: Claude Code / AI Development Assistant
> **Repository**: onasis-core
> **Created**: 2024-12-20
> **Last Updated**: 2024-12-20 (Infrastructure Alignment)

---

## 📋 Executive Summary

### Problem Statement

Memory queries return different results depending on the channel used:

- `api.lanonasis.com` (Netlify) → Organization-scoped (all org memories)
- `mcp.lanonasis.com` (VPS) → User-scoped (only user's memories)

### Root Causes Identified (Infrastructure Analysis)

1. **Split-Brain Schema**: `mcp-message.js` queries empty `maas.memory_entries`, others query `public.memory_entries` (92 records)
2. **Empty User Mapping**: `public.users` table is EMPTY → org_id resolution falls back to default
3. **Orphaned System User**: 65 memories under `00000000-0000-0000-0000-000000000001` (no real user)
4. **Inconsistent Auth Resolution**: Netlify falls back to system user, MCP correctly resolves API key → user_id

### Solution

Implement a **Hybrid Scope Model** with explicit `scope` parameter:

- `personal` (default) → Only authenticated user's memories
- `organization` → All non-private memories in the organization
- `project` → Memories filtered by `topic_id` (mapped to `project_id`)

### Key Architectural Decisions

1. Map `project_id` → existing `topic_id` column (no schema changes)
2. Default scope is `personal` (privacy-first)
3. RLS policies remain authoritative (defense in depth)
4. Single `@lanonasis/core` package for all channels

---

## 🏗️ Infrastructure Reference

### Production Endpoints

| Service | Host | Location |
|---------|------|----------|
| REST API | `api.lanonasis.com` | Netlify Functions |
| MCP Server | `mcp.lanonasis.com` | VPS `168.231.74.29:3001` |
| Auth Gateway | `auth.lanonasis.com` | VPS `168.231.74.29:4000` |
| SSE Events | `mcp.lanonasis.com/api/v1/events` | VPS `168.231.74.29:3003` |

### VPS File Locations

```
/opt/lanonasis/
├── mcp-core/                    # MCP Server (PM2: mcp-core)
│   ├── src/
│   │   ├── index.ts             # Main Express server
│   │   ├── core/
│   │   │   └── auth-handler.ts  # API key validation (lines 191-260)
│   │   └── tools/
│   │       └── memory-tool.ts   # Memory operations
│   └── dist/
├── onasis-core/                 # Netlify Functions source
│   └── netlify/functions/
│       ├── maas-api.js          # Memory REST API (line 718+)
│       └── mcp-message.js       # ❌ Queries maas.memory_entries (EMPTY!)
└── auth-gateway/                # Auth service
```

### Database State (Supabase: mxtsdgkwzjzlttpotole)

| Table | Schema | Records | Status |
|-------|--------|---------|--------|
| `memory_entries` | **public** | **92** | ✅ Active - All channels should use this |
| `memory_entries` | maas | 0 | ❌ Empty - mcp-message.js still queries this |
| `users` | public | **0** | ❌ EMPTY - Causes org_id fallback |
| `users` | maas | 1 | Only <info@lanonasis.com> |
| `api_keys` | public | 26 | ✅ Active |
| `organizations` | public | 1 | Lanonasis (ba2c1b22-3c4d-4a5b-aca3-881995d863d5) |

### Memory Distribution (public.memory_entries)

| User ID | Email/Type | Count | Status |
|---------|------------|-------|--------|
| `00000000-0000-0000-0000-000000000001` | System/Master Key | 65 | ⚠️ Orphaned |
| `c482cb8c-dc40-41dc-986d-daf0bcb078e5` | <info@lanonasis.com> | 22 | ✅ Active |
| `b990c45e-8bf0-44d2-aeb6-6503ee08d152` | <admin@lanonasis.com> | 5 | ✅ Active |

---

## 🗂️ Phase Overview

| Phase | Description | Duration | Risk Level |
|-------|-------------|----------|------------|
| **Phase 0** | Critical Infrastructure Fixes | 1 day | 🔴 High (Quick Wins) |
| **Phase 1** | Create Core Package | 2-3 days | 🟢 Low |
| **Phase 2** | Update REST API (Netlify) | 1-2 days | 🟡 Medium |
| **Phase 3** | Update MCP Server (VPS) | 1-2 days | 🟡 Medium |
| **Phase 4** | Update CLI & SDK | 2-3 days | 🟢 Low |
| **Phase 5** | Cross-Channel Testing | 1-2 days | 🟢 Low |
| **Phase 6** | Documentation & Rollout | 1 day | 🟢 Low |

---

# Phase 0: Critical Infrastructure Fixes (MUST DO FIRST)

> ⚠️ **These fixes address foundational issues that will cause the scope implementation to fail if not resolved first.**

## Task 0.1: Fix mcp-message.js Schema Reference

### Problem

`mcp-message.js` queries `maas.memory_entries` which is EMPTY, causing zero results.

### File to modify: `netlify/functions/mcp-message.js`

### Lines to change: ~65, ~128

**FIND:**

```javascript
.from('maas.memory_entries')
```

**REPLACE WITH:**

```javascript
.from('memory_entries')  // Uses public schema (92 records)
```

### Verification

```bash
# After deploying, this should return memories
curl -X POST https://api.lanonasis.com/message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method": "list_memories"}'
```

---

## Task 0.2: Populate public.users Table

### Problem

`public.users` is EMPTY, causing all org_id lookups to fail and fall back to default.

### SQL Migration to run via Supabase Dashboard or CLI

```sql
-- Populate public.users from auth.users
-- This creates the missing user-org mapping

INSERT INTO public.users (id, email, organization_id, is_active, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  'ba2c1b22-3c4d-4a5b-aca3-881995d863d5'::uuid as organization_id, -- Default Lanonasis org
  true as is_active,
  au.created_at,
  COALESCE(au.updated_at, au.created_at) as updated_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);

-- Verify
SELECT id, email, organization_id FROM public.users;
```

### Expected Result

```
id                                   | email                | organization_id
-------------------------------------+----------------------+--------------------------------------
c482cb8c-dc40-41dc-986d-daf0bcb078e5 | info@lanonasis.com   | ba2c1b22-3c4d-4a5b-aca3-881995d863d5
b990c45e-8bf0-44d2-aeb6-6503ee08d152 | admin@lanonasis.com  | ba2c1b22-3c4d-4a5b-aca3-881995d863d5
... (all 10 auth.users)
```

---

## Task 0.3: Fix API Key → User Resolution in Netlify

### Problem

`maas-api.js` doesn't properly extract `user_id` from the API key lookup.

### File to modify: `netlify/functions/maas-api.js`

### Location: Around line 250-280 (authenticateApiKey middleware)

**CURRENT BEHAVIOR:**

```javascript
// After API key validation, req.user is set but user_id may be missing
req.user = {
  id: keyData.id,           // This is the API KEY id, not USER id!
  api_key_id: keyData.id,
  organization_id: DEFAULT_ORGANIZATION_ID,
  // user_id is not set or set incorrectly
};
```

**FIX:**

```javascript
// After API key validation
const keyData = data; // from api_keys table lookup

// CRITICAL: Extract USER_ID from the API key record
req.user = {
  user_id: keyData.user_id,           // ← The actual user who owns this API key
  api_key_id: keyData.id,             // The API key ID (for logging)
  organization_id: keyData.organization_id || DEFAULT_ORGANIZATION_ID,
  email: keyData.email || null,
  is_master: false,
};

console.log(`[AUTH] API Key resolved to user_id: ${req.user.user_id}`);
```

### Verification

```bash
# This should now return only YOUR memories (22), not org-wide (92)
curl -H "Authorization: Bearer lano_nmpidur33vcn2t8qh61iffy08ulyerd5" \
  "https://api.lanonasis.com/api/v1/memory?limit=50"
```

---

## Task 0.4: Decide System User Memory Strategy

### Problem

65 memories belong to system user `00000000-0000-0000-0000-000000000001` which doesn't exist in any users table.

### Options

**Option A: Migrate to <admin@lanonasis.com> (RECOMMENDED)**

```sql
-- Reassign system user memories to admin
UPDATE public.memory_entries
SET user_id = 'b990c45e-8bf0-44d2-aeb6-6503ee08d152'  -- admin@lanonasis.com
WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Verify
SELECT user_id, COUNT(*) FROM public.memory_entries GROUP BY user_id;
```

**Option B: Create System User Record**

```sql
-- Add system user to public.users (keeps memories separate)
INSERT INTO public.users (id, email, organization_id, is_active, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@lanonasis.local',
  'ba2c1b22-3c4d-4a5b-aca3-881995d863d5',
  true,
  NOW(),
  NOW()
);
```

**Option C: Defer (Document the issue)**

- System user memories remain orphaned
- Won't appear in personal scope queries
- Will appear in organization scope queries

### Recommendation

Choose **Option A** (migrate to admin) if those memories belong to admin's historical usage.
Choose **Option B** if you want to preserve system user as a distinct entity.

---

## Task 0.5: Verify Infrastructure Before Proceeding

### Checklist (Run these commands)

```bash
# 1. Verify mcp-message.js is querying correct schema
grep -n "from.*memory_entries" netlify/functions/mcp-message.js

# 2. Verify public.users has records (via Supabase MCP or dashboard)
# Expected: 10+ rows

# 3. Test API key resolution
curl -v -H "Authorization: Bearer lano_nmpidur33vcn2t8qh61iffy08ulyerd5" \
  "https://api.lanonasis.com/api/v1/memory?limit=5" 2>&1 | grep -E "(user_id|scope)"

# 4. Compare endpoints (should return SAME data now)
# REST API
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.lanonasis.com/api/v1/memory?limit=5" | jq '.data[].id'

# MCP  
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://mcp.lanonasis.com/api/v1/memory?limit=5" | jq '.data[].id'
```

### Success Criteria for Phase 0

- [ ] `mcp-message.js` queries `public.memory_entries`
- [ ] `public.users` has 10 rows (matching auth.users)
- [ ] API key `lano_nmpidur...` returns 22 memories (not 92 or 65)
- [ ] Both endpoints return identical memory IDs

---

# ⚠️ DO NOT PROCEED TO PHASE 1 UNTIL ALL PHASE 0 TASKS ARE VERIFIED ⚠️

---

## 📁 File Structure to Create

```
onasis-core/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── types/
│       │   │   ├── index.ts
│       │   │   ├── query-context.ts
│       │   │   ├── memory.ts
│       │   │   └── scope.ts
│       │   ├── services/
│       │   │   ├── index.ts
│       │   │   ├── memory-service.ts
│       │   │   ├── auth-service.ts
│       │   │   └── context-builder.ts
│       │   ├── utils/
│       │   │   ├── index.ts
│       │   │   ├── validation.ts
│       │   │   └── errors.ts
│       │   └── index.ts
│       ├── tests/
│       │   ├── memory-service.test.ts
│       │   ├── context-builder.test.ts
│       │   └── fixtures/
│       │       └── test-data.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── tests/
│   └── integration/
│       └── cross-channel-consistency.test.ts
└── IMPLEMENTATION_GUIDE.md (this file)
```

---

# Phase 1: Create Core Package

## Task 1.1: Initialize Package Structure

### Instructions

Create the `packages/core` directory structure with all necessary configuration files.

### File: `packages/core/package.json`

```json
{
  "name": "@lanonasis/core",
  "version": "0.1.0",
  "description": "Core services for LanOnasis Memory as a Service",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types/index.js",
      "types": "./dist/types/index.d.ts"
    },
    "./services": {
      "import": "./dist/services/index.js",
      "types": "./dist/services/index.d.ts"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.88.0"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  },
  "peerDependencies": {
    "@supabase/supabase-js": "^2.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "lanonasis",
    "memory",
    "maas",
    "context",
    "ai"
  ],
  "author": "LanOnasis",
  "license": "MIT"
}
```

### File: `packages/core/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### File: `packages/core/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/types/**']
    }
  }
});
```

---

## Task 1.2: Define Type System

### File: `packages/core/src/types/scope.ts`

```typescript
/**
 * Memory scope determines what memories are returned in queries.
 * 
 * - `personal`: Only memories owned by the authenticated user
 * - `organization`: All non-private memories in the user's organization
 * - `project`: Memories filtered by topic_id (mapped to project_id)
 */
export type MemoryScope = 'personal' | 'organization' | 'project';

/**
 * Memory types supported by the system.
 * Maps to the memory_type enum in the database.
 */
export type MemoryType = 
  | 'context' 
  | 'project' 
  | 'knowledge' 
  | 'reference' 
  | 'personal' 
  | 'workflow';

/**
 * Client channel identifier for analytics and debugging.
 */
export type ClientChannel = 
  | 'dashboard' 
  | 'cli' 
  | 'ide' 
  | 'api' 
  | 'sdk' 
  | 'mcp' 
  | 'pwa'
  | 'unknown';

/**
 * Default scope for all queries when not explicitly specified.
 * Set to 'personal' for privacy-first design.
 */
export const DEFAULT_SCOPE: MemoryScope = 'personal';

/**
 * Default pagination limit.
 */
export const DEFAULT_LIMIT = 20;

/**
 * Maximum pagination limit to prevent abuse.
 */
export const MAX_LIMIT = 100;
```

### File: `packages/core/src/types/query-context.ts`

```typescript
import type { MemoryScope, MemoryType, ClientChannel } from './scope';

/**
 * QueryContext is the single source of truth for all memory operations.
 * Every channel (API, CLI, MCP, SDK, etc.) must build this context
 * before calling MemoryService methods.
 */
export interface QueryContext {
  // ============================================
  // AUTHENTICATION (always required)
  // ============================================
  
  /**
   * The authenticated user's UUID.
   * Resolved from API key or JWT token.
   */
  user_id: string;
  
  /**
   * The user's organization UUID.
   * All queries are implicitly filtered by this.
   */
  organization_id: string;
  
  /**
   * The API key ID used for this request (for audit logging).
   * Optional if using JWT authentication.
   */
  api_key_id?: string;

  // ============================================
  // SCOPING (determines what data is returned)
  // ============================================
  
  /**
   * The scope for this query.
   * - 'personal': Only user's own memories
   * - 'organization': All org memories (respects is_private)
   * - 'project': Filtered by project_id (topic_id in DB)
   * 
   * @default 'personal'
   */
  scope: MemoryScope;
  
  /**
   * Project/Topic ID for project-scoped queries.
   * Maps to `topic_id` column in memory_entries table.
   * Required when scope is 'project'.
   */
  project_id?: string;

  // ============================================
  // PAGINATION
  // ============================================
  
  /**
   * Maximum number of results to return.
   * @default 20
   * @max 100
   */
  limit: number;
  
  /**
   * Number of results to skip (for pagination).
   * @default 0
   */
  offset: number;

  // ============================================
  // FILTERS (optional)
  // ============================================
  
  /**
   * Filter by memory type.
   */
  memory_type?: MemoryType;
  
  /**
   * Filter by tags (AND logic - must have all tags).
   */
  tags?: string[];
  
  /**
   * Search query for semantic/text search.
   */
  search_query?: string;

  // ============================================
  // METADATA (for logging/debugging)
  // ============================================
  
  /**
   * The client channel making this request.
   * Used for analytics and debugging.
   */
  channel: ClientChannel;
  
  /**
   * Unique request ID for tracing.
   */
  request_id: string;
  
  /**
   * Timestamp when context was created.
   */
  created_at: Date;
}

/**
 * Partial context for building QueryContext incrementally.
 */
export type PartialQueryContext = Partial<QueryContext> & {
  user_id: string;
  organization_id: string;
};

/**
 * Options for creating a QueryContext.
 */
export interface QueryContextOptions {
  user_id: string;
  organization_id: string;
  api_key_id?: string;
  scope?: MemoryScope;
  project_id?: string;
  limit?: number;
  offset?: number;
  memory_type?: MemoryType;
  tags?: string[];
  search_query?: string;
  channel?: ClientChannel;
  request_id?: string;
}
```

### File: `packages/core/src/types/memory.ts`

```typescript
import type { MemoryType } from './scope';

/**
 * Memory entry as stored in the database.
 */
export interface Memory {
  id: string;
  title: string;
  content: string;
  memory_type: MemoryType;
  tags: string[];
  topic_id: string | null;
  user_id: string;
  organization_id: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  is_private: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number;
}

/**
 * Input for creating a new memory.
 */
export interface CreateMemoryInput {
  title: string;
  content: string;
  memory_type?: MemoryType;
  tags?: string[];
  project_id?: string; // Maps to topic_id
  metadata?: Record<string, unknown>;
  is_private?: boolean;
}

/**
 * Input for updating an existing memory.
 */
export interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  memory_type?: MemoryType;
  tags?: string[];
  project_id?: string; // Maps to topic_id
  metadata?: Record<string, unknown>;
  is_private?: boolean;
  is_archived?: boolean;
}

/**
 * Search result with similarity score.
 */
export interface MemorySearchResult extends Memory {
  similarity_score: number;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}
```

### File: `packages/core/src/types/index.ts`

```typescript
// Re-export all types
export * from './scope';
export * from './query-context';
export * from './memory';
```

---

## Task 1.3: Implement Context Builder

### File: `packages/core/src/services/context-builder.ts`

```typescript
import { randomUUID } from 'crypto';
import type { 
  QueryContext, 
  QueryContextOptions,
  PartialQueryContext 
} from '../types/query-context';
import { 
  DEFAULT_SCOPE, 
  DEFAULT_LIMIT, 
  MAX_LIMIT,
  type ClientChannel 
} from '../types/scope';
import { ValidationError } from '../utils/errors';

/**
 * Builds and validates QueryContext objects.
 * Ensures all channels create consistent context.
 */
export class ContextBuilder {
  private context: Partial<QueryContext> = {};

  /**
   * Create a new ContextBuilder with required authentication fields.
   */
  static create(options: QueryContextOptions): ContextBuilder {
    const builder = new ContextBuilder();
    return builder
      .setAuth(options.user_id, options.organization_id, options.api_key_id)
      .setScope(options.scope ?? DEFAULT_SCOPE, options.project_id)
      .setPagination(options.limit, options.offset)
      .setFilters(options.memory_type, options.tags, options.search_query)
      .setMetadata(options.channel, options.request_id);
  }

  /**
   * Set authentication fields.
   */
  setAuth(
    user_id: string, 
    organization_id: string, 
    api_key_id?: string
  ): this {
    if (!user_id || !this.isValidUUID(user_id)) {
      throw new ValidationError('Invalid user_id: must be a valid UUID');
    }
    if (!organization_id || !this.isValidUUID(organization_id)) {
      throw new ValidationError('Invalid organization_id: must be a valid UUID');
    }
    
    this.context.user_id = user_id;
    this.context.organization_id = organization_id;
    this.context.api_key_id = api_key_id;
    return this;
  }

  /**
   * Set scope and optional project_id.
   */
  setScope(scope: QueryContext['scope'], project_id?: string): this {
    const validScopes = ['personal', 'organization', 'project'];
    if (!validScopes.includes(scope)) {
      throw new ValidationError(
        `Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`
      );
    }
    
    if (scope === 'project' && !project_id) {
      throw new ValidationError(
        'project_id is required when scope is "project"'
      );
    }
    
    if (project_id && !this.isValidUUID(project_id)) {
      throw new ValidationError('Invalid project_id: must be a valid UUID');
    }
    
    this.context.scope = scope;
    this.context.project_id = project_id;
    return this;
  }

  /**
   * Set pagination parameters.
   */
  setPagination(limit?: number, offset?: number): this {
    const parsedLimit = limit ?? DEFAULT_LIMIT;
    const parsedOffset = offset ?? 0;
    
    if (parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
      throw new ValidationError(
        `Invalid limit: ${parsedLimit}. Must be between 1 and ${MAX_LIMIT}`
      );
    }
    
    if (parsedOffset < 0) {
      throw new ValidationError(
        `Invalid offset: ${parsedOffset}. Must be >= 0`
      );
    }
    
    this.context.limit = parsedLimit;
    this.context.offset = parsedOffset;
    return this;
  }

  /**
   * Set optional filters.
   */
  setFilters(
    memory_type?: QueryContext['memory_type'],
    tags?: string[],
    search_query?: string
  ): this {
    const validTypes = [
      'context', 'project', 'knowledge', 
      'reference', 'personal', 'workflow'
    ];
    
    if (memory_type && !validTypes.includes(memory_type)) {
      throw new ValidationError(
        `Invalid memory_type: ${memory_type}. Must be one of: ${validTypes.join(', ')}`
      );
    }
    
    this.context.memory_type = memory_type;
    this.context.tags = tags?.filter(t => t.trim().length > 0);
    this.context.search_query = search_query?.trim();
    return this;
  }

  /**
   * Set metadata fields.
   */
  setMetadata(channel?: ClientChannel, request_id?: string): this {
    this.context.channel = channel ?? 'unknown';
    this.context.request_id = request_id ?? randomUUID();
    this.context.created_at = new Date();
    return this;
  }

  /**
   * Build and return the validated QueryContext.
   */
  build(): QueryContext {
    // Ensure required fields are present
    if (!this.context.user_id || !this.context.organization_id) {
      throw new ValidationError(
        'Cannot build context: user_id and organization_id are required'
      );
    }
    
    return {
      user_id: this.context.user_id,
      organization_id: this.context.organization_id,
      api_key_id: this.context.api_key_id,
      scope: this.context.scope ?? DEFAULT_SCOPE,
      project_id: this.context.project_id,
      limit: this.context.limit ?? DEFAULT_LIMIT,
      offset: this.context.offset ?? 0,
      memory_type: this.context.memory_type,
      tags: this.context.tags,
      search_query: this.context.search_query,
      channel: this.context.channel ?? 'unknown',
      request_id: this.context.request_id ?? randomUUID(),
      created_at: this.context.created_at ?? new Date(),
    };
  }

  /**
   * Validate UUID format.
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}

/**
 * Convenience function to create QueryContext from options.
 */
export function createQueryContext(options: QueryContextOptions): QueryContext {
  return ContextBuilder.create(options).build();
}

/**
 * Create QueryContext from HTTP request parameters.
 * Used by REST API and similar channels.
 */
export function createContextFromRequest(
  auth: { user_id: string; organization_id: string; api_key_id?: string },
  query: Record<string, string | string[] | undefined>,
  channel: ClientChannel = 'api',
  request_id?: string
): QueryContext {
  return createQueryContext({
    user_id: auth.user_id,
    organization_id: auth.organization_id,
    api_key_id: auth.api_key_id,
    scope: (query.scope as QueryContext['scope']) ?? DEFAULT_SCOPE,
    project_id: query.project_id as string | undefined,
    limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
    offset: query.offset ? parseInt(query.offset as string, 10) : undefined,
    memory_type: query.type as QueryContext['memory_type'],
    tags: query.tags 
      ? (Array.isArray(query.tags) ? query.tags : [query.tags]) 
      : undefined,
    search_query: query.q as string | undefined,
    channel,
    request_id,
  });
}
```

---

## Task 1.4: Implement Memory Service

### File: `packages/core/src/services/memory-service.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { 
  QueryContext 
} from '../types/query-context';
import type { 
  Memory, 
  CreateMemoryInput, 
  UpdateMemoryInput,
  MemorySearchResult,
  PaginatedResponse 
} from '../types/memory';
import { ServiceError, NotFoundError } from '../utils/errors';

/**
 * MemoryService provides unified memory operations across all channels.
 * All channels (API, CLI, MCP, SDK) should use this service.
 */
export class MemoryService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List memories based on QueryContext scope and filters.
   * 
   * Scope behavior:
   * - personal: user_id = ctx.user_id
   * - organization: organization_id = ctx.organization_id (RLS handles privacy)
   * - project: topic_id = ctx.project_id
   */
  async listMemories(ctx: QueryContext): Promise<PaginatedResponse<Memory>> {
    try {
      // Start query - always filter by organization
      let query = this.supabase
        .from('memory_entries')
        .select('*', { count: 'exact' })
        .eq('organization_id', ctx.organization_id)
        .eq('is_archived', false);

      // Apply scope-based filtering
      query = this.applyScopeFilter(query, ctx);

      // Apply optional filters
      if (ctx.memory_type) {
        query = query.eq('memory_type', ctx.memory_type);
      }
      
      if (ctx.tags && ctx.tags.length > 0) {
        query = query.contains('tags', ctx.tags);
      }

      // Pagination and ordering
      query = query
        .order('created_at', { ascending: false })
        .range(ctx.offset, ctx.offset + ctx.limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new ServiceError(`Failed to list memories: ${error.message}`, error);
      }

      return {
        data: data as Memory[],
        pagination: {
          total: count ?? 0,
          limit: ctx.limit,
          offset: ctx.offset,
          has_more: (count ?? 0) > ctx.offset + ctx.limit,
        },
      };
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Unexpected error listing memories', err);
    }
  }

  /**
   * Search memories using semantic vector search.
   * Falls back to text search if vector search fails.
   */
  async searchMemories(ctx: QueryContext): Promise<PaginatedResponse<MemorySearchResult>> {
    if (!ctx.search_query) {
      throw new ServiceError('search_query is required for search operations');
    }

    try {
      // Try semantic search first using match_memories RPC
      const { data: semanticResults, error: semanticError } = await this.supabase
        .rpc('match_memories', {
          query_text: ctx.search_query,
          match_count: ctx.limit,
          filter_org_id: ctx.organization_id,
          filter_user_id: ctx.scope === 'personal' ? ctx.user_id : null,
          filter_topic_id: ctx.scope === 'project' ? ctx.project_id : null,
        });

      if (!semanticError && semanticResults?.length > 0) {
        return {
          data: semanticResults as MemorySearchResult[],
          pagination: {
            total: semanticResults.length,
            limit: ctx.limit,
            offset: 0, // RPC doesn't support offset
            has_more: false,
          },
        };
      }

      // Fall back to text search
      let query = this.supabase
        .from('memory_entries')
        .select('*', { count: 'exact' })
        .eq('organization_id', ctx.organization_id)
        .eq('is_archived', false)
        .or(`title.ilike.%${ctx.search_query}%,content.ilike.%${ctx.search_query}%`);

      query = this.applyScopeFilter(query, ctx);

      query = query
        .order('created_at', { ascending: false })
        .range(ctx.offset, ctx.offset + ctx.limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new ServiceError(`Failed to search memories: ${error.message}`, error);
      }

      // Add placeholder similarity score for text search results
      const results = (data as Memory[]).map(m => ({
        ...m,
        similarity_score: 0.5, // Placeholder for text search
      }));

      return {
        data: results,
        pagination: {
          total: count ?? 0,
          limit: ctx.limit,
          offset: ctx.offset,
          has_more: (count ?? 0) > ctx.offset + ctx.limit,
        },
      };
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Unexpected error searching memories', err);
    }
  }

  /**
   * Get a single memory by ID.
   * Respects organization context for security.
   */
  async getMemory(ctx: QueryContext, memoryId: string): Promise<Memory> {
    try {
      const { data, error } = await this.supabase
        .from('memory_entries')
        .select('*')
        .eq('id', memoryId)
        .eq('organization_id', ctx.organization_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError(`Memory not found: ${memoryId}`);
        }
        throw new ServiceError(`Failed to get memory: ${error.message}`, error);
      }

      // Check scope access
      if (ctx.scope === 'personal' && data.user_id !== ctx.user_id) {
        // In personal scope, user can only access their own memories
        // Unless the memory is not private
        if (data.is_private) {
          throw new NotFoundError(`Memory not found: ${memoryId}`);
        }
      }

      // Update access tracking
      await this.supabase
        .from('memory_entries')
        .update({ 
          last_accessed: new Date().toISOString(),
          access_count: (data.access_count || 0) + 1 
        })
        .eq('id', memoryId);

      return data as Memory;
    } catch (err) {
      if (err instanceof ServiceError || err instanceof NotFoundError) throw err;
      throw new ServiceError('Unexpected error getting memory', err);
    }
  }

  /**
   * Create a new memory.
   * Always assigns to the authenticated user.
   */
  async createMemory(ctx: QueryContext, input: CreateMemoryInput): Promise<Memory> {
    try {
      const memoryData = {
        title: input.title,
        content: input.content,
        memory_type: input.memory_type ?? 'context',
        tags: input.tags ?? [],
        topic_id: input.project_id ?? null, // Map project_id to topic_id
        user_id: ctx.user_id,
        organization_id: ctx.organization_id,
        metadata: input.metadata ?? {},
        is_private: input.is_private ?? false,
        is_archived: false,
        access_count: 0,
      };

      const { data, error } = await this.supabase
        .from('memory_entries')
        .insert(memoryData)
        .select()
        .single();

      if (error) {
        throw new ServiceError(`Failed to create memory: ${error.message}`, error);
      }

      return data as Memory;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Unexpected error creating memory', err);
    }
  }

  /**
   * Update an existing memory.
   * Only the owner can update their memories.
   */
  async updateMemory(ctx: QueryContext, input: UpdateMemoryInput): Promise<Memory> {
    try {
      // First verify ownership
      const existing = await this.getMemory(ctx, input.id);
      
      if (existing.user_id !== ctx.user_id) {
        throw new ServiceError('Cannot update memory owned by another user');
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.memory_type !== undefined) updateData.memory_type = input.memory_type;
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.project_id !== undefined) updateData.topic_id = input.project_id;
      if (input.metadata !== undefined) updateData.metadata = input.metadata;
      if (input.is_private !== undefined) updateData.is_private = input.is_private;
      if (input.is_archived !== undefined) updateData.is_archived = input.is_archived;

      const { data, error } = await this.supabase
        .from('memory_entries')
        .update(updateData)
        .eq('id', input.id)
        .eq('organization_id', ctx.organization_id)
        .select()
        .single();

      if (error) {
        throw new ServiceError(`Failed to update memory: ${error.message}`, error);
      }

      return data as Memory;
    } catch (err) {
      if (err instanceof ServiceError || err instanceof NotFoundError) throw err;
      throw new ServiceError('Unexpected error updating memory', err);
    }
  }

  /**
   * Delete a memory (soft delete by archiving).
   * Only the owner can delete their memories.
   */
  async deleteMemory(ctx: QueryContext, memoryId: string): Promise<void> {
    try {
      const existing = await this.getMemory(ctx, memoryId);
      
      if (existing.user_id !== ctx.user_id) {
        throw new ServiceError('Cannot delete memory owned by another user');
      }

      const { error } = await this.supabase
        .from('memory_entries')
        .update({ 
          is_archived: true,
          updated_at: new Date().toISOString() 
        })
        .eq('id', memoryId)
        .eq('organization_id', ctx.organization_id);

      if (error) {
        throw new ServiceError(`Failed to delete memory: ${error.message}`, error);
      }
    } catch (err) {
      if (err instanceof ServiceError || err instanceof NotFoundError) throw err;
      throw new ServiceError('Unexpected error deleting memory', err);
    }
  }

  /**
   * Apply scope-based filtering to a query.
   */
  private applyScopeFilter(
    query: ReturnType<SupabaseClient['from']>['select'], 
    ctx: QueryContext
  ) {
    switch (ctx.scope) {
      case 'personal':
        // Only user's own memories
        return query.eq('user_id', ctx.user_id);
      
      case 'project':
        // Filter by topic_id (mapped from project_id)
        if (ctx.project_id) {
          return query.eq('topic_id', ctx.project_id);
        }
        // Fall through to organization if no project_id
        return query;
      
      case 'organization':
        // All org memories - RLS handles is_private visibility
        // No additional user_id filter
        return query;
      
      default:
        // Default to personal scope for safety
        return query.eq('user_id', ctx.user_id);
    }
  }
}

/**
 * Factory function to create MemoryService with Supabase client.
 */
export function createMemoryService(supabase: SupabaseClient): MemoryService {
  return new MemoryService(supabase);
}
```

---

## Task 1.5: Implement Utilities

### File: `packages/core/src/utils/errors.ts`

```typescript
/**
 * Base error class for LanOnasis services.
 */
export class LanOnasisError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'LanOnasisError';
    this.code = code;
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/**
 * Validation error for invalid input.
 */
export class ValidationError extends LanOnasisError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

/**
 * Service error for operational failures.
 */
export class ServiceError extends LanOnasisError {
  constructor(message: string, cause?: unknown) {
    super(message, 'SERVICE_ERROR', cause);
    this.name = 'ServiceError';
  }
}

/**
 * Not found error for missing resources.
 */
export class NotFoundError extends LanOnasisError {
  constructor(message: string, cause?: unknown) {
    super(message, 'NOT_FOUND', cause);
    this.name = 'NotFoundError';
  }
}

/**
 * Authentication error for auth failures.
 */
export class AuthenticationError extends LanOnasisError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', cause);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error for permission failures.
 */
export class AuthorizationError extends LanOnasisError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTHORIZATION_ERROR', cause);
    this.name = 'AuthorizationError';
  }
}

/**
 * Check if an error is a LanOnasis error.
 */
export function isLanOnasisError(err: unknown): err is LanOnasisError {
  return err instanceof LanOnasisError;
}

/**
 * Convert any error to a standardized error response.
 */
export function toErrorResponse(err: unknown): {
  error: string;
  code: string;
  message: string;
} {
  if (isLanOnasisError(err)) {
    return {
      error: err.name,
      code: err.code,
      message: err.message,
    };
  }

  if (err instanceof Error) {
    return {
      error: 'UnexpectedError',
      code: 'UNEXPECTED_ERROR',
      message: err.message,
    };
  }

  return {
    error: 'UnknownError',
    code: 'UNKNOWN_ERROR',
    message: String(err),
  };
}
```

### File: `packages/core/src/utils/validation.ts`

```typescript
import { ValidationError } from './errors';

/**
 * Validate that a value is a valid UUID v4.
 */
export function validateUUID(value: string, fieldName: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid UUID`);
  }
}

/**
 * Validate that a value is within a numeric range.
 */
export function validateRange(
  value: number, 
  min: number, 
  max: number, 
  fieldName: string
): void {
  if (value < min || value > max) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be between ${min} and ${max}`
    );
  }
}

/**
 * Validate that a value is one of allowed values.
 */
export function validateEnum<T extends string>(
  value: T,
  allowed: readonly T[],
  fieldName: string
): void {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be one of ${allowed.join(', ')}`
    );
  }
}

/**
 * Validate that a string is not empty.
 */
export function validateNotEmpty(value: string, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
}

/**
 * Validate memory input for creation.
 */
export function validateCreateMemoryInput(input: {
  title?: string;
  content?: string;
}): void {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError('title is required and cannot be empty');
  }
  if (!input.content || input.content.trim().length === 0) {
    throw new ValidationError('content is required and cannot be empty');
  }
}
```

### File: `packages/core/src/utils/index.ts`

```typescript
export * from './errors';
export * from './validation';
```

---

## Task 1.6: Create Package Entry Point

### File: `packages/core/src/services/index.ts`

```typescript
export { MemoryService, createMemoryService } from './memory-service';
export { 
  ContextBuilder, 
  createQueryContext,
  createContextFromRequest 
} from './context-builder';
```

### File: `packages/core/src/index.ts`

```typescript
// Types
export * from './types';

// Services
export * from './services';

// Utilities
export * from './utils';

// Version
export const VERSION = '0.1.0';
```

---

## Task 1.7: Write Unit Tests

### File: `packages/core/tests/fixtures/test-data.ts`

```typescript
import type { QueryContext } from '../../src/types';

export const TEST_USER_ID = 'c482cb8c-dc40-41dc-986d-daf0bcb078e5';
export const TEST_ORG_ID = 'ba2c1b22-3c4d-4a5b-aca3-881995d863d5';
export const TEST_PROJECT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
export const TEST_API_KEY_ID = '28764bf5-6555-4aef-ae8e-f1df34b0bca5';

export const createTestContext = (
  overrides: Partial<QueryContext> = {}
): QueryContext => ({
  user_id: TEST_USER_ID,
  organization_id: TEST_ORG_ID,
  api_key_id: TEST_API_KEY_ID,
  scope: 'personal',
  limit: 20,
  offset: 0,
  channel: 'api',
  request_id: 'test-request-123',
  created_at: new Date(),
  ...overrides,
});

export const MOCK_MEMORIES = [
  {
    id: 'mem-1',
    title: 'Test Memory 1',
    content: 'Content for test memory 1',
    memory_type: 'context',
    tags: ['test'],
    topic_id: null,
    user_id: TEST_USER_ID,
    organization_id: TEST_ORG_ID,
    embedding: null,
    metadata: {},
    is_private: false,
    is_archived: false,
    created_at: '2025-12-20T00:00:00Z',
    updated_at: '2025-12-20T00:00:00Z',
    last_accessed: null,
    access_count: 0,
  },
  {
    id: 'mem-2',
    title: 'Test Memory 2',
    content: 'Content for test memory 2',
    memory_type: 'project',
    tags: ['test', 'important'],
    topic_id: TEST_PROJECT_ID,
    user_id: TEST_USER_ID,
    organization_id: TEST_ORG_ID,
    embedding: null,
    metadata: {},
    is_private: true,
    is_archived: false,
    created_at: '2025-12-19T00:00:00Z',
    updated_at: '2025-12-19T00:00:00Z',
    last_accessed: null,
    access_count: 0,
  },
];
```

### File: `packages/core/tests/context-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { 
  ContextBuilder, 
  createQueryContext,
  createContextFromRequest 
} from '../src/services/context-builder';
import { ValidationError } from '../src/utils/errors';
import { TEST_USER_ID, TEST_ORG_ID, TEST_PROJECT_ID } from './fixtures/test-data';

describe('ContextBuilder', () => {
  describe('create()', () => {
    it('should create a valid context with minimal options', () => {
      const ctx = createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
      });

      expect(ctx.user_id).toBe(TEST_USER_ID);
      expect(ctx.organization_id).toBe(TEST_ORG_ID);
      expect(ctx.scope).toBe('personal'); // default
      expect(ctx.limit).toBe(20); // default
      expect(ctx.offset).toBe(0); // default
      expect(ctx.channel).toBe('unknown'); // default
      expect(ctx.request_id).toBeDefined();
      expect(ctx.created_at).toBeInstanceOf(Date);
    });

    it('should apply all provided options', () => {
      const ctx = createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        api_key_id: 'key-123',
        scope: 'project',
        project_id: TEST_PROJECT_ID,
        limit: 50,
        offset: 10,
        memory_type: 'knowledge',
        tags: ['important', 'review'],
        search_query: 'test search',
        channel: 'cli',
        request_id: 'custom-request-id',
      });

      expect(ctx.api_key_id).toBe('key-123');
      expect(ctx.scope).toBe('project');
      expect(ctx.project_id).toBe(TEST_PROJECT_ID);
      expect(ctx.limit).toBe(50);
      expect(ctx.offset).toBe(10);
      expect(ctx.memory_type).toBe('knowledge');
      expect(ctx.tags).toEqual(['important', 'review']);
      expect(ctx.search_query).toBe('test search');
      expect(ctx.channel).toBe('cli');
      expect(ctx.request_id).toBe('custom-request-id');
    });
  });

  describe('validation', () => {
    it('should throw on invalid user_id', () => {
      expect(() => createQueryContext({
        user_id: 'invalid',
        organization_id: TEST_ORG_ID,
      })).toThrow(ValidationError);
    });

    it('should throw on invalid organization_id', () => {
      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: 'invalid',
      })).toThrow(ValidationError);
    });

    it('should throw on invalid scope', () => {
      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        scope: 'invalid' as any,
      })).toThrow(ValidationError);
    });

    it('should throw when project scope without project_id', () => {
      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        scope: 'project',
      })).toThrow(ValidationError);
    });

    it('should throw on limit out of range', () => {
      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        limit: 0,
      })).toThrow(ValidationError);

      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        limit: 101,
      })).toThrow(ValidationError);
    });

    it('should throw on negative offset', () => {
      expect(() => createQueryContext({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORG_ID,
        offset: -1,
      })).toThrow(ValidationError);
    });
  });

  describe('createContextFromRequest()', () => {
    it('should parse query parameters correctly', () => {
      const ctx = createContextFromRequest(
        { user_id: TEST_USER_ID, organization_id: TEST_ORG_ID },
        { 
          scope: 'organization',
          limit: '50',
          offset: '10',
          type: 'knowledge',
          tags: ['a', 'b'],
          q: 'search term'
        },
        'api',
        'req-123'
      );

      expect(ctx.scope).toBe('organization');
      expect(ctx.limit).toBe(50);
      expect(ctx.offset).toBe(10);
      expect(ctx.memory_type).toBe('knowledge');
      expect(ctx.tags).toEqual(['a', 'b']);
      expect(ctx.search_query).toBe('search term');
      expect(ctx.channel).toBe('api');
      expect(ctx.request_id).toBe('req-123');
    });
  });
});
```

### File: `packages/core/tests/memory-service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from '../src/services/memory-service';
import { createTestContext, MOCK_MEMORIES, TEST_USER_ID, TEST_PROJECT_ID } from './fixtures/test-data';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockContains = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();

const createMockSupabase = () => ({
  from: vi.fn(() => ({
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    contains: mockContains.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    range: mockRange.mockReturnThis(),
    single: mockSingle,
    or: vi.fn().mockReturnThis(),
  })),
  rpc: mockRpc,
});

describe('MemoryService', () => {
  let service: MemoryService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    service = new MemoryService(mockSupabase as any);
  });

  describe('listMemories()', () => {
    it('should filter by user_id for personal scope', async () => {
      const ctx = createTestContext({ scope: 'personal' });
      
      mockRange.mockResolvedValue({
        data: MOCK_MEMORIES,
        error: null,
        count: 2,
      });

      await service.listMemories(ctx);

      // Verify eq was called with user_id for personal scope
      expect(mockEq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
    });

    it('should not filter by user_id for organization scope', async () => {
      const ctx = createTestContext({ scope: 'organization' });
      
      mockRange.mockResolvedValue({
        data: MOCK_MEMORIES,
        error: null,
        count: 2,
      });

      await service.listMemories(ctx);

      // For organization scope, should only filter by organization_id
      const eqCalls = mockEq.mock.calls.map(call => call[0]);
      expect(eqCalls).toContain('organization_id');
      expect(eqCalls).toContain('is_archived');
      // Should NOT have user_id filter
      expect(eqCalls.filter(c => c === 'user_id')).toHaveLength(0);
    });

    it('should filter by topic_id for project scope', async () => {
      const ctx = createTestContext({ 
        scope: 'project',
        project_id: TEST_PROJECT_ID 
      });
      
      mockRange.mockResolvedValue({
        data: [MOCK_MEMORIES[1]],
        error: null,
        count: 1,
      });

      await service.listMemories(ctx);

      expect(mockEq).toHaveBeenCalledWith('topic_id', TEST_PROJECT_ID);
    });

    it('should apply memory_type filter when provided', async () => {
      const ctx = createTestContext({ memory_type: 'knowledge' });
      
      mockRange.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      await service.listMemories(ctx);

      expect(mockEq).toHaveBeenCalledWith('memory_type', 'knowledge');
    });

    it('should apply tags filter when provided', async () => {
      const ctx = createTestContext({ tags: ['important', 'review'] });
      
      mockRange.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      await service.listMemories(ctx);

      expect(mockContains).toHaveBeenCalledWith('tags', ['important', 'review']);
    });

    it('should return paginated response', async () => {
      const ctx = createTestContext({ limit: 10, offset: 5 });
      
      mockRange.mockResolvedValue({
        data: MOCK_MEMORIES,
        error: null,
        count: 20,
      });

      const result = await service.listMemories(ctx);

      expect(result.pagination).toEqual({
        total: 20,
        limit: 10,
        offset: 5,
        has_more: true,
      });
    });
  });

  describe('createMemory()', () => {
    it('should map project_id to topic_id', async () => {
      const ctx = createTestContext();
      
      mockSingle.mockResolvedValue({
        data: { ...MOCK_MEMORIES[0], topic_id: TEST_PROJECT_ID },
        error: null,
      });

      await service.createMemory(ctx, {
        title: 'New Memory',
        content: 'Content',
        project_id: TEST_PROJECT_ID,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          topic_id: TEST_PROJECT_ID,
        })
      );
    });

    it('should assign memory to authenticated user', async () => {
      const ctx = createTestContext();
      
      mockSingle.mockResolvedValue({
        data: MOCK_MEMORIES[0],
        error: null,
      });

      await service.createMemory(ctx, {
        title: 'New Memory',
        content: 'Content',
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
        })
      );
    });
  });
});
```

---

# Phase 2: Update REST API (Netlify)

## Task 2.1: Update maas-api.js Memory Endpoints

### File to modify: `netlify/functions/maas-api.js`

### Changes Required

1. **Import core package** (add at top of file):

```javascript
// Add after existing imports
import { 
  createContextFromRequest, 
  createMemoryService,
  toErrorResponse,
  DEFAULT_SCOPE 
} from '@lanonasis/core';
```

2. **Update GET /api/v1/memory handler** (around line 718):

**BEFORE:**

```javascript
// GET /api/v1/memory - List memories
app.get("/api/v1/memory", authenticateApiKey, async (req, res) => {
  try {
    const { limit = 20, offset = 0, type, tags } = req.query;
    const organizationId = req.user?.organization_id || DEFAULT_ORGANIZATION_ID;

    let query = supabase
      .from("memory_entries")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq("memory_type", type);
    }
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      query = query.contains("tags", tagsArray);
    }

    const { data, error } = await query;
    // ... rest of handler
```

**AFTER:**

```javascript
// GET /api/v1/memory - List memories (v2 with scope support)
app.get("/api/v1/memory", authenticateApiKey, async (req, res) => {
  try {
    // Build query context from request
    const ctx = createContextFromRequest(
      {
        user_id: req.user.user_id,
        organization_id: req.user.organization_id || DEFAULT_ORGANIZATION_ID,
        api_key_id: req.user.api_key_id,
      },
      req.query,
      'api',
      req.headers['x-request-id'] || crypto.randomUUID()
    );

    // Log scope for debugging during migration
    console.log(`[MEMORY_LIST] scope=${ctx.scope}, user=${ctx.user_id.slice(0,8)}...`);

    // Use core memory service
    const memoryService = createMemoryService(supabase);
    const result = await memoryService.listMemories(ctx);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      meta: {
        scope: ctx.scope,
        request_id: ctx.request_id,
      },
    });
  } catch (error) {
    console.error("[MEMORY_LIST_ERROR]", error);
    const errorResponse = toErrorResponse(error);
    res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
      success: false,
      ...errorResponse,
    });
  }
});
```

3. **Update POST /api/v1/memory handler**:

**AFTER:**

```javascript
// POST /api/v1/memory - Create memory
app.post("/api/v1/memory", authenticateApiKey, async (req, res) => {
  try {
    const ctx = createContextFromRequest(
      {
        user_id: req.user.user_id,
        organization_id: req.user.organization_id || DEFAULT_ORGANIZATION_ID,
        api_key_id: req.user.api_key_id,
      },
      req.query,
      'api',
      req.headers['x-request-id'] || crypto.randomUUID()
    );

    const { title, content, type, tags, project_id, metadata, is_private } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'title and content are required',
      });
    }

    const memoryService = createMemoryService(supabase);
    const memory = await memoryService.createMemory(ctx, {
      title,
      content,
      memory_type: type,
      tags,
      project_id,
      metadata,
      is_private,
    });

    res.status(201).json({
      success: true,
      data: memory,
      meta: {
        request_id: ctx.request_id,
      },
    });
  } catch (error) {
    console.error("[MEMORY_CREATE_ERROR]", error);
    const errorResponse = toErrorResponse(error);
    res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
      success: false,
      ...errorResponse,
    });
  }
});
```

4. **Update GET /api/v1/memory/search handler**:

**AFTER:**

```javascript
// GET /api/v1/memory/search - Search memories
app.get("/api/v1/memory/search", authenticateApiKey, async (req, res) => {
  try {
    const ctx = createContextFromRequest(
      {
        user_id: req.user.user_id,
        organization_id: req.user.organization_id || DEFAULT_ORGANIZATION_ID,
        api_key_id: req.user.api_key_id,
      },
      { ...req.query, q: req.query.q || req.query.query },
      'api',
      req.headers['x-request-id'] || crypto.randomUUID()
    );

    if (!ctx.search_query) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
      });
    }

    const memoryService = createMemoryService(supabase);
    const result = await memoryService.searchMemories(ctx);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      meta: {
        scope: ctx.scope,
        query: ctx.search_query,
        request_id: ctx.request_id,
      },
    });
  } catch (error) {
    console.error("[MEMORY_SEARCH_ERROR]", error);
    const errorResponse = toErrorResponse(error);
    res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
      success: false,
      ...errorResponse,
    });
  }
});
```

---

## Task 2.2: Add Backward Compatibility Layer

### File: `netlify/functions/maas-api.js` (add before routes)

```javascript
/**
 * Backward compatibility middleware.
 * Logs deprecation warning when scope is not provided.
 * Will be removed after migration period.
 */
const scopeCompatibilityMiddleware = (req, res, next) => {
  if (!req.query.scope) {
    // Log for monitoring during migration
    console.warn(
      `[DEPRECATION] Request without scope parameter. ` +
      `Defaulting to 'personal'. Path: ${req.path}, ` +
      `API Key: ${req.user?.api_key_id?.slice(0, 8)}...`
    );
    
    // Add deprecation header
    res.set('X-Deprecation-Warning', 
      'scope parameter not provided. ' +
      'Defaulting to personal. ' +
      'Please specify scope=personal|organization|project explicitly.'
    );
  }
  next();
};

// Apply to memory routes
app.use('/api/v1/memory', scopeCompatibilityMiddleware);
```

---

# Phase 3: Update MCP Server (VPS)

## Task 3.1: Update MCP Memory Tools

### File to modify: `services/api-gateway/modules/maas-api.js` (VPS)

### Changes Required

1. **Import core package**:

```javascript
import { 
  createQueryContext, 
  createMemoryService,
  toErrorResponse 
} from '@lanonasis/core';
```

2. **Update list_memories tool handler**:

```javascript
// MCP Tool: list_memories
{
  name: 'list_memories',
  description: 'List memories with optional filtering by scope, type, and tags',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['personal', 'organization', 'project'],
        default: 'personal',
        description: 'Scope of memories to retrieve',
      },
      project_id: {
        type: 'string',
        description: 'Project/Topic ID (required when scope is "project")',
      },
      type: {
        type: 'string',
        enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'],
        description: 'Filter by memory type',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags',
      },
      limit: {
        type: 'number',
        default: 20,
        description: 'Maximum results to return',
      },
      offset: {
        type: 'number',
        default: 0,
        description: 'Offset for pagination',
      },
    },
  },
  handler: async (args, context) => {
    const ctx = createQueryContext({
      user_id: context.user.user_id,
      organization_id: context.user.organization_id,
      api_key_id: context.user.api_key_id,
      scope: args.scope || 'personal',
      project_id: args.project_id,
      limit: args.limit,
      offset: args.offset,
      memory_type: args.type,
      tags: args.tags,
      channel: 'mcp',
      request_id: context.request_id,
    });

    const memoryService = createMemoryService(supabase);
    const result = await memoryService.listMemories(ctx);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
}
```

3. **Update search_memories tool handler**:

```javascript
// MCP Tool: search_memories
{
  name: 'search_memories',
  description: 'Search memories using semantic or text search',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      scope: {
        type: 'string',
        enum: ['personal', 'organization', 'project'],
        default: 'personal',
      },
      project_id: {
        type: 'string',
      },
      type: {
        type: 'string',
        enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'],
      },
      limit: {
        type: 'number',
        default: 10,
      },
    },
    required: ['query'],
  },
  handler: async (args, context) => {
    const ctx = createQueryContext({
      user_id: context.user.user_id,
      organization_id: context.user.organization_id,
      api_key_id: context.user.api_key_id,
      scope: args.scope || 'personal',
      project_id: args.project_id,
      limit: args.limit,
      memory_type: args.type,
      search_query: args.query,
      channel: 'mcp',
      request_id: context.request_id,
    });

    const memoryService = createMemoryService(supabase);
    const result = await memoryService.searchMemories(ctx);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
}
```

---

# Phase 4: Update CLI & SDK

## Task 4.1: Update CLI Memory Commands

### File to modify: CLI package (location TBD based on repo structure)

```typescript
// CLI memory list command
import { createQueryContext, createMemoryService } from '@lanonasis/core';
import { createClient } from '@supabase/supabase-js';

interface ListOptions {
  scope?: 'personal' | 'organization' | 'project';
  projectId?: string;
  type?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export async function listMemories(options: ListOptions): Promise<void> {
  const config = await getConfig(); // Get stored auth config
  
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);
  
  const ctx = createQueryContext({
    user_id: config.userId,
    organization_id: config.organizationId,
    api_key_id: config.apiKeyId,
    scope: options.scope ?? 'personal',
    project_id: options.projectId,
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
    memory_type: options.type as any,
    tags: options.tags,
    channel: 'cli',
  });

  const memoryService = createMemoryService(supabase);
  const result = await memoryService.listMemories(ctx);

  // Output result
  console.log(JSON.stringify(result, null, 2));
}
```

## Task 4.2: Create SDK Package

### File: `packages/sdk/src/index.ts`

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  createQueryContext,
  createMemoryService,
  MemoryService,
  QueryContext,
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  PaginatedResponse,
  MemorySearchResult,
  MemoryScope,
  MemoryType,
} from '@lanonasis/core';

export interface LanOnasisConfig {
  apiKey: string;
  baseUrl?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface AuthContext {
  userId: string;
  organizationId: string;
  apiKeyId: string;
}

export class LanOnasisClient {
  private supabase: SupabaseClient;
  private memoryService: MemoryService;
  private authContext: AuthContext | null = null;

  constructor(private config: LanOnasisConfig) {
    this.supabase = createClient(
      config.supabaseUrl || 'https://mxtsdgkwzjzlttpotole.supabase.co',
      config.supabaseKey || process.env.SUPABASE_ANON_KEY!
    );
    this.memoryService = createMemoryService(this.supabase);
  }

  /**
   * Authenticate with API key and retrieve user context.
   */
  async authenticate(): Promise<AuthContext> {
    // Call auth endpoint to validate API key and get user context
    const response = await fetch(`${this.config.baseUrl || 'https://api.lanonasis.com'}/v1/auth/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.authContext = {
      userId: data.user_id,
      organizationId: data.organization_id,
      apiKeyId: data.api_key_id,
    };

    return this.authContext;
  }

  /**
   * List memories with optional filters.
   */
  async listMemories(options: {
    scope?: MemoryScope;
    projectId?: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<Memory>> {
    await this.ensureAuthenticated();

    const ctx = createQueryContext({
      user_id: this.authContext!.userId,
      organization_id: this.authContext!.organizationId,
      api_key_id: this.authContext!.apiKeyId,
      scope: options.scope ?? 'personal',
      project_id: options.projectId,
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      memory_type: options.type,
      tags: options.tags,
      channel: 'sdk',
    });

    return this.memoryService.listMemories(ctx);
  }

  /**
   * Search memories.
   */
  async searchMemories(
    query: string,
    options: {
      scope?: MemoryScope;
      projectId?: string;
      type?: MemoryType;
      limit?: number;
    } = {}
  ): Promise<PaginatedResponse<MemorySearchResult>> {
    await this.ensureAuthenticated();

    const ctx = createQueryContext({
      user_id: this.authContext!.userId,
      organization_id: this.authContext!.organizationId,
      api_key_id: this.authContext!.apiKeyId,
      scope: options.scope ?? 'personal',
      project_id: options.projectId,
      limit: options.limit ?? 10,
      offset: 0,
      memory_type: options.type,
      search_query: query,
      channel: 'sdk',
    });

    return this.memoryService.searchMemories(ctx);
  }

  /**
   * Create a new memory.
   */
  async createMemory(input: CreateMemoryInput): Promise<Memory> {
    await this.ensureAuthenticated();

    const ctx = createQueryContext({
      user_id: this.authContext!.userId,
      organization_id: this.authContext!.organizationId,
      api_key_id: this.authContext!.apiKeyId,
      scope: 'personal',
      channel: 'sdk',
    });

    return this.memoryService.createMemory(ctx, input);
  }

  /**
   * Update an existing memory.
   */
  async updateMemory(input: UpdateMemoryInput): Promise<Memory> {
    await this.ensureAuthenticated();

    const ctx = createQueryContext({
      user_id: this.authContext!.userId,
      organization_id: this.authContext!.organizationId,
      api_key_id: this.authContext!.apiKeyId,
      scope: 'personal',
      channel: 'sdk',
    });

    return this.memoryService.updateMemory(ctx, input);
  }

  /**
   * Delete a memory.
   */
  async deleteMemory(memoryId: string): Promise<void> {
    await this.ensureAuthenticated();

    const ctx = createQueryContext({
      user_id: this.authContext!.userId,
      organization_id: this.authContext!.organizationId,
      api_key_id: this.authContext!.apiKeyId,
      scope: 'personal',
      channel: 'sdk',
    });

    return this.memoryService.deleteMemory(ctx, memoryId);
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.authContext) {
      await this.authenticate();
    }
  }
}

// Factory function
export function createLanOnasisClient(config: LanOnasisConfig): LanOnasisClient {
  return new LanOnasisClient(config);
}

// Re-export types
export type {
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  PaginatedResponse,
  MemorySearchResult,
  MemoryScope,
  MemoryType,
};
```

---

# Phase 5: Cross-Channel Testing

## Task 5.1: Create Integration Test Suite

### File: `tests/integration/cross-channel-consistency.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

const TEST_API_KEY = process.env.TEST_API_KEY || 'lano_test_xxx';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.lanonasis.com';
const MCP_BASE_URL = process.env.MCP_BASE_URL || 'https://mcp.lanonasis.com';

interface MemoryResponse {
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    user_id: string;
  }>;
  pagination?: {
    total: number;
  };
  meta?: {
    scope: string;
  };
}

async function fetchViaRestApi(scope: string = 'personal'): Promise<MemoryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/memory?scope=${scope}&limit=50`, {
    headers: {
      'Authorization': `Bearer ${TEST_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

async function fetchViaMcp(scope: string = 'personal'): Promise<MemoryResponse> {
  const response = await fetch(`${MCP_BASE_URL}/api/v1/memory?scope=${scope}&limit=50`, {
    headers: {
      'Authorization': `Bearer ${TEST_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

describe('Cross-Channel Consistency', () => {
  describe('Personal Scope', () => {
    it('REST API and MCP should return same memories in personal scope', async () => {
      const [apiResult, mcpResult] = await Promise.all([
        fetchViaRestApi('personal'),
        fetchViaMcp('personal'),
      ]);

      expect(apiResult.success).toBe(true);
      expect(mcpResult.success).toBe(true);

      const apiIds = apiResult.data.map(m => m.id).sort();
      const mcpIds = mcpResult.data.map(m => m.id).sort();

      expect(apiIds).toEqual(mcpIds);
    });

    it('All returned memories should belong to authenticated user', async () => {
      const result = await fetchViaRestApi('personal');
      
      expect(result.success).toBe(true);
      
      // All memories should have the same user_id
      const userIds = new Set(result.data.map(m => m.user_id));
      expect(userIds.size).toBeLessThanOrEqual(1);
    });
  });

  describe('Organization Scope', () => {
    it('REST API and MCP should return same memories in org scope', async () => {
      const [apiResult, mcpResult] = await Promise.all([
        fetchViaRestApi('organization'),
        fetchViaMcp('organization'),
      ]);

      expect(apiResult.success).toBe(true);
      expect(mcpResult.success).toBe(true);

      const apiIds = apiResult.data.map(m => m.id).sort();
      const mcpIds = mcpResult.data.map(m => m.id).sort();

      expect(apiIds).toEqual(mcpIds);
    });

    it('Organization scope should return more memories than personal', async () => {
      const [personalResult, orgResult] = await Promise.all([
        fetchViaRestApi('personal'),
        fetchViaRestApi('organization'),
      ]);

      // Org scope should have >= personal scope memories
      expect(orgResult.pagination?.total).toBeGreaterThanOrEqual(
        personalResult.pagination?.total || 0
      );
    });
  });

  describe('Scope Parameter', () => {
    it('Should include scope in response meta', async () => {
      const result = await fetchViaRestApi('personal');
      
      expect(result.meta?.scope).toBe('personal');
    });

    it('Should default to personal scope when not specified', async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/memory?limit=50`, {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`,
        },
      });
      const result = await response.json();
      
      expect(result.meta?.scope).toBe('personal');
    });
  });
});
```

---

# Phase 6: Documentation & Rollout

## Task 6.1: Update API Documentation

### File: `docs/api/memory.md`

```markdown
# Memory API Reference

## Overview

The Memory API provides CRUD operations for managing memories across all LanOnasis channels.

## Authentication

All requests require a valid API key in the Authorization header:

```

Authorization: Bearer lano_xxx...

```

## Scoping

Memories can be scoped to control visibility:

| Scope | Description | Filter Applied |
|-------|-------------|----------------|
| `personal` (default) | Only your memories | `user_id = authenticated_user` |
| `organization` | All org memories | `organization_id = user_org` |
| `project` | Project-specific | `topic_id = project_id` |

## Endpoints

### List Memories

```

GET /api/v1/memory

```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scope` | string | `personal` | `personal`, `organization`, or `project` |
| `project_id` | string | - | Required when scope is `project` |
| `type` | string | - | Filter by memory type |
| `tags` | string[] | - | Filter by tags |
| `limit` | number | 20 | Max results (1-100) |
| `offset` | number | 0 | Pagination offset |

**Example:**

```bash
# Personal memories (default)
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.lanonasis.com/api/v1/memory?scope=personal"

# Organization memories
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.lanonasis.com/api/v1/memory?scope=organization"

# Project memories
curl -H "Authorization: Bearer $API_KEY" \
  "https://api.lanonasis.com/api/v1/memory?scope=project&project_id=xxx"
```

**Response:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 92,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "meta": {
    "scope": "personal",
    "request_id": "xxx"
  }
}
```

### Search Memories

```
GET /api/v1/memory/search
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `scope` | string | No | Scope filter |
| `type` | string | No | Memory type filter |
| `limit` | number | No | Max results |

### Create Memory

```
POST /api/v1/memory
```

**Body:**

```json
{
  "title": "Memory Title",
  "content": "Memory content...",
  "type": "context",
  "tags": ["tag1", "tag2"],
  "project_id": "optional-topic-id",
  "is_private": false
}
```

## Migration Guide

### From v1 (org-scoped) to v2 (personal-scoped default)

If your application relied on organization-scoped results, add `?scope=organization` to your requests:

**Before (v1):**

```
GET /api/v1/memory
```

**After (v2):**

```
GET /api/v1/memory?scope=organization
```

```

---

## Task 6.2: Create Migration Checklist

### File: `MIGRATION_CHECKLIST.md`

```markdown
# Scope Migration Checklist

## Pre-Migration

- [ ] Review current API usage patterns
- [ ] Identify clients that expect org-scoped results
- [ ] Notify stakeholders of upcoming changes
- [ ] Create test API keys for validation

## Phase 1: Core Package (Day 1-2)

- [ ] Create `packages/core` directory structure
- [ ] Implement `QueryContext` types
- [ ] Implement `ContextBuilder`
- [ ] Implement `MemoryService`
- [ ] Write unit tests
- [ ] Run tests: `cd packages/core && npm test`

## Phase 2: REST API (Day 3)

- [ ] Import `@lanonasis/core` in `maas-api.js`
- [ ] Update GET `/api/v1/memory` handler
- [ ] Update POST `/api/v1/memory` handler
- [ ] Update GET `/api/v1/memory/search` handler
- [ ] Add backward compatibility middleware
- [ ] Deploy to Netlify staging
- [ ] Validate with test API key

## Phase 3: MCP Server (Day 4)

- [ ] Deploy `@lanonasis/core` to VPS
- [ ] Update MCP tool handlers
- [ ] Restart MCP server
- [ ] Validate with test API key

## Phase 4: Cross-Channel Testing (Day 5)

- [ ] Run consistency tests
- [ ] Compare REST API vs MCP results
- [ ] Verify scope parameter works correctly
- [ ] Test backward compatibility

## Phase 5: Rollout (Day 6)

- [ ] Update documentation
- [ ] Notify users of new `scope` parameter
- [ ] Monitor logs for deprecation warnings
- [ ] Remove deprecation warnings after 2 weeks

## Rollback Plan

If issues are detected:

1. Revert `maas-api.js` to previous version
2. Redeploy to Netlify
3. Restart MCP server with previous code
4. Investigate and fix issues
5. Re-attempt migration
```

---

# Execution Instructions for Claude Code

## Order of Execution

1. **Create directory structure first**

   ```bash
   mkdir -p packages/core/src/{types,services,utils}
   mkdir -p packages/core/tests/fixtures
   mkdir -p tests/integration
   ```

2. **Create core package files in order:**
   - `packages/core/package.json`
   - `packages/core/tsconfig.json`
   - `packages/core/vitest.config.ts`
   - `packages/core/src/types/scope.ts`
   - `packages/core/src/types/query-context.ts`
   - `packages/core/src/types/memory.ts`
   - `packages/core/src/types/index.ts`
   - `packages/core/src/utils/errors.ts`
   - `packages/core/src/utils/validation.ts`
   - `packages/core/src/utils/index.ts`
   - `packages/core/src/services/context-builder.ts`
   - `packages/core/src/services/memory-service.ts`
   - `packages/core/src/services/index.ts`
   - `packages/core/src/index.ts`

3. **Run tests after core package:**

   ```bash
   cd packages/core
   npm install
   npm test
   ```

4. **Update existing files only after tests pass**

## Validation Commands

```bash
# Validate core package
cd packages/core && npm test

# Validate REST API locally
netlify dev

# Test API with curl
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8888/api/v1/memory?scope=personal"

# Run integration tests
npm run test:integration
```

## Success Criteria

- [ ] All unit tests pass
- [ ] REST API returns memories filtered by scope
- [ ] MCP returns memories filtered by scope
- [ ] Both channels return identical results for same scope
- [ ] `scope` parameter defaults to `personal`
- [ ] Backward compatibility preserved (deprecation warning only)

---

*End of Implementation Guide*

---

# Appendix A: Infrastructure Quick Reference

## Critical File Locations

### Netlify Functions (onasis-core repo)

```
netlify/functions/
├── maas-api.js           # Memory REST API - MODIFY in Phase 2
├── mcp-message.js        # ❌ FIX IN PHASE 0 (queries wrong schema)
├── api-gateway.js        # Route handler
├── cli-auth.js           # CLI authentication
└── health.js             # Health checks
```

### VPS MCP Server (/opt/lanonasis/mcp-core)

```
src/
├── index.ts              # Express server + MCP handlers
├── core/
│   └── auth-handler.ts   # API key validation (lines 191-260)
├── tools/
│   └── memory-tool.ts    # Memory CRUD operations
└── services/
    └── search.ts         # Vector search (match_memories RPC)
```

## Database Quick Reference

### Supabase Project

- **Project ID**: `mxtsdgkwzjzlttpotole`
- **URL**: `https://mxtsdgkwzjzlttpotole.supabase.co`
- **Region**: (check dashboard)

### Key Tables

```sql
-- Memory storage (USE THIS ONE)
public.memory_entries (92 rows)

-- User mapping (POPULATE IN PHASE 0)
public.users (0 rows → should be 10+)

-- API keys
public.api_keys (26 rows)

-- Organization
public.organizations (1 row: Lanonasis)
```

### Key UUIDs

```
DEFAULT_ORGANIZATION_ID = 'ba2c1b22-3c4d-4a5b-aca3-881995d863d5'
SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'  # Orphaned
TEST_USER_ID = 'c482cb8c-dc40-41dc-986d-daf0bcb078e5'    # info@lanonasis.com
ADMIN_USER_ID = 'b990c45e-8bf0-44d2-aeb6-6503ee08d152'   # admin@lanonasis.com
```

### Test API Key

```
Name: "ARM Testing"
Key: lano_nmpidur33vcn2t8qh61iffy08ulyerd5
User: c482cb8c-dc40-41dc-986d-daf0bcb078e5
Expected Memories: 22 (personal scope)
```

## PM2 Services (VPS)

```bash
# Check running services
pm2 list

# Expected services
┌────┬─────────────────┬─────────────┬─────────┬──────────┐
│ id │ name            │ mode        │ status  │ port     │
├────┼─────────────────┼─────────────┼─────────┼──────────┤
│ 0  │ mcp-core        │ fork        │ online  │ 3001     │
│ 1  │ auth-gateway    │ fork        │ online  │ 4000     │
│ 2  │ sse-server      │ fork        │ online  │ 3003     │
│ ... │ ...            │ ...         │ ...     │ ...      │
└────┴─────────────────┴─────────────┴─────────┴──────────┘

# Restart after changes
pm2 restart mcp-core
pm2 logs mcp-core --lines 50
```

## Netlify Deployment

```bash
# Deploy from onasis-core repo
netlify deploy --prod

# Or via Git push (if CI configured)
git push origin main
```

---

# Appendix B: Rollback Procedures

## If Phase 0 Causes Issues

### Rollback mcp-message.js

```bash
# Revert to maas schema (temporary)
git checkout HEAD~1 -- netlify/functions/mcp-message.js
netlify deploy --prod
```

### Rollback public.users population

```sql
-- Remove added users (keeps auth.users intact)
DELETE FROM public.users 
WHERE created_at > '2024-12-20';  -- Adjust date
```

## If Scope Implementation Causes Issues

### Rollback maas-api.js

```bash
# Revert memory endpoint changes
git checkout HEAD~1 -- netlify/functions/maas-api.js
netlify deploy --prod
```

### Rollback MCP Server

```bash
# On VPS
cd /opt/lanonasis/mcp-core
git checkout HEAD~1 -- src/tools/memory-tool.ts
npm run build
pm2 restart mcp-core
```

---

# Appendix C: Monitoring & Debugging

## Log Locations

### Netlify Functions

```
# Via Netlify CLI
netlify functions:log maas-api

# Via Dashboard
https://app.netlify.com/sites/[site]/functions
```

### VPS MCP Server

```bash
# Real-time logs
pm2 logs mcp-core

# Historical logs
cat ~/.pm2/logs/mcp-core-out.log | tail -100
cat ~/.pm2/logs/mcp-core-error.log | tail -100
```

## Key Log Patterns to Watch

```bash
# Successful scope resolution
grep "scope=" ~/.pm2/logs/mcp-core-out.log

# Auth failures
grep -E "(AUTH|UNAUTHORIZED)" ~/.pm2/logs/mcp-core-error.log

# Memory query issues
grep "MEMORY_LIST" ~/.pm2/logs/mcp-core-out.log
```

## Health Check Endpoints

```bash
# REST API health
curl https://api.lanonasis.com/health

# MCP health
curl https://mcp.lanonasis.com/health

# Auth gateway health
curl https://auth.lanonasis.com/v1/auth/health
```

---

*End of Implementation Guide*
*Version: 2.0 (Infrastructure Aligned)*
*Generated: 2024-12-20*
