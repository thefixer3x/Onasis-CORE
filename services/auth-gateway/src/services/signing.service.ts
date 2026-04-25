import { env } from '../../config/env.js'
import { logger } from '../utils/logger.js'

export interface SigningKey {
    kid: string
    key: string // PEM
    alg: 'RS256' | 'RS512'
    use: 'sig'
    createdAt: number
}

export interface JWKS {
    keys: Array<{
        kty: 'RSA'
        use: 'sig'
        kid: string
        alg: 'RS256' | 'RS512'
        n: string
        e: string
    }>
}

let cachedActiveKey: SigningKey | null = null
let cachedNextKey: SigningKey | null = null
let keyLoadErrors = 0

function loadPem(keyBase64: string, label: string): string {
    try {
        const pem = Buffer.from(keyBase64, 'base64').toString('utf8')
        if (!pem.includes('-----BEGIN')) {
            throw new Error('Not PEM format')
        }
        return pem
    } catch {
        throw new Error(`${label} must be base64-encoded PEM`)
    }
}

export function loadSigningKey(): SigningKey | null {
    const raw = env.OAUTH_ASYMMETRIC_PRIVATE_KEY
    if (!raw) return null

    try {
        const pem = loadPem(raw, 'OAUTH_ASYMMETRIC_PRIVATE_KEY')
        const kid = env.OAUTH_ASYMMETRIC_KID || 'active-1'
        return {
            kid,
            key: pem,
            alg: 'RS256',
            use: 'sig',
            createdAt: Date.now(),
        }
    } catch (err) {
        logger.error('Failed to load asymmetric signing key', err)
        return null
    }
}

export function loadNextSigningKey(): SigningKey | null {
    const raw = env.OAUTH_NEXT_ASYMMETRIC_PRIVATE_KEY
    if (!raw) return null

    try {
        const pem = loadPem(raw, 'OAUTH_NEXT_ASYMMETRIC_PRIVATE_KEY')
        const kid = env.OAUTH_NEXT_KID || 'next-1'
        return {
            kid,
            key: pem,
            alg: 'RS256',
            use: 'sig',
            createdAt: Date.now(),
        }
    } catch (err) {
        logger.error('Failed to load next asymmetric signing key', err)
        return null
    }
}

export function getActiveSigningKey(): SigningKey | null {
    if (!cachedActiveKey) {
        cachedActiveKey = loadSigningKey()
        if (cachedActiveKey) {
            logger.info('Loaded active asymmetric signing key', { kid: cachedActiveKey.kid })
        }
    }
    return cachedActiveKey
}

export function getNextSigningKey(): SigningKey | null {
    if (!cachedNextKey) {
        cachedNextKey = loadNextSigningKey()
    }
    return cachedNextKey
}

export function getJWKS(): JWKS {
    const jwks: JWKS = { keys: [] }

    for (const key of [getActiveSigningKey(), getNextSigningKey()]) {
        if (!key) continue

        try {
            const { createPublicKey } = require('node:crypto')
            const cryptoKey = createPublicKey(key.key)
            const jwk = cryptoKey.export({ format: 'jwk' }) as { n: Buffer; e: Buffer }

            jwks.keys.push({
                kty: 'RSA',
                use: 'sig',
                kid: key.kid,
                alg: key.alg,
                n: base64urlEncode(jwk.n),
                e: base64urlEncode(jwk.e),
            })
        } catch (err) {
            logger.warn('Failed to export key to JWKS', { kid: key.kid, err })
        }
    }

    return jwks
}

function base64urlEncode(data: Buffer | Uint8Array): string {
    return Buffer.from(data).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

export function clearSigningKeyCache(): void {
    cachedActiveKey = null
    cachedNextKey = null
}

export function isAsymmetricSigningEnabled(): boolean {
    return getActiveSigningKey() !== null
}

export function getActiveKid(): string | null {
    return getActiveSigningKey()?.kid ?? null
}

export function recordKeyLoadError(): void {
    keyLoadErrors++
}

export function getKeyLoadErrorCount(): number {
    return keyLoadErrors
}
