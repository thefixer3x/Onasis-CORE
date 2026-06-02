# Routing Update Instructions

These instructions explain how to switch traffic to the new Unified Router service after staging verification.

1. Staging verification
   - Deploy the image built with `deploy.sh` to staging.
   - Run smoke tests (exercise `/health`, `/services`, and a sample `/api/ai-chat` request).

2. Netlify / Proxy updates
   - If your site uses Netlify redirects, update `_redirects` (or `netlify.toml`) to point the API paths to the new router host:
     Example `_redirects` rule:
     ```
     /api/*  https://unified-router.staging.example.com/:splat  200!
     ```
   - For production, replace staging host with production host.
   - If using a load balancer, add a backend pool for the router service and update routing rules to forward `/api/*` and `/webhook/*` according to priority.

3. DNS / Traffic switch
   - Use a low-traffic window.
   - Update DNS or load balancer rule to include the router in the request path.
   - Monitor logs (winston) and Supabase invocations for errors and rate-limit events.

4. Rollback
   - Revert the redirect or load balancer rule to point back to previous service.
   - Disable `ENABLE_UNIFIED_ROUTER` on the router host if immediate shutdown required.

5. Post-migration
   - After stable operation, remove legacy router copies and update `REORGANIZE_MONOREPO.sh`.

