import type { Request, Response } from 'express'
import { supabaseAdmin } from '../../db/client.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession } from '../services/session.service.js'
import { upsertUserAccount } from '../services/user.service.js'
import { logAuthEvent } from '../services/audit.service.js'

/**
 * POST /mcp/auth
 * MCP-specific authentication endpoint
 * Returns JSON response suitable for Claude Desktop/MCP clients
 */
export async function mcpAuth(req: Request, res: Response) {
  const { email, password, client_id = 'claude-desktop' } = req.body

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    })
  }

  try {
    // Authenticate with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      await logAuthEvent({
        event_type: 'mcp_auth_failed',
        platform: 'mcp',
        client_id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error?.message || 'Invalid credentials',
        metadata: { email, client_id },
      })

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'AUTH_INVALID_CREDENTIALS',
      })
    }

    await upsertUserAccount({
      user_id: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      provider: data.user.app_metadata?.provider,
      raw_metadata: data.user.user_metadata || {},
      last_sign_in_at: data.user.last_sign_in_at || null,
    })

    // Generate MCP-specific tokens
    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      project_scope: 'mcp',
      platform: 'mcp',
    })

    // Create MCP session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user.id,
      platform: 'mcp',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      client_id,
      scope: ['mcp'],
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
      metadata: { client_id },
    })

    // Log successful MCP auth
    await logAuthEvent({
      event_type: 'mcp_auth_success',
      user_id: data.user.id,
      platform: 'mcp',
      client_id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
    })

    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    })
  } catch (error) {
    console.error('MCP auth error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}

/**
 * POST /auth/cli-login
 * CLI-specific authentication endpoint
 * Returns JSON response suitable for CLI tools
 */
export async function cliLogin(req: Request, res: Response) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    })
  }

  try {
    // Authenticate with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      await logAuthEvent({
        event_type: 'cli_login_failed',
        platform: 'cli',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error?.message || 'Invalid credentials',
        metadata: { email },
      })

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'AUTH_INVALID_CREDENTIALS',
      })
    }

    await upsertUserAccount({
      user_id: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      provider: data.user.app_metadata?.provider,
      raw_metadata: data.user.user_metadata || {},
      last_sign_in_at: data.user.last_sign_in_at || null,
    })

    // Generate CLI-specific tokens
    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      project_scope: 'cli',
      platform: 'cli',
    })

    // Create CLI session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user.id,
      platform: 'cli',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: ['cli'],
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
    })

    // Log successful CLI login
    await logAuthEvent({
      event_type: 'cli_login_success',
      user_id: data.user.id,
      platform: 'cli',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
    })

    return res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    })
  } catch (error) {
    console.error('CLI login error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}

/**
 * GET /mcp/health
 * MCP health check endpoint
 */
export async function mcpHealth(_req: Request, res: Response) {
  return res.json({
    status: 'ok',
    service: 'mcp-auth',
    timestamp: new Date().toISOString(),
  })
}
