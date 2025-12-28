# Supabase Direct API Routes

**Base URL:** `https://lanonasis.supabase.co`
**Project Ref:** `mxtsdgkwzjzlttpotole`
**Last Updated:** 2025-12-27

> **Note:** These routes bypass Netlify routing and connect directly to Supabase.
> For production use via `api.lanonasis.com`, see the `_redirects` configuration.

---

## Authentication

All authenticated endpoints require one of:

| Header | Format | Example |
|--------|--------|---------|
| `X-API-Key` | `lano_*`, `vibe_*`, `sk_*`, `pk_*` | `X-API-Key: lano_master_key_2024` |
| `Authorization` | `Bearer <token>` | `Authorization: Bearer lano_master_key_2024` |
| `apikey` | Supabase anon/service key | For PostgREST direct access |

---

## Edge Functions (`/functions/v1/...`)

### Memory & MaaS API (Complete - 2025-12-27)

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `memory-create` | POST | `/functions/v1/memory-create` | ✅ | Create memory with auto-embedding generation |
| `memory-get` | GET/POST | `/functions/v1/memory-get` | ✅ | Get single memory by ID |
| `memory-update` | POST/PUT/PATCH | `/functions/v1/memory-update` | ✅ | Update memory (re-embeds if content changes) |
| `memory-delete` | POST/DELETE | `/functions/v1/memory-delete` | ✅ | Delete single memory by ID |
| `memory-list` | GET/POST | `/functions/v1/memory-list` | ✅ | List memories with pagination & filtering |
| `memory-search` | POST | `/functions/v1/memory-search` | ✅ | Semantic vector search with embeddings |
| `memory-stats` | GET/POST | `/functions/v1/memory-stats` | ✅ | Memory statistics and analytics |
| `memory-bulk-delete` | POST/DELETE | `/functions/v1/memory-bulk-delete` | ✅ | Bulk delete multiple memories |
| `system-health` | GET | `/functions/v1/system-health` | ❌ | Health check for MaaS API |

**Example - Memory Create:**
```bash
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-create" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lano_master_key_2024" \
  -d '{
    "title": "API Configuration Guide",
    "content": "Step-by-step guide for configuring the API...",
    "memory_type": "knowledge",
    "tags": ["api", "configuration", "guide"]
  }'
```

**Example - Memory Get:**
```bash
curl "https://lanonasis.supabase.co/functions/v1/memory-get?id=UUID_HERE" \
  -H "X-API-Key: lano_master_key_2024"
```

**Example - Memory Update:**
```bash
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-update" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lano_master_key_2024" \
  -d '{
    "id": "UUID_HERE",
    "title": "Updated Title",
    "content": "Updated content triggers re-embedding",
    "tags": ["updated", "example"]
  }'
```

**Example - Memory Delete:**
```bash
curl -X DELETE "https://lanonasis.supabase.co/functions/v1/memory-delete?id=UUID_HERE" \
  -H "X-API-Key: lano_master_key_2024"
```

**Example - Memory List:**
```bash
curl "https://lanonasis.supabase.co/functions/v1/memory-list?limit=10&type=knowledge&sortBy=updated_at&sortOrder=desc" \
  -H "X-API-Key: lano_master_key_2024"
```

**Example - Memory Search:**
```bash
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lano_master_key_2024" \
  -d '{
    "query": "how to configure MCP",
    "limit": 10,
    "threshold": 0.7,
    "memory_type": "knowledge"
  }'
```

**Example - Memory Stats:**
```bash
curl "https://lanonasis.supabase.co/functions/v1/memory-stats" \
  -H "X-API-Key: lano_master_key_2024"
```

**Example - Memory Bulk Delete:**
```bash
curl -X POST "https://lanonasis.supabase.co/functions/v1/memory-bulk-delete" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lano_master_key_2024" \
  -d '{
    "ids": ["uuid-1", "uuid-2", "uuid-3"]
  }'
```

---

### Intelligence API (2025-12-26)

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `intelligence-health-check` | GET | `/functions/v1/intelligence-health-check` | ❌ | Intelligence API health |
| `intelligence-suggest-tags` | POST | `/functions/v1/intelligence-suggest-tags` | ✅ | AI-powered tag suggestions |
| `intelligence-find-related` | POST | `/functions/v1/intelligence-find-related` | ✅ | Find related memories |
| `intelligence-detect-duplicates` | POST | `/functions/v1/intelligence-detect-duplicates` | ✅ | Detect duplicate content |
| `intelligence-extract-insights` | POST | `/functions/v1/intelligence-extract-insights` | ✅ | Extract key insights from content |
| `intelligence-analyze-patterns` | POST | `/functions/v1/intelligence-analyze-patterns` | ✅ | Analyze usage patterns |

---

### API Key Management

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `generate-api-key` | POST | `/functions/v1/generate-api-key` | ✅ | Generate new API key |
| `hash-api-key` | POST | `/functions/v1/hash-api-key` | ✅ | Hash an API key |
| `verify-api-key` | POST | `/functions/v1/verify-api-key` | ✅ | Verify API key validity |
| `sync-api-key` | POST | `/functions/v1/sync-api-key` | ✅ | Sync API key across systems |
| `sync-user` | POST | `/functions/v1/sync-user` | ✅ | Sync user data |

---

### AI & Chat Functions

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `openai` | POST | `/functions/v1/openai` | ✅ | OpenAI API proxy |
| `openai-chat` | POST | `/functions/v1/openai-chat` | ✅ | OpenAI chat completions |
| `openai-assistant` | POST | `/functions/v1/openai-assistant` | ✅ | OpenAI Assistants API |
| `claude-ai` | POST | `/functions/v1/claude-ai` | ✅ | Claude AI integration |
| `gemini-ai` | POST | `/functions/v1/gemini-ai` | ✅ | Google Gemini AI |
| `ai-router` | POST | `/functions/v1/ai-router` | ✅ | Multi-provider AI router |
| `ai-chat` | POST | `/functions/v1/ai-chat` | ✅ | Universal AI chat |
| `nixie-ai` | POST | `/functions/v1/nixie-ai` | ✅ | Nixie AI assistant |
| `nixie-ai-streaming` | POST | `/functions/v1/nixie-ai-streaming` | ✅ | Nixie AI with streaming |
| `personalized-ai-chat` | POST | `/functions/v1/personalized-ai-chat` | ✅ | Personalized AI responses |
| `chat` | POST | `/functions/v1/chat` | ✅ | General chat endpoint |
| `generate-embedding` | POST | `/functions/v1/generate-embedding` | ✅ | Generate text embeddings |

---

### Authentication & Authorization

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `auth` | POST | `/functions/v1/auth` | ❌ | Authentication handler |
| `auth-hook-user-created` | POST | `/functions/v1/auth-hook-user-created` | ✅ | Webhook for new users |
| `auth-redirect-hook` | POST | `/functions/v1/auth-redirect-hook` | ✅ | Auth redirect handler |
| `callback-handler` | POST | `/functions/v1/callback-handler` | ✅ | OAuth callback handler |
| `verify` | POST | `/functions/v1/verify` | ✅ | Verification endpoint |

---

### Payment Integrations

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `stripe` | POST | `/functions/v1/stripe` | ✅ | Stripe API proxy |
| `stripe-webhook` | POST | `/functions/v1/stripe-webhook` | ❌ | Stripe webhooks |
| `stripe-subscription` | POST | `/functions/v1/stripe-subscription` | ✅ | Subscription management |
| `stripe-connect` | POST | `/functions/v1/stripe-connect` | ✅ | Stripe Connect |
| `stripe-issuing` | POST | `/functions/v1/stripe-issuing` | ✅ | Stripe Issuing |
| `create-stripe-checkout` | POST | `/functions/v1/create-stripe-checkout` | ✅ | Create checkout session |
| `create-checkout-session` | POST | `/functions/v1/create-checkout-session` | ✅ | Create checkout |
| `create-portal-session` | POST | `/functions/v1/create-portal-session` | ✅ | Customer portal |
| `paystack` | POST | `/functions/v1/paystack` | ✅ | Paystack integration |
| `paystack-integration` | POST | `/functions/v1/paystack-integration` | ✅ | Paystack API |
| `flutterwave` | POST | `/functions/v1/flutterwave` | ✅ | Flutterwave integration |
| `paypal-payment` | POST | `/functions/v1/paypal-payment` | ✅ | PayPal payments |
| `paypal-webhook` | POST | `/functions/v1/paypal-webhook` | ❌ | PayPal webhooks |
| `sayswitch` | POST | `/functions/v1/sayswitch` | ✅ | SaySwitch integration |
| `sayswitch-integration` | POST | `/functions/v1/sayswitch-integration` | ✅ | SaySwitch API |
| `sayswitch-bills` | POST | `/functions/v1/sayswitch-bills` | ✅ | Bill payments |
| `sayswitch-payment` | POST | `/functions/v1/sayswitch-payment` | ✅ | Payment processing |
| `sayswitch-transfer` | POST | `/functions/v1/sayswitch-transfer` | ✅ | Fund transfers |
| `sayswitch-webhook` | POST | `/functions/v1/sayswitch-webhook` | ❌ | SaySwitch webhooks |
| `payments-gateway` | POST | `/functions/v1/payments-gateway` | ✅ | Universal payment gateway |
| `payment` | POST | `/functions/v1/payment` | ✅ | Generic payment endpoint |
| `process-bulk-payment` | POST | `/functions/v1/process-bulk-payment` | ✅ | Bulk payment processing |

---

### EDOC (Electronic Documents)

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `edoc` | POST | `/functions/v1/edoc` | ✅ | EDOC API |
| `edocWebhook` | POST | `/functions/v1/edocWebhook` | ❌ | EDOC webhooks |
| `edoc-webhook` | POST | `/functions/v1/edoc-webhook` | ❌ | EDOC webhook handler |
| `edoc-dashboard` | GET | `/functions/v1/edoc-dashboard` | ✅ | Dashboard data |
| `edoc-consent` | POST | `/functions/v1/edoc-consent` | ✅ | Consent management |
| `edoc-transactions` | GET | `/functions/v1/edoc-transactions` | ✅ | Transaction history |
| `etl-daily-edoc` | POST | `/functions/v1/etl-daily-edoc` | ✅ | Daily ETL job |
| `consent-status` | GET | `/functions/v1/consent-status` | ✅ | Check consent status |
| `delete-consent` | DELETE | `/functions/v1/delete-consent` | ✅ | Delete consent |
| `init-consent` | POST | `/functions/v1/init-consent` | ✅ | Initialize consent |
| `prembly` | POST | `/functions/v1/prembly` | ✅ | Prembly verification |

---

### System & Utilities

| Function | Method | URL | Auth | Description |
|----------|--------|-----|------|-------------|
| `gateway` | ANY | `/functions/v1/gateway` | ✅ | API gateway |
| `client-api` | ANY | `/functions/v1/client-api` | ✅ | Client API |
| `health-check` | GET | `/functions/v1/health-check` | ❌ | System health check |
| `mcp-handler` | POST | `/functions/v1/mcp-handler` | ✅ | MCP protocol handler |
| `cache-cleanup` | POST | `/functions/v1/cache-cleanup` | ✅ | Cache cleanup job |
| `setup-cron-jobs` | POST | `/functions/v1/setup-cron-jobs` | ✅ | Setup scheduled jobs |
| `create-notification` | POST | `/functions/v1/create-notification` | ✅ | Create notification |
| `i18n-translator` | POST | `/functions/v1/i18n-translator` | ✅ | Translation service |
| `parent-dashboard` | GET | `/functions/v1/parent-dashboard` | ✅ | Parent dashboard data |
| `bizgenie-router` | POST | `/functions/v1/bizgenie-router` | ✅ | BizGenie routing |

---

## PostgREST Endpoints (`/rest/v1/...`)

Direct database access via auto-generated REST API.

### Core Tables

| Table | URL | Methods | Auth |
|-------|-----|---------|------|
| `memory_entries` | `/rest/v1/memory_entries` | GET, POST, PATCH, DELETE | ✅ |
| `organizations` | `/rest/v1/organizations` | GET, POST, PATCH, DELETE | ✅ |
| `users` | `/rest/v1/users` | GET, POST, PATCH, DELETE | ✅ |
| `api_keys` | `/rest/v1/api_keys` | GET, POST, PATCH, DELETE | ✅ |
| `projects` | `/rest/v1/projects` | GET, POST, PATCH, DELETE | ✅ |
| `configurations` | `/rest/v1/configurations` | GET, POST, PATCH, DELETE | ✅ |
| `audit_log` | `/rest/v1/audit_log` | GET, POST | ✅ |
| `topics` | `/rest/v1/topics` | GET, POST, PATCH, DELETE | ✅ |
| `sessions` | `/rest/v1/sessions` | GET, POST, PATCH, DELETE | ✅ |

**Example - List Memories:**
```bash
curl "https://lanonasis.supabase.co/rest/v1/memory_entries?limit=10" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

**Example - Get Memory by ID:**
```bash
curl "https://lanonasis.supabase.co/rest/v1/memory_entries?id=eq.UUID_HERE" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

---

## RPC Functions (`/rest/v1/rpc/...`)

Server-side functions callable via PostgREST.

| Function | URL | Method | Description |
|----------|-----|--------|-------------|
| `search_memories` | `/rest/v1/rpc/search_memories` | POST | Vector similarity search |
| `count_memories` | `/rest/v1/rpc/count_memories` | POST | Count memories by org |
| `memory_stats` | `/rest/v1/rpc/memory_stats` | POST | Memory statistics |

**Example - Vector Search via RPC:**
```bash
curl -X POST "https://lanonasis.supabase.co/rest/v1/rpc/search_memories" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
  -H "Content-Type: application/json" \
  -d '{
    "query_embedding": [0.1, 0.2, ...],
    "match_threshold": 0.7,
    "match_count": 10,
    "filter_organization_id": "org-uuid-here"
  }'
```

---

## URL Mapping Reference

| Public URL (api.lanonasis.com) | Direct Supabase URL | Description |
|-------------------------------|---------------------|-------------|
| `/api/v1/memory/search` | `/functions/v1/memory-search` | Semantic search |
| `/api/v1/memory/stats` | `/functions/v1/memory-stats` | Statistics |
| `/api/v1/memory/list` | `/functions/v1/memory-list` | Paginated list |
| `/api/v1/memory/update` | `/functions/v1/memory-update` | Update memory |
| `/api/v1/memory/delete` | `/functions/v1/memory-delete` | Delete single |
| `/api/v1/memory/bulk/delete` | `/functions/v1/memory-bulk-delete` | Bulk delete |
| `/api/v1/memory/health` | `/functions/v1/system-health` | Health check |
| `/api/v1/memory/:id` | `/functions/v1/memory-get` | Get by ID |
| `/api/v1/memory` (POST) | `/functions/v1/memory-create` | Create memory |
| `/api/v1/intelligence/*` | `/functions/v1/intelligence-*` | Intelligence API |

---

## Function Count by Category

| Category | Count |
|----------|-------|
| AI & Chat | 12 |
| Payment Integrations | 20 |
| EDOC | 11 |
| Authentication | 5 |
| API Key Management | 5 |
| Memory & MaaS | 9 |
| Intelligence | 6 |
| System & Utilities | 12 |
| **Total** | **80** |

---

## Quick Test Commands

```bash
# Test system health (no auth)
curl https://lanonasis.supabase.co/functions/v1/system-health

# Test memory search (with auth)
curl -X POST https://lanonasis.supabase.co/functions/v1/memory-search \
  -H "X-API-Key: lano_master_key_2024" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 5}'

# Test intelligence health (no auth)
curl https://lanonasis.supabase.co/functions/v1/intelligence-health-check

# Test PostgREST (requires anon key)
curl "https://lanonasis.supabase.co/rest/v1/organizations?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

---

**Document Version:** 1.0.0
**Generated:** 2025-12-27
**Total Edge Functions:** 74
**Total RPC Functions:** 3
