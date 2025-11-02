# Project Mapping & Schema Allocation Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025  
**Total Schemas:** 40 | **Total Tables:** 144

---

## Architecture Overview

The Fixer Initiative database uses a **domain-driven, multi-tenant architecture** with schema isolation.

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                    CONTROL LAYER (34 tables)                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ control_room   │  │ auth            │  │ auth_gateway    │ │
│  │ 8 tables       │  │ 18 tables       │  │ 8 tables        │ │
│  │ • Apps         │  │ • OAuth/SAML    │  │ • API Clients   │ │
│  │ • Metrics      │  │ • Users/Sessions│  │ • Admin Access  │ │
│  └────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER (15 tables)                │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ agent_banks          │  │ app_sd_ghost                 │    │
│  │ 6 tables             │  │ 9 tables                     │    │
│  │ • AI Memory          │  │ • Memory-as-a-Service        │    │
│  │ • Sessions           │  │ • Vector Search              │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              APPLICATION LAYER (54 tables = 18 × 3)             │
│  app_apple • app_credit_as_a_service • app_lanonasis_maas      │
│  app_logistics • app_mcp_monorepo • app_onasis_core            │
│  app_saas • app_seftec • app_seftec_bank_insights              │
│  app_seftec_shop • app_seftechub • app_seftechub_verification  │
│  app_social_connect • app_sub_pro • app_task_manager           │
│  app_the_fixer_initiative • app_vibe_frontend • app_vortexcore │
│                                                                 │
│  Each app has: users, profiles, settings                       │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SHARED SERVICES (23 tables)                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐ │
│  │ analytics  │ │ billing    │ │ vendors    │ │ shared_svc  │ │
│  │ 3 tables   │ │ 3 tables   │ │ 3 tables   │ │ 3 tables    │ │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘ │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │ client_services  │  │ credit                              │ │
│  │ 5 tables         │  │ 3 tables                            │ │
│  └──────────────────┘  └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LEGACY LAYER (19 tables)                   │
│  public (18) • neon_auth (1)                                    │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

---

## Complete Schema Map

### Central Hub (34 tables)

#### control_room (8 tables)
**Purpose:** Application registry & orchestration  
**Tables:**
- `apps` - Application registry (52 apps)
- `users` - Control room users
- `profiles` - User profiles
- `settings` - User settings
- `user_app_access` - Permission mapping
- `service_endpoints` - Endpoint discovery
- `metrics` - System metrics
- `audit_log` - Activity logging

#### auth (18 tables)
**Purpose:** Centralized authentication  
**Tables:**
- `users` - Primary identities
- `identities` - Linked providers (Google, GitHub, etc.)
- `sessions` - Active sessions
- `refresh_tokens` - Token refresh
- `mfa_factors` - Multi-factor auth
- `mfa_challenges` - MFA verification
- `mfa_amr_claims` - Auth method refs
- `oauth_clients` - OAuth 2.0 apps
- `oauth_authorizations` - User grants
- `oauth_consents` - User consents
- `saml_providers` - SAML IdPs
- `saml_relay_states` - SAML flow state
- `sso_providers` - Generic SSO
- `sso_domains` - Email → SSO mapping
- `one_time_tokens` - Password reset/verification
- `audit_log_entries` - Auth events
- `flow_state` - OAuth/SAML state
- `instances` - Multi-instance support

#### auth_gateway (8 tables)
**Purpose:** API gateway & admin access  
**Tables:**
- `api_clients` - API keys
- `sessions` - Gateway sessions
- `auth_codes` - OAuth auth codes
- `user_accounts` - Gateway users
- `admin_sessions` - Admin portal
- `admin_access_log` - Admin actions
- `admin_override` - Emergency access
- `audit_log` - Comprehensive audit

---

### Infrastructure Layer (15 tables)

#### agent_banks (6 tables)
**Purpose:** AI memory & execution  
**Tables:**
- `memories` - Core memory storage (vector embeddings)
- `memory_search_logs` - Search history
- `sessions` - AI conversation sessions
- `users` - Agent users
- `profiles` - Agent profiles
- `settings` - Agent settings

#### app_sd_ghost (9 tables)
**Purpose:** Memory-as-a-Service  
**Tables:**
- `memory_entries` - Persistent memories
- `memory_access_patterns` - Usage analytics
- `memory_search_analytics` - Search metrics
- `ai_recommendations` - AI suggestions
- `ai_response_cache` - Cached responses
- `ai_usage_logs` - API usage tracking
- `users` - SD-Ghost users
- `profiles` - User profiles
- `settings` - User settings

---

### Application Layer (54 tables)

Each of 18 apps has 3 standard tables: `users`, `profiles`, `settings`

1. **app_apple** - Apple ecosystem integration
2. **app_credit_as_a_service** - Credit marketplace
3. **app_lanonasis_maas** - Memory-as-a-Service frontend
4. **app_logistics** - Fleet & supply chain
5. **app_mcp_monorepo** - MCP protocol integration
6. **app_onasis_core** - Core platform services
7. **app_saas** - SaaS template
8. **app_seftec** - Seftec platform
9. **app_seftec_bank_insights** - Financial analytics
10. **app_seftec_shop** - E-commerce
11. **app_seftechub** - B2B trade platform
12. **app_seftechub_verification_service** - KYC/verification
13. **app_social_connect** - Social networking
14. **app_sub_pro** - Subscription management
15. **app_task_manager** - Productivity
16. **app_the_fixer_initiative** - Main platform
17. **app_vibe_frontend** - UI/UX services
18. **app_vortexcore** - Core engine

---

### Shared Services (23 tables)

#### analytics (3 tables)
**Purpose:** Usage tracking  
**Tables:** `users`, `profiles`, `settings`

#### billing (3 tables)
**Purpose:** Payment processing  
**Tables:** `users`, `profiles`, `settings`

#### vendors (3 tables)
**Purpose:** Third-party APIs  
**Tables:** `users`, `profiles`, `settings`

#### shared_services (3 tables)
**Purpose:** Cross-app utilities  
**Tables:** `users`, `profiles`, `settings`

#### client_services (5 tables)
**Purpose:** Multi-tenant orgs  
**Tables:**
- `organizations`
- `accounts`
- `billing_records`
- `transactions`
- `usage_logs`

#### credit (3 tables)
**Purpose:** Credit marketplace  
**Tables:**
- `providers`
- `applications`
- `bids`

---

### Legacy Layer (19 tables)

#### public (18 tables)
Historical tables being migrated:
- `profiles`, `organizations`, `teams`, `team_members`
- `tasks`, `sub_tasks`, `task_dependencies`, `task_priorities`, `task_statuses`
- `projects`, `project_stages`, `project_teams`, `company_projects`
- `beneficiaries`, `bulk_payments`
- `api_keys`, `ai_recommendations`
- `simple_users`, `playing_with_neon`

#### neon_auth (1 table)
**Purpose:** Auth synchronization  
**Tables:** `users_sync`

---

## Naming Conventions

### Schemas
- **Control:** `control_room`, `auth`, `auth_gateway`
- **Apps:** `app_*` prefix (e.g., `app_your_service`)
- **Infrastructure:** descriptive names (`agent_banks`, `app_sd_ghost`)
- **Shared:** descriptive names (`billing`, `vendors`, `analytics`)

### Tables
- **Singular nouns:** `user`, `profile`, `setting` (not users)
- **Descriptive:** `memory_search_log`, `oauth_client`
- **Standard pattern:** All apps have `users`, `profiles`, `settings`

### Columns
- **IDs:** `id` (UUID primary key), `user_id`, `app_id`
- **Timestamps:** `created_at`, `updated_at`, `deleted_at`
- **Metadata:** `metadata` (JSONB for flexible storage)
- **Status:** `status`, `is_active`, `is_deleted`

---

## Data Flow

### User Authentication Flow
\`\`\`
1. User → auth_gateway.api_clients (API key check)
2. User → auth.users (identity verification)
3. User → auth.sessions (session creation)
4. User → control_room.user_app_access (permission check)
5. User → app_*.users (app access)
\`\`\`

### AI Memory Flow
\`\`\`
1. Query → agent_banks.memories (vector search)
2. Result → agent_banks.memory_search_logs (track search)
3. Response → app_sd_ghost.ai_response_cache (cache)
4. Usage → app_sd_ghost.ai_usage_logs (track costs)
\`\`\`

### Multi-Tenant Flow
\`\`\`
1. Org → client_services.organizations (tenant)
2. User → client_services.accounts (org member)
3. Usage → client_services.usage_logs (track)
4. Bill → client_services.billing_records (charge)
\`\`\`

---

## Best Practices

### When to Create New Schema
- ✅ New major application/service
- ✅ Strong domain boundary
- ✅ Independent deployment
- ❌ Simple feature addition
- ❌ Temporary table

### When to Use Existing Schema
- ✅ Extends existing functionality
- ✅ Shares lifecycle with parent
- ✅ Tightly coupled data
- ✅ Same access patterns

### Standard Table Pattern
All apps should include:
\`\`\`sql
CREATE TABLE app_name.users (...);
CREATE TABLE app_name.profiles (...);
CREATE TABLE app_name.settings (...);
\`\`\`

---

## Migration Path

### Adding New App
1. Register in `control_room.apps`
2. Create `app_*` schema
3. Add standard tables (users, profiles, settings)
4. Grant permissions
5. Register endpoints in `control_room.service_endpoints`

### Deprecating App
1. Mark `control_room.apps.status = 'deprecated'`
2. Revoke `control_room.user_app_access`
3. Archive data
4. Drop schema after grace period

---

## Quick Reference

### Count Tables by Schema
\`\`\`sql
SELECT 
    schemaname,
    COUNT(*) as table_count
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY table_count DESC;
\`\`\`

### Find App by Name
\`\`\`sql
SELECT app_id, app_name, target_schema, status
FROM control_room.apps
WHERE app_name ILIKE '%task%';
\`\`\`

### Check Schema Size
\`\`\`sql
SELECT 
    schemaname,
    pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) as size
FROM pg_tables
WHERE schemaname = 'app_your_service'
GROUP BY schemaname;
\`\`\`

✅ **Schema map complete!**
