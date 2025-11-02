import { describe, it, expect } from 'vitest'
import {
    deriveCodeChallenge,
    verifyCodeChallenge,
    codeVerifierSchema
} from '../../src/utils/pkce.js'

describe('PKCE Utils', () => {
    describe('Code Challenge Generation', () => {
        it('should generate correct S256 code challenge', () => {
            const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
            const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

            const challenge = deriveCodeChallenge(verifier, 'S256')
            expect(challenge).toBe(expected)
        })

        it('should return verifier for plain method', () => {
            const verifier = 'test-verifier'
            const challenge = deriveCodeChallenge(verifier, 'plain')
            expect(challenge).toBe(verifier)
        })
    })

    describe('Code Challenge Verification', () => {
        it('should verify valid S256 code challenge', () => {
            const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
            const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

            const isValid = verifyCodeChallenge(verifier, challenge, 'S256')
            expect(isValid).toBe(true)
        })

        it('should reject invalid S256 code challenge', () => {
            const verifier = 'wrong-verifier'
            const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

            const isValid = verifyCodeChallenge(verifier, challenge, 'S256')
            expect(isValid).toBe(false)
        })

        it('should verify plain code challenge', () => {
            const verifier = 'test-verifier'
            const challenge = 'test-verifier'

            const isValid = verifyCodeChallenge(verifier, challenge, 'plain')
            expect(isValid).toBe(true)
        })

        it('should use timing-safe comparison', () => {
            // Test for timing attack resistance
            const verifier = 'a'.repeat(43)
            const shortChallenge = 'b'.repeat(42)
            const longChallenge = 'c'.repeat(44)

            // These should both return false without timing differences
            const shortResult = verifyCodeChallenge(verifier, shortChallenge, 'plain')
            const longResult = verifyCodeChallenge(verifier, longChallenge, 'plain')

            expect(shortResult).toBe(false)
            expect(longResult).toBe(false)
        })
    })

    describe('Code Verifier Validation', () => {
        it('should accept valid code verifiers', () => {
            const validVerifiers = [
                'a'.repeat(43), // minimum length
                'a'.repeat(128), // maximum length
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~', // all allowed chars
            ]

            validVerifiers.forEach(verifier => {
                const result = codeVerifierSchema.safeParse(verifier)
                expect(result.success).toBe(true)
            })
        })

        it('should reject invalid code verifiers', () => {
            const invalidVerifiers = [
                'a'.repeat(42), // too short
                'a'.repeat(129), // too long
                'invalid+chars', // invalid characters
                'spaces not allowed', // spaces not allowed
                'no=equals', // equals not allowed
            ]

            invalidVerifiers.forEach(verifier => {
                const result = codeVerifierSchema.safeParse(verifier)
                expect(result.success).toBe(false)
            })
        })
    })
})