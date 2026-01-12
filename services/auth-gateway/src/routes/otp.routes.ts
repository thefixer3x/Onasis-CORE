/**
 * OTP Authentication Routes (Multi-Platform Support)
 *
 * Provides passwordless login via email for CLI, web, and API clients.
 * Supports two modes:
 * - OTP Code (type: 'email'): User manually enters 6-digit code (CLI, mobile)
 * - Magic Link (type: 'magiclink'): User clicks link in email (web, desktop)
 *
 * Flow:
 * 1. POST /v1/auth/otp/send - Request OTP code or magic link via email
 * 2. POST /v1/auth/otp/verify - Verify code/link and get tokens
 * 3. POST /v1/auth/otp/resend - Resend OTP code
 */

import express from 'express'
import type { Request, Response } from 'express'
import { supabaseAuth } from '../../db/client.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession } from '../services/session.service.js'
import { upsertUserAccount } from '../services/user.service.js'
import { logAuthEvent } from '../services/audit.service.js'
import { redisClient } from '../services/cache.service.js'
import { logger } from '../utils/logger.js'

const router = express.Router()

type Platform = 'mcp' | 'cli' | 'web' | 'api'
type OtpType = 'email' | 'magiclink'

const OTP_STATE_PREFIX = 'otp_state:'
const OTP_STATE_TTL_SECONDS = 600 // 10 minutes

interface OtpStateData {
  email: string
  type: OtpType
  redirect_uri?: string
  project_scope?: string
  platform: Platform
  created_at: number
}

/**
 * Validate and normalize platform input
 */
function normalizePlatform(input?: string): Platform {
  const normalized = input?.toLowerCase()
  if (normalized && ['mcp', 'cli', 'web', 'api'].includes(normalized)) {
    return normalized as Platform
  }
  return 'cli' // Default to CLI for backward compatibility
}

/**
 * Validate and normalize OTP type
 */
function normalizeOtpType(input?: string): OtpType {
  const normalized = input?.toLowerCase()
  if (normalized === 'magiclink') {
    return 'magiclink'
  }
  return 'email' // Default to email OTP code
}

/**
 * POST /v1/auth/otp/send
 * Send OTP code or magic link to email for passwordless authentication
 *
 * Request body:
 * - email (required): User's email address
 * - type (optional): 'email' for 6-digit code (default), 'magiclink' for clickable link
 * - platform (optional): 'cli', 'web', 'api', 'mcp' (default: 'cli')
 * - redirect_uri (optional): Redirect URL after magic link auth (web only)
 * - project_scope (optional): Project scope for token
 */
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  const emailInput = req.body.email as string | undefined
  const projectScope = req.body.project_scope as string | undefined
  const redirectUri = req.body.redirect_uri as string | undefined
  const platform = normalizePlatform(req.body.platform)
  const type = normalizeOtpType(req.body.type)

  if (!emailInput) {
    res.status(400).json({
      error: 'Email is required',
      code: 'MISSING_EMAIL',
      message: 'Please provide an email address'
    })
    return
  }

  const email = emailInput.trim().toLowerCase()

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    res.status(400).json({
      error: 'Invalid email format',
      code: 'INVALID_EMAIL',
      message: 'Please provide a valid email address'
    })
    return
  }

  // Validate redirect_uri for magic link flow
  if (type === 'magiclink' && redirectUri) {
    try {
      new URL(redirectUri)
    } catch {
      res.status(400).json({
        error: 'Invalid redirect_uri',
        code: 'INVALID_REDIRECT_URI',
        message: 'redirect_uri must be a valid URL'
      })
      return
    }
  }

  try {
    // Store state for verification step
    const stateKey = `${OTP_STATE_PREFIX}${email}`
    const stateData: OtpStateData = {
      email,
      type,
      redirect_uri: redirectUri,
      project_scope: projectScope,
      platform,
      created_at: Date.now()
    }

    await redisClient.setex(stateKey, OTP_STATE_TTL_SECONDS, JSON.stringify(stateData))

    // Send OTP via Supabase
    // For magic link, we set emailRedirectTo so user gets a clickable link
    // For email OTP, we don't set it so user gets a 6-digit code
    const supabaseOptions: {
      shouldCreateUser: boolean
      emailRedirectTo?: string
    } = {
      shouldCreateUser: true // Allow new users
    }

    if (type === 'magiclink' && redirectUri) {
      supabaseOptions.emailRedirectTo = redirectUri
    }

    const { error } = await supabaseAuth.auth.signInWithOtp({
      email,
      options: supabaseOptions
    })

    if (error) {
      logger.warn('OTP send failed', {
        email: email.substring(0, 3) + '***',
        type,
        error: error.message,
        code: error.status
      })

      // Handle rate limiting from Supabase
      if (error.message.includes('rate') || error.status === 429) {
        res.status(429).json({
          error: 'Rate limited',
          code: 'OTP_RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          retry_after: 60
        })
        return
      }

      await logAuthEvent({
        event_type: 'otp_send_failed',
        platform,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error.message,
        metadata: { email: email.substring(0, 3) + '***', type }
      })

      res.status(400).json({
        error: 'Failed to send OTP',
        code: 'OTP_SEND_FAILED',
        message: error.message
      })
      return
    }

    await logAuthEvent({
      event_type: 'otp_sent',
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: {
        email: email.substring(0, 3) + '***',
        type,
        project_scope: projectScope
      }
    })

    logger.info('OTP sent successfully', {
      email: email.substring(0, 3) + '***',
      type,
      platform
    })

    const message = type === 'magiclink'
      ? 'Magic link sent! Check your email and click the link to sign in.'
      : 'OTP code sent! Check your email inbox for the 6-digit code.'

    res.json({
      success: true,
      message,
      type,
      expires_in: OTP_STATE_TTL_SECONDS
    })
  } catch (error) {
    logger.error('OTP send error', { error })

    res.status(500).json({
      error: 'Server error',
      code: 'OTP_SERVER_ERROR',
      message: 'Failed to send OTP. Please try again.'
    })
  }
})

/**
 * POST /v1/auth/otp/verify
 * Verify OTP code or magic link token and return auth tokens
 *
 * Request body:
 * - email (required): User's email address
 * - token (required): 6-digit code or magic link token
 * - type (optional): 'email' (default) or 'magiclink'
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  const emailInput = req.body.email as string | undefined
  const token = req.body.token as string | undefined
  const type = normalizeOtpType(req.body.type)

  if (!emailInput) {
    res.status(400).json({
      error: 'Email is required',
      code: 'MISSING_EMAIL'
    })
    return
  }

  if (!token) {
    res.status(400).json({
      error: 'OTP code is required',
      code: 'MISSING_TOKEN'
    })
    return
  }

  const email = emailInput.trim().toLowerCase()

  // Get stored state
  const stateKey = `${OTP_STATE_PREFIX}${email}`
  let stateData: OtpStateData | null = null

  try {
    const stored = await redisClient.get(stateKey)
    if (stored) {
      stateData = JSON.parse(stored) as OtpStateData
    }
  } catch (error) {
    logger.error('Failed to read OTP state', { error, email: email.substring(0, 3) + '***' })
  }

  // Use stored state or request params
  const platform: Platform = stateData?.platform || normalizePlatform(req.body.platform)
  const projectScope = stateData?.project_scope || req.body.project_scope
  const verifyType = stateData?.type || type

  try {
    // Verify OTP with Supabase
    // IMPORTANT: Supabase verifyOtp type must be 'email' for 6-digit codes
    // Our internal 'magiclink' type only affects how we SEND (link vs code),
    // but verification of codes always uses 'email' type.
    // Magic link tokens are verified via the callback URL redirect, not this endpoint.
    const { data, error } = await supabaseAuth.auth.verifyOtp({
      email,
      token,
      type: 'email' // Always 'email' for 6-digit OTP code verification
    })

    if (error || !data.user || !data.session) {
      logger.warn('OTP verification failed', {
        email: email.substring(0, 3) + '***',
        type: verifyType,
        error: error?.message
      })

      await logAuthEvent({
        event_type: 'otp_verify_failed',
        platform,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error?.message || 'Invalid OTP',
        metadata: { email: email.substring(0, 3) + '***', type: verifyType }
      })

      res.status(400).json({
        error: 'Invalid or expired OTP code',
        code: 'OTP_INVALID',
        message: error?.message || 'The code you entered is invalid or has expired'
      })
      return
    }

    // Clear the OTP state
    await redisClient.del(stateKey)

    // Upsert user in our database
    await upsertUserAccount({
      user_id: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      provider: 'otp',
      raw_metadata: data.user.user_metadata || {},
      last_sign_in_at: data.user.last_sign_in_at || null
    })

    // Update user metadata with project scope if provided
    if (projectScope) {
      try {
        await supabaseAuth.auth.admin.updateUserById(data.user.id, {
          user_metadata: {
            ...data.user.user_metadata,
            project_scope: projectScope
          }
        })
      } catch (updateError) {
        logger.warn('Failed to update user project scope', {
          userId: data.user.id,
          error: updateError instanceof Error ? updateError.message : updateError
        })
      }
    }

    const resolvedProjectScope = projectScope || data.user.user_metadata?.project_scope || 'lanonasis-maas'

    // Generate auth-gateway tokens
    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      project_scope: resolvedProjectScope,
      platform
    })

    // Create session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user.id,
      platform,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: resolvedProjectScope ? [resolvedProjectScope] : undefined,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
      metadata: { provider: 'otp', type: verifyType }
    })

    await logAuthEvent({
      event_type: 'otp_login_success',
      user_id: data.user.id,
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: {
        email: email.substring(0, 3) + '***',
        type: verifyType,
        project_scope: resolvedProjectScope
      }
    })

    logger.info('OTP verification successful', {
      userId: data.user.id,
      email: email.substring(0, 3) + '***',
      type: verifyType,
      platform
    })

    // Return tokens in OAuth-compatible format
    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      scope: resolvedProjectScope,
      auth_method: verifyType === 'magiclink' ? 'magic_link' : 'otp',
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'authenticated'
      }
    })
  } catch (error) {
    logger.error('OTP verification error', { error })

    await logAuthEvent({
      event_type: 'otp_verify_error',
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      metadata: { email: email.substring(0, 3) + '***' }
    })

    res.status(500).json({
      error: 'Server error',
      code: 'OTP_SERVER_ERROR',
      message: 'Failed to verify OTP. Please try again.'
    })
  }
})

/**
 * POST /v1/auth/otp/resend
 * Resend OTP code (alias for /send with same email)
 *
 * Request body:
 * - email (required): User's email address
 * - type (optional): 'email' (default) or 'magiclink'
 */
router.post('/resend', async (req: Request, res: Response): Promise<void> => {
  const emailInput = req.body.email as string | undefined
  const type = normalizeOtpType(req.body.type)
  const redirectUri = req.body.redirect_uri as string | undefined

  if (!emailInput) {
    res.status(400).json({
      error: 'Email is required',
      code: 'MISSING_EMAIL'
    })
    return
  }

  const email = emailInput.trim().toLowerCase()

  try {
    const supabaseOptions: {
      shouldCreateUser: boolean
      emailRedirectTo?: string
    } = {
      shouldCreateUser: false // Don't create new user on resend
    }

    if (type === 'magiclink' && redirectUri) {
      supabaseOptions.emailRedirectTo = redirectUri
    }

    const { error } = await supabaseAuth.auth.signInWithOtp({
      email,
      options: supabaseOptions
    })

    if (error) {
      if (error.message.includes('rate') || error.status === 429) {
        res.status(429).json({
          error: 'Rate limited',
          code: 'OTP_RATE_LIMITED',
          message: 'Please wait before requesting another code',
          retry_after: 60
        })
        return
      }

      res.status(400).json({
        error: 'Failed to resend OTP',
        code: 'OTP_RESEND_FAILED',
        message: error.message
      })
      return
    }

    const message = type === 'magiclink'
      ? 'Magic link resent successfully'
      : 'OTP code resent successfully'

    res.json({
      success: true,
      message,
      type,
      expires_in: OTP_STATE_TTL_SECONDS
    })
  } catch (error) {
    logger.error('OTP resend error', { error })

    res.status(500).json({
      error: 'Server error',
      code: 'OTP_SERVER_ERROR',
      message: 'Failed to resend OTP'
    })
  }
})

export default router
