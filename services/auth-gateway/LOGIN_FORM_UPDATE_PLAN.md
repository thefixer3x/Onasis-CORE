# Login Form Consistency Update Plan

## Goal

Replace the login forms in the auth-gateway service with the cleaned-up terminal-style design from `apps/onasis-core/auth/login.html` to ensure consistent user experience across all authentication routes.

## Files to Update

### 1. CLI Login Route

**File:** `apps/onasis-core/services/auth-gateway/src/routes/cli.routes.ts`
**Route:** `GET /auth/cli-login`
**Current State:** Has a terminal-style form but different from the cleaned version
**Action:** Replace HTML with cleaned version, keeping CLI-specific endpoints

### 2. Web Login Route

**File:** `apps/onasis-core/services/auth-gateway/src/routes/web.routes.ts`
**Route:** `GET /web/login`
**Current State:** Has a modern gradient design (not terminal-style)
**Action:** Replace HTML with terminal-style cleaned version, keeping web-specific endpoints

## Key Features to Preserve

### From Cleaned Version (login.html)

✅ Terminal aesthetic (green on black)
✅ OAuth provider buttons with SVG icons (Google, GitHub, LinkedIn, Discord, Apple)
✅ Sign In / Sign Up toggle
✅ Consistent styling and animations
✅ Terminal window frame with dots
✅ Resources section at bottom

### Route-Specific Adaptations

#### CLI Route Adaptations

- Keep endpoint: `POST /auth/cli-login`
- Keep endpoint: `POST /auth/cli-register`
- Platform detection from query params
- Return JSON with `api_key` for CLI tools
- Display token in copyable format

#### Web Route Adaptations

- Keep endpoint: `POST /web/login`
- Set HTTP-only cookies for session
- Redirect to dashboard after login
- Handle `return_to` parameter

## Implementation Strategy

1. Extract the HTML template from `login.html`
2. Adapt JavaScript for CLI-specific behavior (JSON response, token display)
3. Adapt JavaScript for Web-specific behavior (form POST, cookie handling)
4. Keep OAuth buttons pointing to correct endpoints
5. Test both routes to ensure functionality

## OAuth Endpoint Mapping

Both routes should support OAuth via:

- `/v1/auth/oauth?provider=X&project_scope=lanonasis-maas&redirect_uri=...`

## Benefits

✅ Consistent branding across all auth touchpoints
✅ Professional terminal aesthetic
✅ OAuth integration on all login forms
✅ Better user experience
✅ Easier maintenance (single design system)
