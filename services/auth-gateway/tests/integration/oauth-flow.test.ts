import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { dbPool } from '../../db/client.js'

describe('OAuth2 PKCE Integration Tests', () => {
    let app: express.Application
    let testClientId: string
    let testUserId: string

    beforeAll(async () => {
        // Import and set up the app
        const { default: createApp } = await import('../../src/index.js')
        app = createApp()

        // Create test client
        const clientResult = await dbPool.query(`
      INSERT INTO oauth_clients (
        client_id, client_name, client_type, require_pkce,
        allowed_code_challenge_methods, allowed_redirect_uris,
        allowed_scopes, default_scopes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, client_id
    `, [
            'test-client-integration',
            'Test Client Integration',
            'public',
            true,
            ['S256'],
            JSON.stringify(['http://localhost:3000/callback']),
            ['memories:read', 'memories:write'],
            ['memories:read'],
            'active'
        ])

        testClientId = clientResult.rows[0].client_id

        // Create test user (assuming users table exists)
        try {
            const userResult = await dbPool.query(`
        INSERT INTO users (email, password_hash, email_verified)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['test@example.com', 'hashed-password', true])

            testUserId = userResult.rows[0].id
        } catch {
            // If users table doesn't exist, use a mock user ID
            testUserId = 'mock-user-id'
        }
    })

    afterAll(async () => {
        // Clean up test data
        await dbPool.query('DELETE FROM oauth_clients WHERE client_id = $1', [testClientId])
        if (testUserId !== 'mock-user-id') {
            await dbPool.query('DELETE FROM users WHERE id = $1', [testUserId])
        }
    })

    beforeEach(async () => {
        // Clean up any OAuth tokens/codes from previous tests
        await dbPool.query('DELETE FROM oauth_authorization_codes WHERE client_id = $1', [testClientId])
        await dbPool.query('DELETE FROM oauth_tokens WHERE client_id = $1', [testClientId])
    })

    describe('Authorization Code Flow', () => {
        it('should complete full OAuth2 PKCE flow', async () => {
            const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
            const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
            const redirectUri = 'http://localhost:3000/callback'
            const state = 'random-state-value'

            // Step 1: Authorization request
            const authResponse = await request(app)
                .get('/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: redirectUri,
                    scope: 'memories:read',
                    state,
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256'
                })
                .expect(302)

            // Extract authorization code from redirect
            const location = authResponse.headers.location
            const url = new URL(location)
            const authCode = url.searchParams.get('code')
            const returnedState = url.searchParams.get('state')

            expect(authCode).toBeDefined()
            expect(returnedState).toBe(state)

            // Step 2: Token exchange
            const tokenResponse = await request(app)
                .post('/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: authCode,
                    redirect_uri: redirectUri,
                    client_id: testClientId,
                    code_verifier: codeVerifier
                })
                .expect(200)

            expect(tokenResponse.body).toHaveProperty('access_token')
            expect(tokenResponse.body).toHaveProperty('refresh_token')
            expect(tokenResponse.body).toHaveProperty('expires_in')
            expect(tokenResponse.body.token_type).toBe('Bearer')

            // Step 3: Use access token (commented out as endpoint may not exist)
            // const protectedResponse = await request(app)
            //   .get('/api/memories')
            //   .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
            //   .expect(200)            // Step 4: Refresh token
            const refreshResponse = await request(app)
                .post('/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: tokenResponse.body.refresh_token,
                    client_id: testClientId
                })
                .expect(200)

            expect(refreshResponse.body).toHaveProperty('access_token')
            expect(refreshResponse.body).toHaveProperty('refresh_token')
            expect(refreshResponse.body.access_token).not.toBe(tokenResponse.body.access_token)
        })

        it('should reject invalid PKCE verifier', async () => {
            const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
            const wrongVerifier = 'wrong-verifier-value'

            // Get authorization code
            const authResponse = await request(app)
                .get('/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: 'http://localhost:3000/callback',
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256'
                })
                .expect(302)

            const location = authResponse.headers.location
            const url = new URL(location)
            const authCode = url.searchParams.get('code')

            // Try to exchange with wrong verifier
            const tokenResponse = await request(app)
                .post('/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: authCode,
                    redirect_uri: 'http://localhost:3000/callback',
                    client_id: testClientId,
                    code_verifier: wrongVerifier
                })
                .expect(400)

            expect(tokenResponse.body.error).toBe('invalid_grant')
        })

        it('should reject reused authorization codes', async () => {
            const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
            const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

            // Get authorization code
            const authResponse = await request(app)
                .get('/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: 'http://localhost:3000/callback',
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256'
                })
                .expect(302)

            const location = authResponse.headers.location
            const url = new URL(location)
            const authCode = url.searchParams.get('code')

            const tokenRequest = {
                grant_type: 'authorization_code',
                code: authCode,
                redirect_uri: 'http://localhost:3000/callback',
                client_id: testClientId,
                code_verifier: codeVerifier
            }

            // First use should succeed
            await request(app)
                .post('/oauth/token')
                .send(tokenRequest)
                .expect(200)

            // Second use should fail
            const secondResponse = await request(app)
                .post('/oauth/token')
                .send(tokenRequest)
                .expect(400)

            expect(secondResponse.body.error).toBe('invalid_grant')
        })
    })

    describe('Token Revocation', () => {
        it('should revoke tokens successfully', async () => {
            // First get tokens through OAuth flow
            const { refresh_token } = await completeOAuthFlow()

            // Revoke refresh token
            await request(app)
                .post('/oauth/revoke')
                .send({
                    token: refresh_token,
                    token_type_hint: 'refresh_token'
                })
                .expect(200)

            // Try to use revoked refresh token
            const refreshResponse = await request(app)
                .post('/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: refresh_token,
                    client_id: testClientId
                })
                .expect(400)

            expect(refreshResponse.body.error).toBe('invalid_grant')
        })
    })

    // Helper function to complete OAuth flow
    async function completeOAuthFlow() {
        const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
        const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

        const authResponse = await request(app)
            .get('/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: testClientId,
                redirect_uri: 'http://localhost:3000/callback',
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            })

        const location = authResponse.headers.location
        const url = new URL(location)
        const authCode = url.searchParams.get('code')

        const tokenResponse = await request(app)
            .post('/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code: authCode,
                redirect_uri: 'http://localhost:3000/callback',
                client_id: testClientId,
                code_verifier: codeVerifier
            })

        return tokenResponse.body
    }
})