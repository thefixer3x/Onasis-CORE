# Unified Router Service

This service provides a privacy-protected unified router that forwards requests to Supabase Edge Functions.

Run locally:

1. Install deps: `cd apps/onasis-core/services/unified-router && npm install`
2. Set env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optionally `ENABLE_UNIFIED_ROUTER=true`
3. Start: `npm start`

Notes:
- The service uses `SUPABASE_ANON_KEY` for proxied requests. `SUPABASE_SERVICE_KEY` must not be forwarded.
- By default the service is disabled via `ENABLE_UNIFIED_ROUTER=false` in its PM2 ecosystem file to avoid accidental activation in environments.

