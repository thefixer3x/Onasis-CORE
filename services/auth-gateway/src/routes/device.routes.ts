/**
 * Device Authorization Grant (RFC 8628)
 * 
 * GitHub-style passwordless authentication for CLI and devices without browsers.
 * 
 * Flow:
 * 1. CLI calls POST /oauth/device - gets user_code + device_code
 * 2. User visits verification_uri in browser, enters user_code
 * 3. User authenticates (email OTP or existing session)
 * 4. CLI polls POST /oauth/token with device_code until authorized
 * 5. CLI receives access_token + refresh_token
 * 
 * Benefits:
 * - No localhost redirect needed (works in SSH, containers, remote servers)
 * - No JWT stored in ~/.config files
 * - Short-lived device codes (15 min expiry)
 * - User approves on trusted device (phone/laptop browser)
 */

import express from 'express'
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { redisClient } from '../services/cache.service.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession } from '../services/session.service.js'
import { logAuthEvent } from '../services/audit.service.js'
import { logger } from '../utils/logger.js'
import { env } from '../../config/env.js'

const router = express.Router()

// Redis key prefixes
const DEVICE_CODE_PREFIX = 'device_code:'
const USER_CODE_PREFIX = 'user_code:'

// Configuration
const DEVICE_CODE_EXPIRY = 900 // 15 minutes
const POLL_INTERVAL = 5 // seconds
const USER_CODE_LENGTH = 8 // e.g., "ABCD-1234"

interface DeviceCodeData {
  device_code: string
  user_code: string
  client_id: string
  scope: string
  expires_at: number
  interval: number
  status: 'pending' | 'authorized' | 'denied' | 'expired'
  user_id?: string
  email?: string
  project_scope?: string
}

/**
 * Generate a user-friendly code like "ABCD-1234"
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // No I, O (confusing)
  const nums = '23456789' // No 0, 1 (confusing)
  
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[crypto.randomInt(chars.length)]
  }
  code += '-'
  for (let i = 0; i < 4; i++) {
    code += nums[crypto.randomInt(nums.length)]
  }
  return code
}

/**
 * Generate a secure device code
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * POST /oauth/device
 * 
 * Request a device code for CLI authentication.
 * Returns a user_code to display and device_code for polling.
 */
router.post('/device', async (req: Request, res: Response): Promise<void> => {
  const clientId = req.body.client_id as string
  const scope = req.body.scope as string || 'lanonasis-maas'
  
  if (!clientId) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'client_id is required'
    })
    return
  }

  try {
    // Generate codes
    const deviceCode = generateDeviceCode()
    const userCode = generateUserCode()
    const expiresAt = Date.now() + (DEVICE_CODE_EXPIRY * 1000)

    const deviceData: DeviceCodeData = {
      device_code: deviceCode,
      user_code: userCode,
      client_id: clientId,
      scope,
      expires_at: expiresAt,
      interval: POLL_INTERVAL,
      status: 'pending'
    }

    // Store both codes in Redis
    // device_code -> full data (for polling)
    // user_code -> device_code reference (for verification page)
    await redisClient.setex(
      `${DEVICE_CODE_PREFIX}${deviceCode}`,
      DEVICE_CODE_EXPIRY,
      JSON.stringify(deviceData)
    )
    await redisClient.setex(
      `${USER_CODE_PREFIX}${userCode}`,
      DEVICE_CODE_EXPIRY,
      deviceCode
    )

    await logAuthEvent({
      event_type: 'device_code_requested',
      platform: 'cli',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: { client_id: clientId, user_code: userCode }
    })

    logger.info('Device code requested', { clientId, userCode })

    // Build verification URL
    const baseUrl = env.AUTH_BASE_URL || `https://auth.lanonasis.com`
    const verificationUri = `${baseUrl}/device`
    const verificationUriComplete = `${verificationUri}?code=${userCode}`

    res.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: DEVICE_CODE_EXPIRY,
      interval: POLL_INTERVAL
    })
  } catch (error) {
    logger.error('Device code request failed', { error })
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to generate device code'
    })
  }
})

/**
 * GET /oauth/device
 * 
 * Verification page where user enters the code from CLI.
 * This serves HTML or redirects to a web page.
 */
router.get('/device', async (req: Request, res: Response): Promise<void> => {
  const userCode = req.query.code as string

  // If code provided in URL, validate it
  if (userCode) {
    const deviceCode = await redisClient.get(`${USER_CODE_PREFIX}${userCode}`)
    if (!deviceCode) {
      res.status(400).send(getVerificationPageHTML('Invalid or expired code. Please try again.', userCode))
      return
    }
  }

  // Serve verification page
  res.send(getVerificationPageHTML(null, userCode || ''))
})

/**
 * POST /oauth/device/verify
 * 
 * User submits the code from CLI. This triggers email OTP verification.
 */
router.post('/device/verify', async (req: Request, res: Response): Promise<void> => {
  const userCode = (req.body.user_code as string)?.toUpperCase().replace(/\s/g, '')
  const email = req.body.email as string

  if (!userCode) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'user_code is required'
    })
    return
  }

  if (!email) {
    res.status(400).json({
      error: 'invalid_request', 
      error_description: 'email is required'
    })
    return
  }

  try {
    // Find device code from user code
    const deviceCode = await redisClient.get(`${USER_CODE_PREFIX}${userCode}`)
    if (!deviceCode) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired code'
      })
      return
    }

    // Get device data
    const deviceDataStr = await redisClient.get(`${DEVICE_CODE_PREFIX}${deviceCode}`)
    if (!deviceDataStr) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Device code expired'
      })
      return
    }

    const deviceData: DeviceCodeData = JSON.parse(deviceDataStr)

    // Store email with device for OTP verification
    deviceData.email = email.trim().toLowerCase()
    
    // Update Redis with email
    const ttl = Math.floor((deviceData.expires_at - Date.now()) / 1000)
    if (ttl > 0) {
      await redisClient.setex(
        `${DEVICE_CODE_PREFIX}${deviceCode}`,
        ttl,
        JSON.stringify(deviceData)
      )
    }

    // Return success - frontend will now show OTP input
    res.json({
      success: true,
      message: 'Email registered. Check your inbox for the verification code.',
      requires_otp: true
    })
  } catch (error) {
    logger.error('Device verification failed', { error })
    res.status(500).json({
      error: 'server_error',
      error_description: 'Verification failed'
    })
  }
})

/**
 * POST /oauth/device/authorize
 * 
 * User enters OTP code to complete authorization.
 * This marks the device_code as authorized so CLI polling succeeds.
 */
router.post('/device/authorize', async (req: Request, res: Response): Promise<void> => {
  const userCode = (req.body.user_code as string)?.toUpperCase().replace(/\s/g, '')
  const otpCode = req.body.otp_code as string
  const email = req.body.email as string

  if (!userCode || !otpCode || !email) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'user_code, email, and otp_code are required'
    })
    return
  }

  try {
    // Find device code
    const deviceCode = await redisClient.get(`${USER_CODE_PREFIX}${userCode}`)
    if (!deviceCode) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired code'
      })
      return
    }

    // Get device data
    const deviceDataStr = await redisClient.get(`${DEVICE_CODE_PREFIX}${deviceCode}`)
    if (!deviceDataStr) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Device code expired'
      })
      return
    }

    const deviceData: DeviceCodeData = JSON.parse(deviceDataStr)

    // Verify OTP with Supabase
    const { supabaseAuth } = await import('../../db/client.js')
    const { data, error } = await supabaseAuth.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otpCode,
      type: 'email'
    })

    if (error || !data.user) {
      await logAuthEvent({
        event_type: 'device_auth_failed',
        platform: 'cli',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error?.message || 'Invalid OTP',
        metadata: { user_code: userCode }
      })

      res.status(400).json({
        error: 'invalid_grant',
        error_description: error?.message || 'Invalid or expired OTP code'
      })
      return
    }

    // OTP verified! Mark device as authorized
    deviceData.status = 'authorized'
    deviceData.user_id = data.user.id
    deviceData.email = data.user.email
    deviceData.project_scope = deviceData.scope

    const ttl = Math.floor((deviceData.expires_at - Date.now()) / 1000)
    if (ttl > 0) {
      await redisClient.setex(
        `${DEVICE_CODE_PREFIX}${deviceCode}`,
        ttl,
        JSON.stringify(deviceData)
      )
    }

    // Clean up user code (one-time use)
    await redisClient.del(`${USER_CODE_PREFIX}${userCode}`)

    await logAuthEvent({
      event_type: 'device_authorized',
      user_id: data.user.id,
      platform: 'cli',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: { user_code: userCode, client_id: deviceData.client_id }
    })

    logger.info('Device authorized', { userId: data.user.id, userCode })

    res.json({
      success: true,
      message: 'Device authorized! You can close this window.',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    })
  } catch (error) {
    logger.error('Device authorization failed', { error })
    res.status(500).json({
      error: 'server_error',
      error_description: 'Authorization failed'
    })
  }
})

/**
 * POST /oauth/device/deny
 * 
 * User denies the device authorization request.
 */
router.post('/device/deny', async (req: Request, res: Response): Promise<void> => {
  const userCode = (req.body.user_code as string)?.toUpperCase().replace(/\s/g, '')

  if (!userCode) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'user_code is required'
    })
    return
  }

  try {
    const deviceCode = await redisClient.get(`${USER_CODE_PREFIX}${userCode}`)
    if (deviceCode) {
      const deviceDataStr = await redisClient.get(`${DEVICE_CODE_PREFIX}${deviceCode}`)
      if (deviceDataStr) {
        const deviceData: DeviceCodeData = JSON.parse(deviceDataStr)
        deviceData.status = 'denied'
        
        const ttl = Math.floor((deviceData.expires_at - Date.now()) / 1000)
        if (ttl > 0) {
          await redisClient.setex(
            `${DEVICE_CODE_PREFIX}${deviceCode}`,
            ttl,
            JSON.stringify(deviceData)
          )
        }
      }
      await redisClient.del(`${USER_CODE_PREFIX}${userCode}`)
    }

    res.json({ success: true, message: 'Authorization denied' })
  } catch (error) {
    logger.error('Device denial failed', { error })
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to deny authorization'
    })
  }
})

/**
 * Token endpoint extension for device_code grant type.
 * This is called by the CLI polling for authorization.
 * 
 * Note: This should be integrated into the main /oauth/token endpoint,
 * but we export it as a handler for now.
 */
export async function handleDeviceCodeGrant(
  req: Request,
  res: Response,
  deviceCode: string,
  clientId: string
): Promise<void> {
  try {
    const deviceDataStr = await redisClient.get(`${DEVICE_CODE_PREFIX}${deviceCode}`)
    
    if (!deviceDataStr) {
      res.status(400).json({
        error: 'expired_token',
        error_description: 'Device code has expired'
      })
      return
    }

    const deviceData: DeviceCodeData = JSON.parse(deviceDataStr)

    // Verify client_id matches
    if (deviceData.client_id !== clientId) {
      res.status(400).json({
        error: 'invalid_client',
        error_description: 'Client ID mismatch'
      })
      return
    }

    // Check status
    switch (deviceData.status) {
      case 'pending':
        res.status(400).json({
          error: 'authorization_pending',
          error_description: 'User has not yet authorized this device'
        })
        return

      case 'denied':
        // Clean up
        await redisClient.del(`${DEVICE_CODE_PREFIX}${deviceCode}`)
        res.status(400).json({
          error: 'access_denied',
          error_description: 'User denied authorization'
        })
        return

      case 'authorized':
        // Success! Generate tokens
        if (!deviceData.user_id || !deviceData.email) {
          res.status(400).json({
            error: 'server_error',
            error_description: 'Missing user data'
          })
          return
        }

        const tokens = generateTokenPair({
          sub: deviceData.user_id,
          email: deviceData.email,
          role: 'authenticated',
          project_scope: deviceData.project_scope || 'lanonasis-maas',
          platform: 'cli'
        })

        // Create session
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
        await createSession({
          user_id: deviceData.user_id,
          platform: 'cli',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scope: deviceData.scope ? [deviceData.scope] : undefined,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          expires_at: expiresAt,
          metadata: { grant_type: 'device_code', client_id: clientId }
        })

        // Clean up device code (one-time use)
        await redisClient.del(`${DEVICE_CODE_PREFIX}${deviceCode}`)

        await logAuthEvent({
          event_type: 'device_token_issued',
          user_id: deviceData.user_id,
          platform: 'cli',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: true,
          metadata: { client_id: clientId }
        })

        logger.info('Device token issued', { userId: deviceData.user_id, clientId })

        res.json({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: 'Bearer',
          expires_in: tokens.expires_in,
          scope: deviceData.scope
        })
        return

      default:
        res.status(400).json({
          error: 'server_error',
          error_description: 'Unknown device status'
        })
    }
  } catch (error) {
    logger.error('Device token exchange failed', { error })
    res.status(500).json({
      error: 'server_error',
      error_description: 'Token exchange failed'
    })
  }
}

/**
 * Generate HTML for the verification page
 */
function getVerificationPageHTML(error: string | null, prefillCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Device - Lan Onasis</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 2rem;
      max-width: 400px;
      width: 90%;
      backdrop-filter: blur(10px);
    }
    .logo {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo h1 {
      font-size: 1.5rem;
      background: linear-gradient(90deg, #4f46e5, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .step {
      margin-bottom: 1.5rem;
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .step-number {
      width: 24px;
      height: 24px;
      background: #4f46e5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .step-title {
      font-weight: 600;
    }
    label {
      display: block;
      font-size: 0.875rem;
      color: #9ca3af;
      margin-bottom: 0.5rem;
    }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }
    input:focus {
      outline: none;
      border-color: #4f46e5;
    }
    input.code-input {
      font-family: monospace;
      font-size: 1.25rem;
      text-align: center;
      letter-spacing: 0.25em;
      text-transform: uppercase;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(90deg, #4f46e5, #7c3aed);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.5);
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .success {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.5);
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .success h2 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .hidden { display: none; }
    .hint {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🔐 Lan Onasis</h1>
      <p style="color: #9ca3af; font-size: 0.875rem; margin-top: 0.5rem;">Authorize your CLI</p>
    </div>

    ${error ? `<div class="error">${error}</div>` : ''}

    <div id="code-step" class="step">
      <div class="step-header">
        <span class="step-number">1</span>
        <span class="step-title">Enter the code from your terminal</span>
      </div>
      <input type="text" id="user-code" class="code-input" placeholder="ABCD-1234" value="${prefillCode}" maxlength="9" />
      <button type="button" id="verify-code-btn">Continue</button>
    </div>

    <div id="email-step" class="step hidden">
      <div class="step-header">
        <span class="step-number">2</span>
        <span class="step-title">Enter your email</span>
      </div>
      <input type="email" id="email" placeholder="you@example.com" />
      <button type="button" id="send-otp-btn">Send verification code</button>
    </div>

    <div id="otp-step" class="step hidden">
      <div class="step-header">
        <span class="step-number">3</span>
        <span class="step-title">Enter the code from your email</span>
      </div>
      <input type="text" id="otp-code" class="code-input" placeholder="123456" maxlength="6" />
      <p class="hint">Check your email for a 6-digit code</p>
      <button type="button" id="authorize-btn">Authorize device</button>
    </div>

    <div id="success-step" class="success hidden">
      <h2>✅ Device Authorized!</h2>
      <p>You can now close this window and return to your terminal.</p>
    </div>

    <div id="denied-step" class="step hidden">
      <button type="button" id="deny-btn" style="background: #dc2626;">Deny this request</button>
    </div>
  </div>

  <script>
    const state = {
      userCode: '${prefillCode}',
      email: ''
    };

    // Format code input (ABCD-1234)
    document.getElementById('user-code').addEventListener('input', (e) => {
      let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4, 8);
      e.target.value = v;
      state.userCode = v;
    });

    // Step 1: Verify code exists
    document.getElementById('verify-code-btn').addEventListener('click', async () => {
      const code = state.userCode.replace(/-/g, '');
      if (code.length !== 8) {
        alert('Please enter a valid 8-character code');
        return;
      }
      
      document.getElementById('code-step').classList.add('hidden');
      document.getElementById('email-step').classList.remove('hidden');
      document.getElementById('denied-step').classList.remove('hidden');
    });

    // Step 2: Send OTP to email
    document.getElementById('send-otp-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value;
      if (!email || !email.includes('@')) {
        alert('Please enter a valid email');
        return;
      }
      state.email = email;

      try {
        const res = await fetch('/oauth/device/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_code: state.userCode, email })
        });
        const data = await res.json();
        
        if (!res.ok) {
          alert(data.error_description || 'Failed to send code');
          return;
        }

        // Also trigger Supabase OTP
        await fetch('/v1/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, platform: 'web' })
        });

        document.getElementById('email-step').classList.add('hidden');
        document.getElementById('otp-step').classList.remove('hidden');
      } catch (err) {
        alert('Failed to send verification code');
      }
    });

    // Step 3: Verify OTP and authorize
    document.getElementById('authorize-btn').addEventListener('click', async () => {
      const otpCode = document.getElementById('otp-code').value;
      if (!otpCode || otpCode.length !== 6) {
        alert('Please enter the 6-digit code from your email');
        return;
      }

      try {
        const res = await fetch('/oauth/device/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_code: state.userCode,
            email: state.email,
            otp_code: otpCode
          })
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.error_description || 'Authorization failed');
          return;
        }

        document.getElementById('otp-step').classList.add('hidden');
        document.getElementById('denied-step').classList.add('hidden');
        document.getElementById('success-step').classList.remove('hidden');
      } catch (err) {
        alert('Authorization failed');
      }
    });

    // Deny button
    document.getElementById('deny-btn').addEventListener('click', async () => {
      await fetch('/oauth/device/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: state.userCode })
      });
      alert('Request denied. You can close this window.');
      window.close();
    });

    // Auto-focus and auto-advance if code is prefilled
    if ('${prefillCode}') {
      document.getElementById('user-code').select();
    }
  </script>
</body>
</html>`;
}

export default router
