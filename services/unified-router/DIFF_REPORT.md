# Diff Report — Legacy Router vs API Gateway / Auth API

## Purpose
Summarize functional overlap and differences between:
- `apps/onasis-core/unified-router.cjs` (legacy canonical router)
- `apps/onasis-core/scripts/unified-router.js` (duplicate)
- `scripts/router/unified-router.cjs` (repo copy)
- `apps/onasis-core/services/api-gateway/modules/auth-api.js`
- `services/api-gateway/server.js`

## Key overlaps
- Privacy middleware: all components implement header stripping, anonymous request IDs, and client fingerprinting.
- Rate limiting: both router and gateway use anonymous session-based rate key generation.
- Logging: winston-based structured logging is used across services.
- Routes: health and service discovery endpoints are present in router and gateway.
- Proxy behavior: router forwards to Supabase Edge Functions; gateway proxies to vendor APIs and supplies billing metadata.

## Important differences
- Auth API (`auth-api.js`) initializes Supabase with a service role key for admin operations (server-only), while router must only use `SUPABASE_ANON_KEY` when forwarding client requests.
- The API Gateway contains billing and vendor cost calculations and richer vendor masking (VENDOR_CONFIGS). The router only routes to Supabase functions and performs PII sanitization.
- Gateway applies vendor-specific headers and billing metadata; router should not perform billing calculations.
- Logging levels and destinations differ (gateway logs to files + console; auth-api logs to console).

## Security risks / observations
- `SUPABASE_SERVICE_KEY` is read in some legacy router copies but never forwarded; ensure it is not present in frontend or Netlify envs.
- Console logs in legacy router include `SUPABASE_URL` — redact in production logs.
- Duplicate code paths across repo risk divergent behaviour if only one copy is updated.

## Canonicalization recommendations
1. Canonical routing behaviour:
   - Use `SUPABASE_ANON_KEY` for forwarded requests only.
   - Sanitize request bodies (PII removal) and responses (vendor masking) as in legacy router.
2. Logging:
   - Use structured winston logging, redact keys and sensitive headers; log hashed origins only.
3. Rate limiting:
   - Reuse gateway's anonymous session-based keyGenerator for consistency.
4. Deployment:
   - Deploy unified router as separate service (per current decision) and gate with `ENABLE_UNIFIED_ROUTER` flag.
5. Cleanup:
   - After verification, remove legacy copies and update `REORGANIZE_MONOREPO.sh` and docs referencing the old files.

## Next steps
- Implement the separate service scaffold (done in this PR) and run unit tests.
- Add CI workflow to validate tests on PRs (added).
- Coordinate staging deployment and Netlify/Supabase routing update.

