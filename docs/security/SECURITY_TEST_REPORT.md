# Security Test & Production Readiness Report (2025-02-24)

## Scope
- Target: `services/security` package and related gateway/auth flows.
- Objective: Validate available security tests, surface critical gaps, and outline production readiness actions.

## Test & Check Execution
- `bunx --bun vitest run` (services/security): ✅ Passes new Vitest suite covering ApiKeyService project creation flow and schema validation scaffolding. 【cfb286†L1-L14】
- `bunx npm audit --json`: ⚠️ Requires a lockfile; audit not executed. Validator risk mitigated via override/pin to 13.15.22 (verified in installed module). 【7188d9†L1-L10】

## Key Findings (Blocking)
1) **Tenant boundary risk in memory API**  
   `netlify/functions/maas-api.js` falls back to a hardcoded default organization when a user’s org cannot be resolved, enabling cross-tenant data exposure. 【1eeb1f†L378-L447】

2) **Weak key encryption defaults**  
   `netlify/functions/key-manager.js` uses deprecated `crypto.createCipher/Decipher` with a default password-based secret, reducing confidentiality for stored vendor keys. 【fd123c†L15-L59】

3) **Schema split increases drift risk**  
   Legacy MaaS schema under `supabase/migrations` (memory + topic tables in `maas` schema) differs from the active auth/key management schema under `services/auth-gateway/migrations` (auth schema, API keys, event store), indicating dual migration tracks that can diverge without coordination. 【89edec†L1-L80】【8d2493†L1-L63】

4) **Limited automated coverage in security service**  
   Vitest suite now exists but only exercises ApiKeyService happy-path/project validation; broader auth, encryption, and RLS paths still need tests. 【cfb286†L1-L14】

## Production Readiness To-Do
- **Fix tenant scoping:** Remove default-org fallback in `maas-api` and enforce explicit org resolution with 403 on failure; add regression tests for tenant isolation. 【1eeb1f†L378-L447】
- **Harden key encryption:** Replace `createCipher/Decipher` with `createCipheriv/createDecipheriv` (AES-256-GCM, random IV, required 32-byte key or KDF); document rotation for existing encrypted rows. 【fd123c†L15-L59】
- **Close migration drift:** Align Supabase `maas` migrations with `services/auth-gateway` migrations (auth schema/API keys/event store). Create a unified migration plan or deprecate unused paths to avoid split-brain states. 【89edec†L1-L80】【8d2493†L1-L63】
- **Add automated tests:** Expand Vitest coverage in `services/security` (auth, API-key validation, encryption/decryption, RLS/tenant guards) and wire into CI. 【cfb286†L1-L14】
- **Address dependency vulnerability:** Validator pinned to 13.15.22 via overrides; re-run audit with a Bun/lockfile-backed workflow to validate. 【7188d9†L1-L10】

## Notes on Environment & Data Flow
- Authentication and API key management currently live in `services/auth-gateway` (Neon-backed and synced to Supabase), while earlier MaaS scaffolding remains in `supabase/migrations`. This duality is the primary source of potential confusion and should be resolved during migration alignment. 【89edec†L1-L80】【8d2493†L1-L63】
