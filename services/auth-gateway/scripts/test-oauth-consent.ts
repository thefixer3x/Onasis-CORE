#!/usr/bin/env bun
/**
 * Test script for Auth Gateway OAuth 2.1 consent flow
 *
 * This simulates an MCP client initiating OAuth to test the consent page.
 *
 * Usage:
 *   bun run scripts/test-oauth-consent.ts
 *
 * What it does:
 *   1. Generates PKCE code_verifier and code_challenge
 *   2. Starts a local callback server on port 8888
 *   3. Opens browser to Auth Gateway OAuth authorize endpoint
 *   4. Waits for callback with authorization code
 *   5. Exchanges code for tokens
 */

import crypto from 'crypto'
import http from 'http'
import { exec } from 'child_process'

// Configuration
const CONFIG = {
  // Auth Gateway URL (the actual OAuth server)
  authGatewayUrl: 'https://auth.lanonasis.com',

  // Use existing cursor client (already registered)
  clientId: 'cursor',

  // Local callback
  callbackPort: 8888,
  redirectUri: 'http://localhost:8888/callback',

  // Scopes to request (supported: memories:read, memories:write, mcp:connect, api:access)
  scopes: ['memories:read', 'memories:write', 'mcp:connect'],
}

// PKCE helpers
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return base64URLEncode(hash)
}

// Generate state for CSRF protection
function generateState(): string {
  return base64URLEncode(crypto.randomBytes(16))
}

// Main test
async function main() {
  console.log('\n🔐 Auth Gateway OAuth 2.1 Provider Test\n')
  console.log('━'.repeat(50))

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  console.log('\n📦 PKCE Parameters:')
  console.log(`   code_verifier:  ${codeVerifier.substring(0, 20)}...`)
  console.log(`   code_challenge: ${codeChallenge.substring(0, 20)}...`)
  console.log(`   state:          ${state}`)

  // Build authorize URL (Auth Gateway OAuth endpoint)
  const authorizeUrl = new URL('/oauth/authorize', CONFIG.authGatewayUrl)
  authorizeUrl.searchParams.set('client_id', CONFIG.clientId)
  authorizeUrl.searchParams.set('redirect_uri', CONFIG.redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', CONFIG.scopes.join(' '))
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  console.log('\n🌐 Authorization URL:')
  console.log(`   ${authorizeUrl.toString()}\n`)

  // Start callback server
  console.log(`📡 Starting callback server on port ${CONFIG.callbackPort}...`)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${CONFIG.callbackPort}`)

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        console.log('\n❌ OAuth Error:')
        console.log(`   Error: ${error}`)
        console.log(`   Description: ${errorDescription}`)

        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: monospace; background: #0a0a0a; color: #ff5f56; padding: 40px;">
              <h2>OAuth Error</h2>
              <p><strong>Error:</strong> ${error}</p>
              <p><strong>Description:</strong> ${errorDescription}</p>
            </body>
          </html>
        `)
        server.close()
        process.exit(1)
      }

      if (!code) {
        console.log('\n❌ No authorization code received')
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('No code received')
        server.close()
        process.exit(1)
      }

      // Verify state
      if (returnedState !== state) {
        console.log('\n❌ State mismatch - possible CSRF attack!')
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('State mismatch')
        server.close()
        process.exit(1)
      }

      console.log('\n✅ Authorization code received!')
      console.log(`   Code: ${code.substring(0, 20)}...`)

      // Exchange code for tokens
      console.log('\n🔄 Exchanging code for tokens...')

      try {
        const tokenResponse = await fetch(`${CONFIG.authGatewayUrl}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: CONFIG.redirectUri,
            client_id: CONFIG.clientId,
            code_verifier: codeVerifier,
          }),
        })

        const tokens = await tokenResponse.json()

        if (!tokenResponse.ok) {
          console.log('\n❌ Token exchange failed:')
          console.log(JSON.stringify(tokens, null, 2))

          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(`
            <html>
              <body style="font-family: monospace; background: #0a0a0a; color: #ff5f56; padding: 40px;">
                <h2>Token Exchange Failed</h2>
                <pre>${JSON.stringify(tokens, null, 2)}</pre>
              </body>
            </html>
          `)
        } else {
          console.log('\n✅ Tokens received!')
          console.log('━'.repeat(50))
          console.log('\n📄 Token Response:')
          console.log(JSON.stringify(tokens, null, 2))

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`
            <html>
              <body style="font-family: monospace; background: #0a0a0a; color: #00ff00; padding: 40px;">
                <h2>✅ OAuth Flow Complete!</h2>
                <p>Authorization successful. Check the terminal for token details.</p>
                <pre style="background: #1a1a1a; padding: 20px; border-radius: 8px; overflow: auto;">
access_token: ${tokens.access_token?.substring(0, 50)}...
token_type: ${tokens.token_type}
expires_in: ${tokens.expires_in}
refresh_token: ${tokens.refresh_token ? tokens.refresh_token.substring(0, 20) + '...' : 'N/A'}
                </pre>
                <p style="color: #888;">You can close this window.</p>
              </body>
            </html>
          `)
        }
      } catch (err) {
        console.log('\n❌ Token exchange error:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Token exchange failed')
      }

      server.close()
      console.log('\n👋 Test complete. Server closed.\n')
      process.exit(0)
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  server.listen(CONFIG.callbackPort, () => {
    console.log(`   Listening at ${CONFIG.redirectUri}\n`)
    console.log('━'.repeat(50))
    console.log('\n🚀 Opening browser...\n')

    // Open browser
    const openCommand = process.platform === 'darwin' ? 'open' :
                       process.platform === 'win32' ? 'start' : 'xdg-open'

    exec(`${openCommand} "${authorizeUrl.toString()}"`, (err) => {
      if (err) {
        console.log('⚠️  Could not open browser automatically.')
        console.log('   Please open this URL manually:\n')
        console.log(`   ${authorizeUrl.toString()}\n`)
      }
    })

    console.log('⏳ Waiting for authorization callback...')
    console.log('   (Press Ctrl+C to cancel)\n')
  })

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Test cancelled.')
    server.close()
    process.exit(0)
  })
}

main().catch(console.error)
