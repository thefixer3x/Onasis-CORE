import crypto from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  readApiKeyBinding,
  validateApiKeyBinding,
  type ApiKeyValidationContext,
} from '../../src/services/caller-binding.service.js'

const baseContext: ApiKeyValidationContext = {
  audience: 'auth-gateway',
  projectScope: 'lanonasis-maas',
  clientId: 'codex-cli',
  installationId: 'vps-main',
  method: 'POST',
  path: '/v1/auth/introspect',
  timestamp: Math.floor(Date.now() / 1000).toString(),
  nonce: 'nonce-123',
  contentSha256: 'body-hash',
}

describe('api-key binding validation', () => {
  it('normalizes only allowlisted public binding fields', () => {
    expect(
      readApiKeyBinding({
        binding: {
          audience: 'auth-gateway',
          clientId: 'codex-cli',
          installationId: 'vps-main',
          private_key_pem: 'must-not-be-kept',
        },
      })
    ).toEqual({
      audiences: ['auth-gateway'],
      client_id: 'codex-cli',
      installation_id: 'vps-main',
    })
  })

  it('allows legacy unbound keys unless binding is explicitly required', () => {
    expect(validateApiKeyBinding({}, baseContext)).toMatchObject({
      valid: true,
      status: 'legacy_unbound',
    })
  })

  it('rejects legacy unbound keys when binding is required for this request', () => {
    expect(validateApiKeyBinding({}, { ...baseContext, enforceBinding: true })).toMatchObject({
      valid: false,
      status: 'binding_required',
    })
  })

  it('rejects a bound key when the audience does not match', () => {
    expect(
      validateApiKeyBinding(
        { binding: { audiences: ['memory-service'] } },
        { ...baseContext, audience: 'auth-gateway' }
      )
    ).toMatchObject({
      valid: false,
      status: 'binding_mismatch',
    })
  })

  it('accepts a bound key when audience, client, and installation match', () => {
    expect(
      validateApiKeyBinding(
        {
          binding: {
            audiences: ['auth-gateway'],
            client_id: 'codex-cli',
            installation_id: 'vps-main',
          },
        },
        baseContext
      )
    ).toMatchObject({
      valid: true,
      status: 'bound',
    })
  })

  it('verifies request signatures for proof-of-possession bindings', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })
    const payload = [
      baseContext.method,
      baseContext.path,
      baseContext.timestamp,
      baseContext.nonce,
      baseContext.contentSha256,
      baseContext.audience,
      baseContext.projectScope,
      baseContext.clientId,
      baseContext.installationId,
    ].join('\n')
    const signature = crypto.sign('sha256', Buffer.from(payload), privateKey).toString('base64')

    expect(
      validateApiKeyBinding(
        {
          binding: {
            audiences: ['auth-gateway'],
            client_id: 'codex-cli',
            installation_id: 'vps-main',
            public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            require_request_signature: true,
          },
        },
        { ...baseContext, signature: `v1=${signature}` }
      )
    ).toMatchObject({
      valid: true,
      status: 'bound',
    })
  })
})
