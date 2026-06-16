import crypto from 'crypto'
import type { Request } from 'express'

export interface ApiKeyBinding {
  audiences?: string[]
  client_id?: string
  installation_id?: string
  public_key_pem?: string
  public_key_jwk?: JsonWebKey
  require_request_signature?: boolean
}

export interface ApiKeyValidationContext {
  audience?: string
  projectScope?: string
  clientId?: string
  installationId?: string
  method?: string
  path?: string
  timestamp?: string
  nonce?: string
  contentSha256?: string
  // Server-computed SHA-256 digest of the raw request body (set by middleware).
  // When present, verifySignature checks it matches the caller-supplied contentSha256
  // to prevent body-tampering on signed requests.
  computedContentSha256?: string
  signature?: string
  enforceBinding?: boolean
}

export interface ApiKeyBindingValidationResult {
  valid: boolean
  status: 'legacy_unbound' | 'bound' | 'binding_required' | 'binding_mismatch' | 'signature_required' | 'signature_invalid'
  reason?: string
}

// Fail closed: if the env var is missing or non-numeric, default to 300 s.
const _parsed = Number.parseInt(process.env.AUTH_GATEWAY_API_KEY_SIGNATURE_WINDOW_SECONDS || '300', 10)
const SIGNATURE_WINDOW_SECONDS = Number.isFinite(_parsed) && _parsed > 0 ? _parsed : 300

const PRIVATE_PEM_RE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
const PRIVATE_JWK_FIELDS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'])

function hasPrivateJwkMaterial(jwk: Record<string, unknown>): boolean {
  return Object.keys(jwk).some((key) => PRIVATE_JWK_FIELDS.has(key))
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
    return normalized.length > 0 ? normalized : undefined
  }

  const single = normalizeString(value)
  return single ? [single] : undefined
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

export function readApiKeyBinding(record: Record<string, unknown>): ApiKeyBinding | null {
  const rawBinding =
    readRecord(record.binding) ??
    readRecord(readRecord(record.metadata)?.binding) ??
    readRecord(readRecord(record.metadata)?.auth_binding)

  if (!rawBinding) {
    return null
  }

  const binding: ApiKeyBinding = {}
  const audiences = normalizeStringArray(rawBinding.audiences ?? rawBinding.audience)
  if (audiences) binding.audiences = audiences

  const clientId = normalizeString(rawBinding.client_id ?? rawBinding.clientId)
  if (clientId) binding.client_id = clientId

  const installationId = normalizeString(rawBinding.installation_id ?? rawBinding.installationId)
  if (installationId) binding.installation_id = installationId

  // Reject private PEM material — only store public keys.
  const publicKeyPem = normalizeString(rawBinding.public_key_pem ?? rawBinding.publicKeyPem)
  if (publicKeyPem && !PRIVATE_PEM_RE.test(publicKeyPem)) binding.public_key_pem = publicKeyPem

  // Reject JWK objects that carry private/symmetric key fields.
  const publicKeyJwk = readRecord(rawBinding.public_key_jwk ?? rawBinding.publicKeyJwk)
  if (publicKeyJwk && !hasPrivateJwkMaterial(publicKeyJwk)) binding.public_key_jwk = publicKeyJwk as JsonWebKey

  if (typeof rawBinding.require_request_signature === 'boolean') {
    binding.require_request_signature = rawBinding.require_request_signature
  } else if (typeof rawBinding.requireRequestSignature === 'boolean') {
    binding.require_request_signature = rawBinding.requireRequestSignature
  }

  return Object.keys(binding).length > 0 ? binding : null
}

export function apiKeyValidationContextFromRequest(
  req: Request,
  defaults: Partial<ApiKeyValidationContext> = {}
): ApiKeyValidationContext {
  return {
    ...defaults,
    // defaults.audience takes priority — prevents callers from overriding the
    // gateway's own audience claim via request headers.
    audience:
      defaults.audience ??
      normalizeString(req.headers['x-lanonasis-audience']) ??
      normalizeString(req.headers['x-auth-audience']) ??
      normalizeString(req.headers['x-service-audience']),
    projectScope:
      normalizeString(req.headers['x-project-scope']) ??
      normalizeString(req.body?.project_scope) ??
      defaults.projectScope,
    clientId:
      normalizeString(req.headers['x-lanonasis-client-id']) ??
      normalizeString(req.headers['x-client-id']) ??
      normalizeString(req.body?.client_id) ??
      defaults.clientId,
    installationId:
      normalizeString(req.headers['x-lanonasis-installation-id']) ??
      normalizeString(req.headers['x-installation-id']) ??
      normalizeString(req.body?.installation_id) ??
      defaults.installationId,
    method: req.method,
    path: req.originalUrl || req.url,
    timestamp: normalizeString(req.headers['x-lanonasis-timestamp']),
    nonce: normalizeString(req.headers['x-lanonasis-nonce']),
    contentSha256: normalizeString(req.headers['x-lanonasis-content-sha256']),
    // computedContentSha256 is populated by raw-body middleware upstream; leave
    // undefined here so the middleware's value (attached to req) is preserved.
    computedContentSha256: (req as any).computedContentSha256,
    signature: normalizeString(req.headers['x-lanonasis-signature']),
  }
}

function shouldRequireBinding(context?: ApiKeyValidationContext): boolean {
  return context?.enforceBinding === true || process.env.AUTH_GATEWAY_REQUIRE_API_KEY_BINDING === 'true'
}

function shouldRequireSignature(binding: ApiKeyBinding): boolean {
  return binding.require_request_signature === true || process.env.AUTH_GATEWAY_REQUIRE_API_KEY_SIGNATURE === 'true'
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function signaturePayload(context: ApiKeyValidationContext): string {
  const fields = [
    context.method?.toUpperCase() || '',
    context.path || '',
    context.timestamp || '',
    context.nonce || '',
    context.contentSha256 || '',
    context.audience || '',
    context.projectScope || '',
    context.clientId || '',
    context.installationId || '',
  ]
  if (fields.some((f) => f.includes('\n'))) {
    throw new Error('Newline characters are not allowed in signature payload fields')
  }
  return fields.join('\n')
}

function parseSignature(signature: string): Buffer | null {
  const normalized = signature.startsWith('v1=') ? signature.slice(3) : signature
  try {
    return Buffer.from(normalized, 'base64')
  } catch {
    return null
  }
}

function verifySignature(binding: ApiKeyBinding, context: ApiKeyValidationContext): boolean {
  if (!context.timestamp || !context.nonce || !context.signature) {
    return false
  }

  const timestampSeconds = Number.parseInt(context.timestamp, 10)
  if (!Number.isFinite(timestampSeconds)) {
    return false
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds)
  if (ageSeconds > SIGNATURE_WINDOW_SECONDS) {
    return false
  }

  // If raw-body middleware computed the body digest, verify the header matches.
  if (context.contentSha256 && context.computedContentSha256) {
    if (!timingSafeEqualString(context.contentSha256, context.computedContentSha256)) {
      return false
    }
  }

  const signature = parseSignature(context.signature)
  if (!signature) {
    return false
  }

  const publicKey = binding.public_key_pem
    ? crypto.createPublicKey(binding.public_key_pem)
    : binding.public_key_jwk
      ? crypto.createPublicKey({ key: binding.public_key_jwk, format: 'jwk' })
      : null

  if (!publicKey) {
    return false
  }

  // Ed25519/Ed448 require algorithm=null; RSA/EC use 'sha256'.
  const algorithm =
    publicKey.asymmetricKeyType === 'ed25519' || publicKey.asymmetricKeyType === 'ed448' ? null : 'sha256'

  return crypto.verify(algorithm, Buffer.from(signaturePayload(context)), publicKey, signature)
}

export function validateApiKeyBinding(
  record: Record<string, unknown>,
  context?: ApiKeyValidationContext
): ApiKeyBindingValidationResult {
  const binding = readApiKeyBinding(record)

  if (!binding) {
    if (shouldRequireBinding(context)) {
      return {
        valid: false,
        status: 'binding_required',
        reason: 'API key is not bound to an audience, client, installation, or proof key.',
      }
    }

    return { valid: true, status: 'legacy_unbound' }
  }

  // A binding that contains only a public key with no signature requirement is
  // inert — it enforces nothing. Treat it the same as unbound.
  const signatureRequired = shouldRequireSignature(binding)
  const hasEnforceableConstraint = Boolean(
    binding.audiences?.length || binding.client_id || binding.installation_id || signatureRequired
  )

  if (!hasEnforceableConstraint) {
    if (shouldRequireBinding(context)) {
      return {
        valid: false,
        status: 'binding_required',
        reason: 'API key binding does not include an enforceable audience, client, installation, or signature requirement.',
      }
    }
    return { valid: true, status: 'legacy_unbound' }
  }

  if (binding.audiences?.length) {
    const audience = context?.audience
    if (!audience || !binding.audiences.some((entry) => timingSafeEqualString(entry, audience))) {
      return {
        valid: false,
        status: 'binding_mismatch',
        reason: 'API key audience binding does not match this request.',
      }
    }
  }

  if (binding.client_id) {
    const clientId = context?.clientId
    if (!clientId || !timingSafeEqualString(binding.client_id, clientId)) {
      return {
        valid: false,
        status: 'binding_mismatch',
        reason: 'API key client binding does not match this request.',
      }
    }
  }

  if (binding.installation_id) {
    const installationId = context?.installationId
    if (!installationId || !timingSafeEqualString(binding.installation_id, installationId)) {
      return {
        valid: false,
        status: 'binding_mismatch',
        reason: 'API key installation binding does not match this request.',
      }
    }
  }

  if (signatureRequired) {
    if (!binding.public_key_pem && !binding.public_key_jwk) {
      return {
        valid: false,
        status: 'signature_required',
        reason: 'API key requires request signatures but has no verification key configured.',
      }
    }

    try {
      if (!context || !verifySignature(binding, context)) {
        return {
          valid: false,
          status: 'signature_invalid',
          reason: 'API key request signature is missing, expired, or invalid.',
        }
      }
    } catch {
      return {
        valid: false,
        status: 'signature_invalid',
        reason: 'API key request signature could not be verified.',
      }
    }
  }

  return { valid: true, status: 'bound' }
}
