# Intelligence Edge Function Inventory

Last verified: 2026-06-26
Repo: `apps/onasis-core`
Scope: the 16 Supabase Edge Functions under `supabase/functions/intelligence-*`
Source of truth: EF source code in `supabase/functions/intelligence-*/index.ts`, plus routing config in `_redirects`, `deploy/nginx-unified.conf`, `services/auth-gateway/nginx-unified.conf`, and MaaS profile routes in `apps/lanonasis-maas/src/routes/profiles.ts`.

## Shared contract rules

- All HTTP-callable intelligence EFs except `intelligence-reasoning-worker` use `_shared/utils.ts#authenticateRequest`; callers can authenticate with a bearer token in the `Authorization` header or an API key in the `X-API-Key` header, and the helper also fast-paths the service-role bearer token.
- `successResponse()` wraps successful responses as `{ success: true, data, usage?, tier_info? }`.
- `errorResponse()` wraps most failures as `{ success: false, error: string }` with an HTTP status.
- Premium-gated endpoints additionally use `checkIntelligenceAccess()` and may return `403` via `premiumRequiredResponse()`.
- Queue-only means “not part of the public REST surface”; it may still be HTTP-callable internally (`flush`) or have no HTTP handler at all (`reasoning-worker`).

## 16-function matrix

| Edge Function | Canonical production HTTP path | Direct EF path | Visibility / auth | Queue-only | Notes |
| --- | --- | --- | --- | --- | --- |
| `intelligence-health-check` | `POST /api/v1/intelligence/health-check` (`/health` alias also exists in `_redirects`) | `POST /functions/v1/intelligence-health-check` | Public, authenticated, premium-gated | No | `_redirects` exposes it publicly; source requires auth despite older docs listing auth ❌. |
| `intelligence-memories` | `GET|POST /api/v1/intelligence/memories` | `GET|POST /functions/v1/intelligence-memories` | Public, authenticated | No | Enforces same-user access when `user_id` / `userId` is supplied. |
| `intelligence-suggest-tags` | `POST /api/v1/intelligence/suggest-tags` | `POST /functions/v1/intelligence-suggest-tags` | Public, authenticated, premium-gated | No | Accepts `memory_id` or raw content input. |
| `intelligence-find-related` | `POST /api/v1/intelligence/find-related` | `POST /functions/v1/intelligence-find-related` | Public, authenticated, premium-gated | No | Accepts `memory_id` or free-text `query`. |
| `intelligence-detect-duplicates` | `POST /api/v1/intelligence/detect-duplicates` | `POST /functions/v1/intelligence-detect-duplicates` | Public, authenticated, premium-gated | No | Returns duplicate groups; falls back to text similarity when embeddings are missing. |
| `intelligence-extract-insights` | `POST /api/v1/intelligence/extract-insights` | `POST /functions/v1/intelligence-extract-insights` | Public, authenticated, premium-gated | No | Can read from `memory_inferred_conclusions` cache with `prefer_cache`. |
| `intelligence-analyze-patterns` | `POST /api/v1/intelligence/analyze-patterns` | `POST /functions/v1/intelligence-analyze-patterns` | Public, authenticated, premium-gated | No | Can return JSON or markdown. |
| `intelligence-predictive-recall` | `POST /api/v1/intelligence/predictive-recall` | `POST /functions/v1/intelligence-predictive-recall` | Public, authenticated, premium-gated | No | `userId` is optional; defaults to authenticated caller. |
| `intelligence-prediction-feedback` | `POST /api/v1/intelligence/prediction-feedback` | `POST /functions/v1/intelligence-prediction-feedback` | Public, authenticated | No | `userId` optional; defaults to caller and rejects cross-user writes. |
| `intelligence-behavior-record` | `POST /api/v1/intelligence/behavior-record` | `POST /functions/v1/intelligence-behavior-record` | Public, authenticated, premium-gated | No | Returns `200` on dedupe/update or `201` on create. |
| `intelligence-behavior-recall` | `POST /api/v1/intelligence/behavior-recall` | `POST /functions/v1/intelligence-behavior-recall` | Public, authenticated, premium-gated | No | Requires `context.current_directory` and `context.current_task`. |
| `intelligence-behavior-suggest` | `POST /api/v1/intelligence/behavior-suggest` | `POST /functions/v1/intelligence-behavior-suggest` | Public, authenticated, premium-gated | No | Requires `current_state.task_description` and `current_state.completed_steps[]`. |
| `intelligence-profiles` | `GET /api/v1/profiles/:subject_id`, `GET /api/v1/profiles/:subject_id/versions`, `POST /api/v1/profiles/:subject_id/ask` | `GET /functions/v1/intelligence-profiles/:subject_id`, `GET /functions/v1/intelligence-profiles/:subject_id/versions`, `POST /functions/v1/intelligence-profiles/:subject_id/ask` | Public, authenticated; self-only unless caller is service-role | No | Public production profile surface now goes through MaaS `/api/v1/profiles/*`, not `_redirects`. |
| `intelligence-ask-profile` | None (no dedicated public gateway route) | `POST /functions/v1/intelligence-ask-profile` | Internal compatibility alias, authenticated; typically service-role | No | Superseded by `intelligence-profiles/:subject_id/ask`. |
| `intelligence-flush-reasoning-queue` | None (not exposed on `api.lanonasis.com`) | `POST /functions/v1/intelligence-flush-reasoning-queue` | Internal control-plane HTTP endpoint, authenticated | Yes | Tooling / service-role / acceptance-test path for forced flushes. |
| `intelligence-reasoning-worker` | None | None | Internal cron worker only | Yes | `Deno.cron("intelligence-reasoning-worker", "*/5 * * * *", ...)`; no inbound HTTP handler. |

## Detailed request / response contracts

### 1) `intelligence-health-check`
Source: `supabase/functions/intelligence-health-check/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/health-check`
- Direct: `POST /functions/v1/intelligence-health-check`

Input schema
- Optional body:
  - `include_recommendations?: boolean` (default `true`)
  - `detailed_breakdown?: boolean` (default `true`)
  - `organization_id?: uuid`
  - `topic_id?: uuid`
  - `memory_type?: string`
  - `memory_types?: string[]`
  - `query_scope?: personal | team | organization | hybrid`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.health_score`: `{ overall: number, breakdown: { organization, tagging, recency, completeness, diversity } | null }`
- `data.issues`: health issues list when memories exist
- `data.recommendations`: string[]
- Empty-state success returns `health_score.overall = 0`, `breakdown = null`, and a starter recommendation

### 2) `intelligence-memories`
Source: `supabase/functions/intelligence-memories/index.ts`

HTTP path
- Public: `GET|POST /api/v1/intelligence/memories`
- Direct: `GET|POST /functions/v1/intelligence-memories`

Input schema
- GET query params or POST JSON body
- Accepted fields:
  - `user_id?` / `userId?` (must match authenticated caller if present)
  - `type?` / `memory_type?`
  - `memory_types?: string[] | comma-separated string`
  - `organization_id?` / `organizationId?`
  - `topic_id?` / `topicId?`
  - `query_scope?` / `queryScope?`
  - `limit?: number` (clamped `1..200`, default `100`)
  - `offset?: number` (min `0`, default `0`)
  - `sort_by?` / `sortBy?` = `created_at | updated_at | title | last_accessed`
  - `sort_order?` / `sortOrder?` = `asc | desc`

Output schema
- `{ success: true, data: { memories, total_memories, limit, offset, has_more, query_scope, organization_id, topic_id, memory_types } }`
- `memories` rows include `id, title, content, type, memory_type, tags, metadata, user_id, organization_id, topic_id, created_at, updated_at, last_accessed, access_count`

### 3) `intelligence-suggest-tags`
Source: `supabase/functions/intelligence-suggest-tags/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/suggest-tags`
- Direct: `POST /functions/v1/intelligence-suggest-tags`

Input schema
- At least one of:
  - `memory_id?: uuid`
  - `content?: string`
- Optional:
  - `title?: string`
  - `existing_tags?: string[]`
  - `max_suggestions?: number` (clamped to `<= 10`, default `5`)
  - context filters: `organization_id`, `topic_id`, `memory_type`, `memory_types`, `query_scope`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.suggestions: string[]`
- `data.from_user_vocabulary: string[]`
- `data.memory_id: uuid | undefined`

### 4) `intelligence-find-related`
Source: `supabase/functions/intelligence-find-related/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/find-related`
- Direct: `POST /functions/v1/intelligence-find-related`

Input schema
- At least one of:
  - `memory_id?: uuid`
  - `query?: string`
- Optional:
  - `limit?: number`
  - `similarity_threshold?: number`
  - `exclude_ids?: string[]`
  - context filters: `organization_id`, `topic_id`, `memory_type`, `memory_types`, `query_scope`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.related_memories: Array<{ id, title, type, tags, snippet, similarity, created_at }>`
- `data.source_memory_id?: uuid`
- Uses embeddings when present; falls back to text matching otherwise

### 5) `intelligence-detect-duplicates`
Source: `supabase/functions/intelligence-detect-duplicates/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/detect-duplicates`
- Direct: `POST /functions/v1/intelligence-detect-duplicates`

Input schema
- Optional body:
  - `similarity_threshold?: number`
  - `include_archived?: boolean` (currently inert; source notes no `is_archived` column in production schema)
  - `limit?: number`
  - context filters: `organization_id`, `topic_id`, `memory_type`, `memory_types`, `query_scope`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.duplicate_groups: Array<{ primary_id, primary_title, duplicates: Array<{ id, title, similarity, created_at }>, similarity_score }>`
- `data.total_duplicates: number`
- Empty-state success can return `message: "Not enough memories to detect duplicates"`

### 6) `intelligence-extract-insights`
Source: `supabase/functions/intelligence-extract-insights/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/extract-insights`
- Direct: `POST /functions/v1/intelligence-extract-insights`

Input schema
- Optional:
  - `memory_ids?: uuid[]`
  - `topic?: string`
  - `time_range_days?: number`
  - `memory_type?: string`
  - `memory_types?: string[]`
  - `organization_id?: uuid`
  - `topic_id?: uuid`
  - `query_scope?: personal | team | organization | hybrid`
  - `insight_types?: Array<themes | connections | gaps | actions | summary>`
  - `detail_level?: brief | detailed | comprehensive`
  - `prefer_cache?: boolean`

Output schema
- Success envelope with `usage` and `tier_info`
- Cache-hit shortcut may return `{ insights, source: "cache", from_conclusions: true }`
- Standard response returns:
  - `data.insights: Array<{ type, content, confidence, related_memory_ids?: uuid[] }>`
  - `data.overall_summary?: string`
  - `data.memories_analyzed?: number`
  - `data.detail_level?: string`
  - `data.insight_types?: string[]`
- Empty-state success can return `insights: []` plus message

### 7) `intelligence-analyze-patterns`
Source: `supabase/functions/intelligence-analyze-patterns/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/analyze-patterns`
- Direct: `POST /functions/v1/intelligence-analyze-patterns`

Input schema
- Optional:
  - `time_range_days?: number`
  - `include_insights?: boolean` (default `true`)
  - `response_format?: json | markdown`
  - `organization_id?: uuid`
  - `topic_id?: uuid`
  - `memory_type?: string`
  - `memory_types?: string[]`
  - `query_scope?: personal | team | organization | hybrid`
  - `prefer_cache?: boolean`

Output schema
- Success envelope with `usage` and `tier_info`
- Cache-hit shortcut may return `{ insights, source: "cache", from_conclusions: true }`
- Standard JSON response contains totals and derived pattern fields such as:
  - `total_memories`
  - `time_range_days`
  - `memories_by_type`
  - `top_tags`
  - `memories_by_day_of_week`
  - `peak_creation_hours`
  - `average_content_length`
  - `average_access_count`
  - `insights?: string[]`
- With `response_format = markdown`, the `data` payload is a markdown string instead of the object

### 8) `intelligence-predictive-recall`
Source: `supabase/functions/intelligence-predictive-recall/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/predictive-recall`
- Direct: `POST /functions/v1/intelligence-predictive-recall`

Input schema
- Optional body; source accepts an empty object
- Accepted fields:
  - `user_id?` / `userId?` (must match caller if present)
  - `organization_id?` / `organizationId?`
  - `topic_id?` / `topicId?`
  - `query_scope?` / `queryScope?`
  - `memory_type?`
  - `memory_types?` / `memoryTypes?`
  - `context?: { projectContext?, topics?, filesTouched?, contextText?, teamContext?, ... }`
  - `limit?: number` (clamped `1..20`, default `5`)
  - `min_confidence?` / `minConfidence?` (clamped `0..100`, default `40`)
  - `include_serendipity?` / `includeSerendipity?` (default `true`)
  - `time_window_days?` / `timeWindowDays?` (clamped `1..365`, default `90`)
  - `response_format?` / `responseFormat?` = `json | markdown`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.predictions: Array<{ id, title, type, tags, contentPreview, confidence, reason, reasonType, scoreBreakdown, daysSinceCreated, daysSinceAccessed, suggestedAction, relatedTopics }>`
- `data.totalPredictions: number`
- `data.memoriesAnalyzed: number`
- `data.contextUsed`, `data.scoringWeights`, `data.algorithmInfo`, `data.generatedAt`
- Empty context returns a valid success response with `predictions: []`

### 9) `intelligence-prediction-feedback`
Source: `supabase/functions/intelligence-prediction-feedback/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/prediction-feedback`
- Direct: `POST /functions/v1/intelligence-prediction-feedback`

Input schema
- Required:
  - `memory_id` / `memoryId`: uuid
  - `useful`: boolean
  - `action`: `clicked | saved | dismissed | ignored`
- Optional:
  - `user_id` / `userId` (defaults to authenticated caller; cross-user writes rejected)
  - `dismiss_reason` / `dismissReason`: `not_relevant | already_know | not_now | other`
  - `prediction_confidence` / `predictionConfidence`: number
  - `prediction_reason` / `predictionReason`: string

Output schema
- `{ success: true, data: { recorded, memory_id, action, useful, stored_suggestion_id, feedback_at } }`

### 10) `intelligence-behavior-record`
Source: `supabase/functions/intelligence-behavior-record/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/behavior-record`
- Direct: `POST /functions/v1/intelligence-behavior-record`

Input schema
- Required:
  - `trigger: string` (minimum 10 characters)
  - `context: { directory: string, project_type?, branch?, files_touched? }`
  - `actions: Array<{ tool, parameters, outcome, timestamp, duration_ms? }>` (non-empty)
  - `final_outcome: success | partial | failed`
- Optional:
  - `confidence?: number`
  - `user_id?: uuid`

Output schema
- Success envelope with `usage` and `tier_info`
- `data: { pattern_id, trigger, final_outcome, confidence, actions_count, embedding_generated, embedding_provider }`

### 11) `intelligence-behavior-recall`
Source: `supabase/functions/intelligence-behavior-recall/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/behavior-recall`
- Direct: `POST /functions/v1/intelligence-behavior-recall`

Input schema
- Required:
  - `context.current_directory: string`
  - `context.current_task: string`
- Optional:
  - `context.project_type?: string`
  - `limit?: number`
  - `similarity_threshold?: number`
  - `user_id?: uuid`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.patterns: Array<{ id, trigger, context, actions, final_outcome, confidence, use_count, similarity, last_used_at, created_at }>`
- `data.total_patterns: number`
- `data.matched_patterns?: number`
- `data.query_context?: { task, directory, project_type }`
- Empty-state success can return `patterns: []` and explanatory message

### 12) `intelligence-behavior-suggest`
Source: `supabase/functions/intelligence-behavior-suggest/index.ts`

HTTP path
- Public: `POST /api/v1/intelligence/behavior-suggest`
- Direct: `POST /functions/v1/intelligence-behavior-suggest`

Input schema
- Required:
  - `current_state.task_description: string`
  - `current_state.completed_steps: string[]`
- Optional:
  - `current_state.current_files?: string[]`
  - `max_suggestions?: number` (clamped `1..5`, default `3`)
  - `user_id?: uuid`

Output schema
- Success envelope with `usage` and `tier_info`
- `data.suggestions: Array<{ action, tool, reasoning, confidence, based_on_pattern? }>`
- `data.patterns_used: number`

### 13) `intelligence-profiles`
Source: `supabase/functions/intelligence-profiles/index.ts`, `apps/lanonasis-maas/src/routes/profiles.ts`, `apps/lanonasis-maas/src/server.ts`

HTTP path
- Public gateway surface:
  - `GET /api/v1/profiles/:subject_id`
  - `GET /api/v1/profiles/:subject_id/versions?limit=20`
  - `POST /api/v1/profiles/:subject_id/ask`
- Direct EF surface:
  - `GET /functions/v1/intelligence-profiles/:subject_id`
  - `GET /functions/v1/intelligence-profiles/:subject_id/versions`
  - `POST /functions/v1/intelligence-profiles/:subject_id/ask`

Auth / visibility
- Authenticated callers only
- Direct EF explicitly enforces self-access unless `authSource === "service_role"`
- MaaS route stack also applies `validateProjectScope`, `alignedAuthMiddleware`, and `planBasedRateLimit('intelligence')`

Input schema
- `GET /:subject_id`: no body
- `GET /:subject_id/versions`: optional query `limit` (default `20`, max `100`)
- `POST /:subject_id/ask`: `{ question: string }`

Output schema
- `GET /:subject_id` → `{ success: true, data: { profile: <memory_profiles row> } }`
- `GET /:subject_id/versions` → `{ success: true, data: { versions: <memory_profile_versions rows>[] } }`
- `POST /:subject_id/ask` → `{ success: true, data: { answer: string, sources: ["profile_summary", "structured_fields"], confidence: number } }`

### 14) `intelligence-ask-profile`
Source: `supabase/functions/intelligence-ask-profile/index.ts`, `apps/lanonasis-maas/src/services/profileService.ts`

HTTP path
- Public: none
- Direct/internal: `POST /functions/v1/intelligence-ask-profile`

Input schema
- Required body:
  - `subject_id: uuid`
  - `question: string`

Output schema
- `{ success: true, data: { answer: string, sources: ["profile_summary", "structured_fields"], confidence: number } }`

Status
- Internal compatibility alias only
- MaaS `ProfileService.askProfile()` still calls this EF directly with service-role auth
- Prefer `intelligence-profiles/:subject_id/ask` for new callers

### 15) `intelligence-flush-reasoning-queue`
Source: `supabase/functions/intelligence-flush-reasoning-queue/index.ts`, `_shared/reasoning-processor.ts`, `apps/lanonasis-maas/src/services/intelligenceService.ts`, `apps/mcp-core/src/tools/memory-tool.ts`

HTTP path
- Public: none
- Direct/internal: `POST /functions/v1/intelligence-flush-reasoning-queue`

Input schema
- Required body:
  - `subject_id: uuid`

Output schema
- If feature flag disabled: `{ success: true, data: { flushed: false, reason: "feature_disabled" } }`
- If no pending batch row: `{ success: true, data: { flushed: true, job_ids: [], conclusion_count: 0, note: "no_pending_batch" } }`
- Normal success: `{ success: true, data: { flushed: true, job_ids: string[], conclusion_count: number } }`

Status
- HTTP-callable, but control-plane only
- Not routed through public `api.lanonasis.com`
- Used by MaaS service code, MCP core, and acceptance tests

### 16) `intelligence-reasoning-worker`
Source: `supabase/functions/intelligence-reasoning-worker/index.ts`

HTTP path
- None

Execution mode
- Queue-only / cron-only
- Registers `Deno.cron("intelligence-reasoning-worker", "*/5 * * * *", runReasoningWorker)`

Input schema
- No HTTP request body; it acquires pending batches directly from `memory_inference_batches`

Output schema
- No HTTP response contract
- Shared processing function returns `{ job_ids: string[], conclusion_count: number }` per subject batch internally

## Routing notes that matter

- `_redirects` still exposes the classic `/api/v1/intelligence/*` direct-to-Supabase paths for the 13 public intelligence routes listed there.
- `intelligence-profiles` deliberately moved off that Netlify redirect path. The public production route is now MaaS/nginx `/api/v1/profiles/*`.
- `intelligence-ask-profile` and `intelligence-flush-reasoning-queue` are real EFs, but they are not end-user public REST routes.
- `intelligence-reasoning-worker` is a real deployed EF module, but not an HTTP API endpoint.

## Spec updates made alongside this inventory

- Add missing public `/profiles/{subject_id}` paths to the OpenAPI spec.
- Add the previously-missing `Behavior*` component schemas referenced by the OpenAPI file.
- Correct predictive-recall / prediction-feedback request requirements to match source code (`userId` is optional, not required).
