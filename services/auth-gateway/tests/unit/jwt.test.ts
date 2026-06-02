import { describe, it, expect } from 'vitest'
import { generateTokenPair, verifyToken, extractBearerToken } from '../../src/utils/jwt.js'

describe('JWT utility (real sign/verify round-trip)', () => {
  const payload = {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'authenticated',
    project_scope: 'lanonasis-maas',
    organization_id: 'org-123',
  }

  it('signs and verifies a token round-trip', () => {
    const pair = generateTokenPair(payload)
    expect(pair.access_token).toBeTruthy()
    expect(pair.refresh_token).toBeTruthy()
    expect(pair.expires_in).toBeGreaterThan(0)

    const decoded = verifyToken(pair.access_token)
    expect(decoded.sub).toBe('user-123')
    expect(decoded.email).toBe('test@example.com')
    expect(decoded.role).toBe('authenticated')
    expect(decoded.project_scope).toBe('lanonasis-maas')
    expect(decoded.organization_id).toBe('org-123')
  })

  it('refresh token has type=refresh', () => {
    const pair = generateTokenPair(payload)
    const decoded = verifyToken(pair.refresh_token)
    expect((decoded as any).type).toBe('refresh')
    expect(decoded.sub).toBe('user-123')
  })

  it('rejects an invalid token', () => {
    expect(() => verifyToken('not-a-real-token')).toThrow()
  })

  it('rejects a token signed with a different secret', () => {
    const pair = generateTokenPair(payload)
    // Tamper the token
    const parts = pair.access_token.split('.')
    const tampered = [parts[0], parts[1], 'tampered-signature'].join('.')
    expect(() => verifyToken(tampered)).toThrow()
  })

  it('extractBearerToken returns null for missing header', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
  })

  it('extractBearerToken returns null for non-Bearer header', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
  })

  it('extractBearerToken strips Bearer prefix', () => {
    expect(extractBearerToken('Bearer my-token-here')).toBe('my-token-here')
  })
})
