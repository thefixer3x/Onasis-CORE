# Onasis-Core Security Review — Key Management & Auth Hardening

Date: 2025-08-29 02:20:33 WAT
Reviewer: Onasis assistant (automated analysis)
Scope: apps/onasis-core (MCP server, middleware, key-manager service)

## Executive Summary
- Current API key and vendor key handling provides functionality but falls short of enterprise-grade protections.
- Immediate risks include plaintext storage of internal API keys, incorrect AES-GCM usage for vendor key encryption, and endpoints returning secret material.
- A phased plan mitigates without disrupting live services: stop returning secrets, hash verification only, correct envelope encryption, introduce a vault broker with KMS/HSM, and enforce approvals + audit.

## Findings (Notable Risks)
- Plaintext internal keys: `api_keys.key_secret` stored and returned in responses (create/rotate).
- Broken encryption for vendor keys: `services/key-manager/server.js` uses `crypto.createCipher`/`createDecipher` with an IV that isn’t used; AES-GCM requires `createCipheriv` and auth tag handling.
- Secret readback: admin endpoints can return decrypted vendor keys (no-readback policy is expected in enterprise).
- API key auth compares plaintext to `maas_api_keys.key_hash`; should store slow hash and verify via Argon2id/BCrypt.
- Direct secret usage: e.g., `OPENAI_API_KEY` used directly in requests without vault abstraction; ensure redaction on all outputs.
- Policy/approvals: destructive or secret-using operations are not consistently gated behind plan/confirm.

## Recommended Phased Remediation
1) Hotfix (no downtime)
- Remove `key_secret` from responses in `createApiKeyTool`/`rotateApiKeyTool`.
- Stop storing internal secrets in plaintext. Store only `key_id` + password hash (Argon2id/BCrypt). Display secret once at creation client-side; never store plaintext.
- Ensure robust output redaction for common key patterns (OpenAI, Vercel, GH, Stripe) across WS/SSE logs.

2) Vendor Key Encryption Fix
- Replace GCM with correct primitives: `createCipheriv('aes-256-gcm', key, iv)`, 12-byte IV, store `{ciphertext, iv, authTag}`.
- Data migration: best-effort decrypt legacy values → re-encrypt; otherwise mark legacy entries for reset.
- Remove plaintext readback endpoints; return only references (kid/version/vendor_name/key_name/meta).

3) Vault Broker & KMS/HSM
- Implement `@onasis/vault-broker` abstraction (GCP Secret Manager + Cloud KMS baseline; pluggable Azure/AWS).
- Envelope encryption: DEK per secret (AES-256-GCM) wrapped by tenant KEK in KMS/HSM. No-readback API.
- JIT injection: unwrap only at execution time in-process memory; inject env/headers transiently; never persisted/logged.
- Rotation/versioning policies and audit hooks.

4) Approvals + Policy Hardening
- Default approvals: `exec.plan` → human `exec.confirm` for any write/destructive or secret-using action.
- Per-adapter minimal scopes; restrict by default to read-only.
- Tamper-evident audit (hash-chain/signing) + correlation IDs.

5) Cloud & Compliance Posture
- TLS 1.3, mTLS internal; WAF/rate limiting; SIEM export.
- DPA/TOMs/Privacy docs published; vendor-specific “no-MITM credentials” statements (e.g., Stripe).
- Confidential Compute (attested unwrap) as Tier 2+ option.

## Cloud Cost Considerations
- GCP/Azure/AWS KMS + Secrets Manager costs are modest at MVP scale:
  - Keys: low monthly per KEK + per-operation cost (unwrap calls during exec).
  - Secrets: per secret + per 10K API calls storage/operation cost.
  - Expect tens of dollars/month at small scale; hundreds → low thousands at enterprise scale depending on volume.
- Start with one cloud (e.g., GCP) and keep broker pluggable. Support BYO Vault for regulated customers.

## Dashboard Behavior (Expected)
- Users manage vendor credentials via dashboard → secrets stored via broker → only references returned.
- Future execs select secret references; runner resolves JIT, injects transiently, and audits kid/version used (never plaintext).

## Rollback/Compatibility
- No rollback needed for live features: implement hotfixes (no-readback, hash-only) first.
- Stage vault broker behind feature flags; migrate credentials progressively.
- Keep existing flows operational while introducing stronger backends.

## File References Observed
- Internal keys: apps/onasis-core/onasis-mcp/src/unified-mcp-server.ts (API key tools, OpenAI usage)
- Vendor keys: apps/onasis-core/services/key-manager/server.js (encryption, readback)
- Auth middleware: apps/onasis-core/onasis-mcp/src/middleware/auth-aligned.ts (API key auth vs. plaintext compare)

## Action Items (High Priority)
- [ ] Stop returning any secret material in API responses.
- [ ] Hash-and-verify internal keys (Argon2id/BCrypt); remove plaintext storage.
- [ ] Fix AES-GCM with createCipheriv/createDecipheriv; store iv+tag; migrate rows.
- [ ] Remove decrypted key readback endpoints; replace with reference-only.
- [ ] Add robust output redaction and secret scanning to WS/SSE logs.
- [ ] Introduce approvals default for secret-using and write operations.
- [ ] Add `@onasis/vault-broker` (GCP baseline) and wire JIT injection path.
- [ ] Publish KEY_MANAGEMENT and SECURITY docs; update DPA/TOMs references.

---
This document is intended to guide alignment to an enterprise-grade standard without disrupting the live service.
