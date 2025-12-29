# Database Reorganization Guide
## DISRUPTOR Ecosystem - Supabase Database Restructuring

**Version:** 2.0
**Created:** December 22, 2025
**Updated:** December 29, 2025
**Status:** Planning Phase - NEW PROJECT APPROACH
**Current LIVE Project:** `mxtsdgkwzjzlttpotole` (https://mxtsdgkwzjzlttpotole.supabase.co - Production with 95+ tables in public)
**New EMPTY Project:** `hjplkyeuycajchayuylw` (Clean slate, no tables yet)
**Reference:** Neon DB structure at `ep-snowy-surf-adqqsawd-pooler.c-2.us-east-1.aws.neon.tech`

---

## ⚠️ **IMPORTANT: Migration Strategy Change**

**Previous Approach (DEPRECATED):** In-place migration with facade views in `public` schema
**NEW Approach (RECOMMENDED):** Create new Supabase project with clean schema architecture

### Why the Change?

The original plan used facade views to maintain backward compatibility, but this approach has critical issues:

1. **High Risk**: Any migration error breaks ALL production clients simultaneously
2. **No Fallback**: Can't rollback without database restore
3. **Complex Testing**: Can't test in production-like environment
4. **Schema Pollution**: Still dealing with 95+ tables in `public` schema

### New Approach Benefits

✅ **Zero Risk** - Production continues on old project
✅ **Easy Rollback** - Just switch environment variable back
✅ **Thorough Testing** - Test everything before switching
✅ **Clean Slate** - No legacy baggage
✅ **Parallel Operation** - Both projects run simultaneously during transition

---

## Executive Summary

This guide outlines the creation of a **NEW Supabase project** with proper schema architecture, followed by gradual traffic migration from the old project. The reorganization moves from a flat `public` schema (95+ tables) to a professional, domain-driven schema architecture.

### Key Principles

1. **Zero Breaking Changes** - Routing layer abstracts database location
2. **Gradual Migration** - Switch traffic incrementally (10% → 50% → 100%)
3. **Clean Architecture** - Proper schema separation from day one
4. **Professional Structure** - Mirror Neon database organization
5. **Easy Fallback** - Environment variable controls which project is used

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target Architecture](#target-architecture)
3. [Migration Strategy](#migration-strategy)
4. [Phase 1: New Project Setup](#phase-1-new-project-setup)
5. [Phase 2: Schema Creation](#phase-2-schema-creation)
6. [Phase 3: Edge Functions Migration](#phase-3-edge-functions-migration)
7. [Phase 4: Data Migration](#phase-4-data-migration)
8. [Phase 5: Routing Layer](#phase-5-routing-layer)
9. [Phase 6: Traffic Switchover](#phase-6-traffic-switchover)
10. [Testing & Validation](#testing--validation)
11. [Rollback Procedures](#rollback-procedures)
12. [GitHub Issues Tracking](#github-issues-tracking)

---

## Current State Analysis

### Problem Statement

The current Supabase database (`hjplkyeuycajchayuylw`) has grown organically with:
- **95+ tables** dumped in `public` schema
- **Duplicate tables** (e.g., `api_keys`, `stored_api_keys`, `vendor_api_keys`, `vendor_api_keys_v2`)
- **Mixed concerns** (memory, payments, auth, analytics, AI chat, e-commerce all co-located)
- **Unclear ownership** (which tables belong to which service?)
- **Difficult maintenance** (hard to reason about dependencies)

### Current Table Distribution

| Domain | Table Count | Location | Issues |
|--------|-------------|----------|--------|
| API Keys & Secrets | 14 | `public`, `maas` | 4 different API key tables, fragmented |
| Memory/Knowledge | 10 | `public`, `maas` | Duplicated across schemas |
| Auth & Identity | 9 | `public`, `maas` | Multiple user tables |
| Analytics & Logs | 9 | `public`, `maas`, `core` | Scattered everywhere |
| Payments & Billing | 9 | `public` | Mixed with vendor billing |
| Business/Finance | 7 | `public` | `edoc_*` and `business_*` mixed |
| User Settings | 8 | `public` | Reasonable |
| Marketplace | 7 | `public` | Clean domain |
| MCP Tools | 6 | `public` | Part of API keys domain |
| Vendor Management | 4 | `public` | Needs isolation |
| AI Chat Services | 12 | `public` | Mixed with everything |
| E-commerce | 8 | `public` | Mixed with business |

### Current Production Dependencies

Multiple platforms depend on the current database:

| Platform | Access Method | Critical? |
|----------|--------------|-----------|
| MCP Server | Edge Functions + PostgREST | ✅ Yes |
| REST API | Edge Functions | ✅ Yes |
| SDK (`@lanonasis/memory-client`) | REST API wrapper | ✅ Yes |
| CLI (`@lanonasis/cli`) | SDK | ✅ Yes |
| IDE Extensions (Cursor, Windsurf) | MCP Server | ✅ Yes |
| Web Dashboard | Supabase Client | ✅ Yes |
| Enterprise VPS | Direct PostgREST | ⚠️ Medium |
| Published Packages | Various | ⚠️ Medium |

**All must continue working during migration.**

---

## Target Architecture

### Schema Structure (Clean New Project)

```
NEW SUPABASE PROJECT (onasis-core-v2)
├── auth                        # Supabase managed (DO NOT TOUCH)
├── storage                     # Supabase managed (DO NOT TOUCH)
├── realtime                    # Supabase managed (DO NOT TOUCH)
│
├── public                      # ROUTING LAYER ONLY (if needed for compatibility)
│   └── ...                     # Optional compatibility views
│
├── security_service            # API Keys, Secrets, MCP Tools, Memory
│   ├── api_keys                # Consolidated API key table
│   ├── api_key_projects
│   ├── key_rotation_policies
│   ├── key_security_events
│   ├── key_usage_analytics
│   ├── stored_api_keys         # Third-party API keys
│   ├── mcp_key_tools
│   ├── mcp_key_sessions
│   ├── mcp_key_access_requests
│   ├── mcp_key_audit_log
│   ├── mcp_proxy_tokens
│   ├── memory_entries          # Memory with embeddings
│   ├── memory_chunks
│   ├── memory_versions
│   ├── organizations
│   ├── topics
│   └── users                   # Synced from auth.users
│
├── auth_gateway                # Authentication & Authorization
│   ├── user_accounts           # Primary user table
│   ├── sessions
│   ├── oauth_sessions
│   ├── oauth_clients
│   ├── oauth_tokens
│   ├── oauth_authorization_codes
│   ├── auth_events             # Event sourcing
│   ├── auth_codes
│   ├── audit_log
│   ├── admin_sessions
│   ├── admin_access_log
│   └── outbox                  # Event outbox pattern
│
├── shared_services             # Cross-cutting concerns
│   ├── profiles                # User profiles (public-facing)
│   ├── settings                # User settings
│   └── users                   # Minimal user reference
│
├── analytics                   # All logging & metrics
│   ├── usage_tracking
│   ├── user_activity_logs
│   ├── ai_usage_logs
│   ├── system_error_logs
│   ├── webhook_logs
│   ├── search_analytics
│   └── company_usage_logs
│
├── billing                     # Payments & Subscriptions
│   ├── subscriptions
│   ├── stripe_connect_accounts
│   ├── bulk_payments
│   ├── payment_items
│   ├── payment_audit
│   ├── beneficiaries
│   ├── user_payments
│   └── vendor_billing_records
│
├── vendors                     # Vendor/Platform Management
│   ├── organizations
│   ├── api_keys                # Vendor-specific keys
│   ├── platform_sessions
│   ├── usage_logs
│   └── billing_records
│
├── marketplace                 # E-commerce Features
│   ├── products
│   ├── orders
│   ├── order_items
│   ├── transactions
│   ├── pricing_insights
│   ├── recommendations
│   └── product_embeddings
│
├── ai_chat                     # AI Chat Services
│   ├── conversations
│   ├── messages
│   ├── chat_sessions
│   ├── chat_analytics
│   └── chat_embeddings
│
├── intelligence                # Intelligence API
│   ├── subscription_tiers
│   ├── user_subscriptions
│   ├── usage_logs
│   ├── cache
│   ├── voice_memories
│   ├── screenshot_memories
│   └── smart_recall_*
│
├── client_services             # Client/Customer Management
│   ├── organizations
│   ├── api_keys
│   ├── transactions
│   ├── usage_logs
│   └── billing_records
│
├── control_room                # Admin Cockpit
│   ├── apps                    # Registered applications
│   ├── project_stages
│   ├── project_audit_log
│   └── system_health
│
└── app_*                       # Per-application schemas
    ├── app_the_fixer_initiative
    ├── app_onasis_core
    ├── app_lanonasis_maas
    ├── app_seftec
    ├── app_seftechub
    └── ...
```

---

## Migration Strategy

### The Dual-Project Approach

Instead of migrating in-place, we:

1. **Create NEW Supabase project** with clean schema architecture
2. **Build routing layer** that can connect to EITHER project
3. **Migrate data** from old → new when ready
4. **Switch traffic incrementally** (10% → 50% → 100%)
5. **Keep old project** as fallback for 1-2 months

```
┌─────────────────────────────────────┐
│     OLD PROJECT (Current Prod)       │
│  Project: hjplkyeuycajchayuylw      │
│  Schema: public (95+ tables)        │
│       ↑                              │
│       │ 100% traffic initially       │
│       │                              │
│  [Untouched - Zero Risk]            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│     NEW PROJECT (Clean Setup)        │
│  Project: TBD                        │
│  Schemas: Organized (8+ schemas)    │
│       ↑                              │
│       │ 0% → 10% → 50% → 100%        │
│       │                              │
│  [Clean, tested, production-ready]  │
└─────────────────────────────────────┘

            ↑           ↑
            │           │
      ┌─────┴───────────┴─────┐
      │   ROUTING FACADE      │
      │  (Environment-Aware)   │
      │  process.env.SUPABASE_ │
      │  URL controls which    │
      └────────────────────────┘
```

### Benefits of This Approach

| Aspect | In-Place Migration | New Project |
|--------|-------------------|-------------|
| **Risk** | High (breaks all clients if error) | Zero (old project untouched) |
| **Testing** | Limited (can't test prod-like) | Full (exact production replica) |
| **Rollback** | Complex (restore from backup) | Instant (change env var) |
| **Downtime** | Potential hours | Zero |
| **Schema Quality** | Still dealing with legacy | Perfect from day one |
| **Stress** | High 😰 | Low 😎 |

---

## Phase 1: New Project Setup

**Duration:** 1-2 hours
**Risk:** Zero (no prod impact)

### 1.1 Create New Supabase Project

```bash
# Via Supabase Dashboard
1. Go to https://app.supabase.com
2. Click "New Project"
3. Name: "onasis-core-v2-production"
4. Region: Same as old project (for latency)
5. Database Password: Strong password (save in 1Password)
6. Plan: Pro (if old project is Pro)
7. Wait 2-3 minutes for provisioning
```

### 1.2 Record New Project Details

```bash
# Save these in your .env files
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD_NEW=your_strong_password_here
```

### 1.3 Initialize Supabase CLI

```bash
# Install Supabase CLI (if not already)
npm install -g supabase

# Link to new project
npx supabase link --project-ref xxxxxxxxxxxxx

# Pull remote schema (should be empty)
npx supabase db pull
```

---

## Phase 2: Schema Creation

**Duration:** 2-3 hours
**Risk:** Zero (isolated environment)

### 2.1 Create All Schemas

Create migration file: `supabase/migrations/001_create_schemas.sql`

```sql
-- ============================================================================
-- PHASE 2.1: Create All Domain Schemas
-- ============================================================================

-- Core service schemas
CREATE SCHEMA IF NOT EXISTS security_service;
CREATE SCHEMA IF NOT EXISTS auth_gateway;
CREATE SCHEMA IF NOT EXISTS shared_services;
CREATE SCHEMA IF NOT EXISTS control_room;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS vendors;
CREATE SCHEMA IF NOT EXISTS client_services;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS ai_chat;
CREATE SCHEMA IF NOT EXISTS intelligence;

-- Application-specific schemas
CREATE SCHEMA IF NOT EXISTS app_the_fixer_initiative;
CREATE SCHEMA IF NOT EXISTS app_onasis_core;
CREATE SCHEMA IF NOT EXISTS app_lanonasis_maas;
CREATE SCHEMA IF NOT EXISTS app_seftec;
CREATE SCHEMA IF NOT EXISTS app_seftechub;
CREATE SCHEMA IF NOT EXISTS app_vortexcore;
CREATE SCHEMA IF NOT EXISTS app_mcp_monorepo;

-- Grant permissions
DO $$
DECLARE
    schema_name TEXT;
BEGIN
    FOR schema_name IN
        SELECT unnest(ARRAY[
            'security_service', 'auth_gateway', 'shared_services',
            'control_room', 'analytics', 'billing', 'vendors',
            'client_services', 'marketplace', 'ai_chat', 'intelligence'
        ])
    LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', schema_name);
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', schema_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO authenticated', schema_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO authenticated', schema_name);
    END LOOP;
END $$;

-- Add documentation
COMMENT ON SCHEMA security_service IS 'API keys, secrets, memory service, MCP tools';
COMMENT ON SCHEMA auth_gateway IS 'Authentication, authorization, OAuth, sessions';
COMMENT ON SCHEMA shared_services IS 'Cross-cutting: profiles, settings';
COMMENT ON SCHEMA control_room IS 'Admin cockpit, app registry, system health';
COMMENT ON SCHEMA analytics IS 'Usage tracking, logs, metrics';
COMMENT ON SCHEMA billing IS 'Payments, subscriptions, invoicing';
COMMENT ON SCHEMA vendors IS 'Vendor/platform management';
COMMENT ON SCHEMA client_services IS 'Client organizations and their resources';
COMMENT ON SCHEMA marketplace IS 'E-commerce: products, orders, transactions';
COMMENT ON SCHEMA ai_chat IS 'AI chat services and conversations';
COMMENT ON SCHEMA intelligence IS 'Intelligence API features';
```

### 2.2 Create Security Service Tables

Create migration file: `supabase/migrations/002_security_service_schema.sql`

```sql
-- ============================================================================
-- PHASE 2.2: Security Service Schema
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Organizations
CREATE TABLE security_service.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    max_memories INTEGER DEFAULT 1000,
    max_storage_mb INTEGER DEFAULT 100,
    vector_search_enabled BOOLEAN DEFAULT true,
    current_memories_count INTEGER DEFAULT 0,
    current_storage_mb DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

-- Users (synced from auth.users)
CREATE TABLE security_service.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    organization_id UUID REFERENCES security_service.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    preferences JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- Memory Entries with Vector Embeddings
CREATE TABLE security_service.memory_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES security_service.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    topic_id UUID,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    type VARCHAR(50) DEFAULT 'context' CHECK (type IN (
        'context', 'project', 'knowledge', 'reference',
        'personal', 'workflow', 'note', 'document'
    )),
    tags TEXT[] DEFAULT '{}',
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0
);

-- API Keys (Consolidated)
CREATE TABLE security_service.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES security_service.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_type VARCHAR(50) DEFAULT 'standard',
    scopes TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_memory_entries_org ON security_service.memory_entries(organization_id);
CREATE INDEX idx_memory_entries_user ON security_service.memory_entries(user_id);
CREATE INDEX idx_memory_entries_embedding ON security_service.memory_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_api_keys_org ON security_service.api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON security_service.api_keys(key_prefix);
```

**(Continue with similar migrations for other schemas...)**

---

## Phase 3: Edge Functions Migration

**Duration:** 3-4 hours
**Risk:** Zero (isolated project)

### 3.1 Organized Edge Function Structure

```
supabase/functions/
├── _shared/
│   ├── auth.ts
│   ├── cors.ts
│   ├── errors.ts
│   ├── utils.ts
│   └── types.ts
│
├── memory/
│   ├── create/index.ts
│   ├── get/index.ts
│   ├── update/index.ts
│   ├── delete/index.ts
│   ├── list/index.ts
│   ├── search/index.ts
│   ├── stats/index.ts
│   └── bulk-delete/index.ts
│
├── intelligence/
│   ├── analyze-patterns/index.ts
│   ├── detect-duplicates/index.ts
│   ├── extract-insights/index.ts
│   ├── find-related/index.ts
│   ├── suggest-tags/index.ts
│   └── health-check/index.ts
│
└── ... (other domains)
```

### 3.2 Deploy to New Project

```bash
# Set secrets for new project
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Deploy all functions
npx supabase functions deploy

# Test each function
curl https://xxxxxxxxxxxxx.supabase.co/functions/v1/memory/create \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
  -d '{"title": "Test", "content": "Test content"}'
```

---

## Phase 4: Data Migration

**Duration:** 1-2 days (depending on data volume)
**Risk:** Low (read-only from old project)

### 4.1 Export Data from Old Project

```bash
# Full database dump
pg_dump "postgresql://<user>:<password>@<host>:<port>/<db>" \
  --schema=public \
  --data-only \
  --file=old_project_data.sql

# Or export specific tables
pg_dump "postgresql://<user>:<password>@<host>:<port>/<db>" \
  --table=memory_entries \
  --table=api_keys \
  --data-only \
  --file=critical_tables.sql
```

### 4.2 Transform and Import

```bash
# Transform data to match new schema structure
# Example: Move memory_entries to security_service schema

psql "postgresql://<user>:<password>@<host>:<port>/<db>" << EOF
-- Import to correct schema
SET search_path TO security_service, public;

COPY memory_entries (id, organization_id, user_id, title, content, type, tags, embedding, created_at)
FROM '/path/to/transformed_data.csv'
WITH CSV HEADER;
EOF
```

### 4.3 Verify Data Integrity

```sql
-- Compare row counts
SELECT
  'Old Project' as source,
  COUNT(*) as memory_count
FROM old_project.memory_entries
UNION ALL
SELECT
  'New Project' as source,
  COUNT(*) as memory_count
FROM security_service.memory_entries;

-- Verify embeddings migrated
SELECT COUNT(*) FROM security_service.memory_entries WHERE embedding IS NOT NULL;
```

---

## Phase 5: Routing Layer

**Duration:** 2-3 hours
**Risk:** Low (just configuration)

### 5.1 Environment-Aware Supabase Client

Create `lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

/**
 * Environment-aware Supabase client
 * Controlled by SUPABASE_ENV variable
 */
export const getSupabaseClient = () => {
  const env = process.env.SUPABASE_ENV || 'production';

  const configs = {
    production: {
      url: process.env.SUPABASE_URL=https://<project-ref>.supabase.co
      anonKey: process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    },
    v2: {
      url: process.env.SUPABASE_URL=https://<project-ref>.supabase.co
      anonKey: process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    },
  };

  const config = configs[env];

  if (!config) {
    throw new Error(`Invalid SUPABASE_ENV: ${env}`);
  }

  return createClient(config.url, config.anonKey);
};

// Singleton instance
export const supabase = getSupabaseClient();
```

### 5.2 Gradual Rollout Function

```typescript
import { createHash } from 'crypto';

/**
 * Determines which Supabase project to use based on rollout percentage
 */
export const getSupabaseClientWithRollout = (userId?: string) => {
  const rolloutPercentage = parseInt(process.env.V2_ROLLOUT_PERCENTAGE || '0', 10);

  if (rolloutPercentage === 0) {
    // Use old project
    return createClient(
      process.env.SUPABASE_URL=https://<project-ref>.supabase.co
      process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    );
  }

  if (rolloutPercentage === 100) {
    // Use new project
    return createClient(
      process.env.SUPABASE_URL=https://<project-ref>.supabase.co
      process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    );
  }

  // Gradual rollout: hash user ID to get consistent routing
  if (userId) {
    const hash = createHash('md5').update(userId).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const userPercentile = hashInt % 100;

    const useV2 = userPercentile < rolloutPercentage;

    return useV2
      ? createClient(process.env.SUPABASE_URL=https://<project-ref>.supabase.co
      : createClient(process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  }

  // No user ID: random assignment
  const random = Math.random() * 100;
  const useV2 = random < rolloutPercentage;

  return useV2
    ? createClient(process.env.SUPABASE_URL=https://<project-ref>.supabase.co
    : createClient(process.env.SUPABASE_URL=https://<project-ref>.supabase.co
};
```

### 5.3 Update All Clients

Update all services to use the new routing layer:

```typescript
// Before
import { supabase } from '@supabase/supabase-js';

// After
import { supabase } from '@/lib/supabase/client';

// Usage remains the same
const { data } = await supabase
  .from('memory_entries')
  .select('*');
```

---

## Phase 6: Traffic Switchover

**Duration:** 2-3 weeks (gradual)
**Risk:** Low (incremental with monitoring)

### Week 1: 10% Traffic

```bash
# Set environment variable
V2_ROLLOUT_PERCENTAGE=10

# Deploy to all services
# Monitor for errors in both old and new projects
```

### Week 2: 50% Traffic

```bash
V2_ROLLOUT_PERCENTAGE=50

# Continue monitoring
# Compare metrics between projects
```

### Week 3: 100% Traffic

```bash
V2_ROLLOUT_PERCENTAGE=100

# All traffic to new project
# Keep old project for 1-2 months as backup
```

### Week 8+: Decommission Old Project

```bash
# Archive old project
# Cancel subscription (if separate billing)
# Update documentation
```

---

## Testing & Validation

### Pre-Migration Checklist

- [ ] New project created and configured
- [ ] All schemas created
- [ ] All Edge Functions deployed
- [ ] Data migration tested with sample data
- [ ] Routing layer implemented
- [ ] All clients updated to use routing layer
- [ ] Environment variables configured

### Post-Migration Validation

```sql
-- Verify row counts match
SELECT
  'memory_entries' as table,
  (SELECT COUNT(*) FROM old.memory_entries) as old_count,
  (SELECT COUNT(*) FROM security_service.memory_entries) as new_count;

-- Test vector search
SELECT * FROM security_service.match_memories(
  '[0.1, 0.2, ...]'::vector,
  0.7,
  5
);
```

### Platform Testing

| Platform | Test | Expected Result |
|----------|------|-----------------|
| MCP Server | Run `memory_search` tool | Returns results |
| REST API | `curl /api/v1/memory` | 200 OK |
| SDK | Unit tests | All pass |
| CLI | `lanonasis memory search` | Returns results |
| Web Dashboard | CRUD operations | All work |

---

## Rollback Procedures

### Instant Rollback

```bash
# If new project has issues, rollback immediately
V2_ROLLOUT_PERCENTAGE=0

# Or completely switch back
SUPABASE_ENV=production
```

### Gradual Rollback

```bash
# Reduce traffic incrementally
V2_ROLLOUT_PERCENTAGE=50  # From 100%
V2_ROLLOUT_PERCENTAGE=10  # From 50%
V2_ROLLOUT_PERCENTAGE=0   # Back to old project
```

---

## GitHub Issues Tracking

### Epic: Database Reorganization (New Project)

**Issue #1: Create New Supabase Project**
- [ ] Create project via dashboard
- [ ] Record credentials
- [ ] Link Supabase CLI
- [ ] Verify connectivity

**Issue #2: Schema Architecture Setup**
- [ ] Create all domain schemas
- [ ] Grant permissions
- [ ] Add documentation
- [ ] Verify schema structure

**Issue #3: Data Migration**
- [ ] Export from old project
- [ ] Transform data
- [ ] Import to new project
- [ ] Verify integrity

**Issue #4: Routing Layer Implementation**
- [ ] Create environment-aware client
- [ ] Implement gradual rollout
- [ ] Update all services
- [ ] Test routing logic

**Issue #5: Traffic Switchover**
- [ ] Week 1: 10% traffic
- [ ] Week 2: 50% traffic
- [ ] Week 3: 100% traffic
- [ ] Monitor and validate

**Issue #6: Decommission Old Project**
- [ ] Archive old project
- [ ] Update documentation
- [ ] Cancel subscription
- [ ] Celebrate! 🎉

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-22 | Claude + Onasis | Initial draft (facade approach) |
| 2.0 | 2025-12-29 | Claude + Onasis | **NEW PROJECT APPROACH** |

---

## Next Steps

1. **Review this guide** - Ensure everyone understands the new approach
2. **Create new Supabase project** - Get started today
3. **Create GitHub issues** - Track implementation
4. **Begin Phase 1** - New project setup (2 hours, zero risk)
5. **Schedule team sync** - Align on timeline

**Ready to begin with Phase 1?** 🚀
