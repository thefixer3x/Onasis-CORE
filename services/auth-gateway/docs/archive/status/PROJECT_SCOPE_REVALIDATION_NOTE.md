# Project Scope Revalidation Note

## Context
`project_scope` is currently accepted from request input (OAuth state, magic link, login, token exchange, OTP/device flows) and injected into JWT/session metadata. This keeps platform routing flexible but does not revalidate user entitlements.

Requirement: revalidate `project_scope` against backend entitlements without blocking login flows (soft validation + fallback).

## Current Sources of Truth
1) **User/project entitlement data (security_service schema)**
   - Table: `security_service.api_key_projects` (owner/team membership)
   - Table: `security_service.organizations`
   - Table: `security_service.users`

Note: `project_scope` is treated as a project identifier (UUID) or project slug/name stored in `api_key_projects`. The IDE/CLI currently uses `lanonasis-maas` as the default scope.

## Proposed Non-Blocking Revalidation Strategy
1) **Resolve user entitlement (soft check)**
   - If `project_scope` is UUID: verify membership in `security_service.api_key_projects`.
   - If `project_scope` is a slug/name: look up `api_key_projects` by `name` or `settings->>'slug'` and verify membership.
   - If membership fails: log audit event + fallback to default scope.
   - If no project row is found: accept the scope but mark it as unverified in audit logs.

2) **Never block login**
   - Always return tokens, but with `resolved_project_scope`.
   - Emit structured audit logs for mismatches so the platform can track invalid requests.

## Suggested Implementation Touchpoints
- `apps/onasis-core/services/auth-gateway/src/controllers/auth.controller.ts`
  - `login`, `exchangeSupabaseToken`, `magicLinkExchange`, OAuth callback flows
- `apps/onasis-core/services/auth-gateway/src/routes/otp.routes.ts`
- `apps/onasis-core/services/auth-gateway/src/routes/device.routes.ts`

## Example SQL Helpers (for implementation)
```sql
-- Project membership (owner/team)
SELECT id, organization_id
FROM security_service.api_key_projects
WHERE id = $1
  AND ($2 = owner_id OR $2 = ANY(COALESCE(team_members, '{}'::uuid[])));

-- Project membership via slug/name
SELECT id, organization_id
FROM security_service.api_key_projects
WHERE LOWER(name) = LOWER($1)
   OR LOWER(COALESCE(settings->>'slug', '')) = LOWER($1);
```

## OpenAPI Scope Coverage
The OpenAPI spec lists OAuth scopes under `components.securitySchemes.OAuth2PKCE` but does not annotate per-endpoint scopes. Any future revalidation should treat those scopes as platform-level defaults, not as entitlement enforcement.
