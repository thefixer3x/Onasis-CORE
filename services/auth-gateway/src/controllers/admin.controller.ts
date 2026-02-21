import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { dbPool } from '../../db/client.js'
import { generateTokenPairWithUAI } from '../utils/jwt.js'
import { logAuthEvent } from '../services/audit.service.js'

/**
 * POST /admin/bypass-login
 * Emergency admin login that bypasses all normal auth
 * Works even if Supabase is down or configured incorrectly
 */
export async function adminBypassLogin(req: Request, res: Response) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    })
  }

  const client = await dbPool.connect()

  try {
    // Get admin from bypass table
    const result = await client.query(
      `
      SELECT id, email, password_hash, full_name, bypass_all_checks, metadata
      FROM auth_gateway.admin_override
      WHERE email = $1
      `,
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      // Log failed attempt
      await client.query(
        `
        INSERT INTO auth_gateway.admin_access_log
        (admin_email, action, ip_address, user_agent, success, metadata)
        VALUES ($1, 'bypass_login_failed', $2, $3, false, $4)
        `,
        [
          email,
          req.ip,
          req.headers['user-agent'],
          JSON.stringify({ reason: 'admin_not_found' }),
        ]
      )

      return res.status(401).json({
        error: 'Invalid admin credentials',
        code: 'ADMIN_INVALID_CREDENTIALS',
      })
    }

    const admin = result.rows[0]

    // Verify password
    const passwordValid = await bcrypt.compare(password, admin.password_hash)

    if (!passwordValid) {
      // Log failed attempt
      await client.query(
        `
        INSERT INTO auth_gateway.admin_access_log
        (admin_email, action, ip_address, user_agent, success, metadata)
        VALUES ($1, 'bypass_login_failed', $2, $3, false, $4)
        `,
        [
          admin.email,
          req.ip,
          req.headers['user-agent'],
          JSON.stringify({ reason: 'invalid_password' }),
        ]
      )

      return res.status(401).json({
        error: 'Invalid admin credentials',
        code: 'ADMIN_INVALID_CREDENTIALS',
      })
    }

    // Generate admin token (never expires)
    const tokens = await generateTokenPairWithUAI({
      sub: admin.id,
      email: admin.email,
      role: 'admin_override',
      project_scope: 'admin',
      platform: 'web',
      authMethod: 'api_key',
    })

    // Create admin session (never expires)
    const tokenHash = crypto.createHash('sha256').update(tokens.access_token).digest('hex')

    await client.query(
      `
      INSERT INTO auth_gateway.admin_sessions
      (admin_id, token_hash, ip_address, user_agent, never_expires)
      VALUES ($1, $2, $3, $4, true)
      `,
      [admin.id, tokenHash, req.ip, req.headers['user-agent']]
    )

    // Update last login
    await client.query(
      `
      UPDATE auth_gateway.admin_override
      SET last_login_at = NOW()
      WHERE id = $1
      `,
      [admin.id]
    )

    // Log successful login
    await client.query(
      `
      INSERT INTO auth_gateway.admin_access_log
      (admin_email, action, ip_address, user_agent, success, metadata)
      VALUES ($1, 'bypass_login_success', $2, $3, true, $4)
      `,
      [
        admin.email,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify({ full_name: admin.full_name }),
      ]
    )

    return res.json({
      ...tokens,
      user: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: 'admin_override',
        bypass_all_checks: admin.bypass_all_checks,
        metadata: admin.metadata,
      },
      message: 'Admin bypass login successful - you have full system access',
    })
  } catch (error) {
    console.error('Admin bypass login error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  } finally {
    client.release()
  }
}

/**
 * POST /admin/change-password
 * Change admin password (requires admin token)
 */
export async function changeAdminPassword(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'admin_override') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_ACCESS_REQUIRED',
    })
  }

  const { current_password, new_password } = req.body

  if (!current_password || !new_password) {
    return res.status(400).json({
      error: 'Current password and new password are required',
      code: 'MISSING_PASSWORDS',
    })
  }

  if (new_password.length < 12) {
    return res.status(400).json({
      error: 'New password must be at least 12 characters',
      code: 'PASSWORD_TOO_SHORT',
    })
  }

  const client = await dbPool.connect()

  try {
    // Get admin
    const result = await client.query(
      `SELECT id, email, password_hash FROM auth_gateway.admin_override WHERE id = $1`,
      [req.user.sub]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Admin not found',
        code: 'ADMIN_NOT_FOUND',
      })
    }

    const admin = result.rows[0]

    // Verify current password
    const passwordValid = await bcrypt.compare(current_password, admin.password_hash)

    if (!passwordValid) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
      })
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 12)

    // Update password
    await client.query(
      `UPDATE auth_gateway.admin_override SET password_hash = $1 WHERE id = $2`,
      [newPasswordHash, admin.id]
    )

    // Log password change
    await client.query(
      `
      INSERT INTO auth_gateway.admin_access_log
      (admin_email, action, ip_address, user_agent, success, metadata)
      VALUES ($1, 'password_changed', $2, $3, true, $4)
      `,
      [
        admin.email,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify({ changed_at: new Date().toISOString() }),
      ]
    )

    return res.json({
      success: true,
      message: 'Admin password changed successfully',
    })
  } catch (error) {
    console.error('Change admin password error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  } finally {
    client.release()
  }
}

/**
 * GET /admin/status
 * Get admin status (requires admin token)
 */
export async function getAdminStatus(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'admin_override') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_ACCESS_REQUIRED',
    })
  }

  const client = await dbPool.connect()

  try {
    const result = await client.query(
      `
      SELECT
        id,
        email,
        full_name,
        bypass_all_checks,
        created_at,
        last_login_at,
        metadata
      FROM auth_gateway.admin_override
      WHERE id = $1
      `,
      [req.user.sub]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Admin not found',
        code: 'ADMIN_NOT_FOUND',
      })
    }

    const admin = result.rows[0]

    // Get recent activity
    const activityResult = await client.query(
      `
      SELECT action, created_at, success
      FROM auth_gateway.admin_access_log
      WHERE admin_email = $1
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [admin.email]
    )

    return res.json({
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        bypass_all_checks: admin.bypass_all_checks,
        created_at: admin.created_at,
        last_login_at: admin.last_login_at,
        metadata: admin.metadata,
      },
      recent_activity: activityResult.rows,
    })
  } catch (error) {
    console.error('Get admin status error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  } finally {
    client.release()
  }
}

/**
 * POST /admin/register-app
 * Register a new app for authentication
 * Generates client_id and client_secret for OAuth flow
 */
export async function registerApp(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'admin_override') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_ACCESS_REQUIRED',
    })
  }

  const { app_id, app_name, redirect_uris, metadata } = req.body

  if (!app_id || !app_name) {
    return res.status(400).json({
      error: 'app_id and app_name are required',
      code: 'MISSING_REQUIRED_FIELDS',
    })
  }

  // Validate app_id format (must start with app_)
  if (!app_id.startsWith('app_')) {
    return res.status(400).json({
      error: 'app_id must start with "app_"',
      code: 'INVALID_APP_ID_FORMAT',
    })
  }

  const client = await dbPool.connect()

  try {
    // Check if app_id already exists
    const existingApp = await client.query(
      'SELECT client_id FROM auth_gateway.api_clients WHERE app_id = $1',
      [app_id]
    )

    if (existingApp.rows.length > 0) {
      return res.status(409).json({
        error: 'App ID already exists',
        code: 'APP_ID_EXISTS',
      })
    }

    // Generate client credentials
    const clientId = app_id + '_' + crypto.randomBytes(8).toString('hex')
    const clientSecret = 'secret_' + crypto.randomBytes(32).toString('hex')
    const clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex')

    // Insert new app
    const result = await client.query(
      `
      INSERT INTO auth_gateway.api_clients
      (app_id, app_name, name, client_id, client_secret_hash, redirect_uris, allowed_scopes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING app_id, app_name, client_id, redirect_uris, created_at
      `,
      [
        app_id,
        app_name,
        app_name, // Set 'name' column to same as 'app_name' for backward compatibility
        clientId,
        clientSecretHash,
        redirect_uris || [],
        ['read', 'write'], // Default allowed scopes
        metadata || {},
      ]
    )

    const newApp = result.rows[0]

    // Log app registration
    await client.query(
      `
      INSERT INTO auth_gateway.admin_access_log
      (admin_email, action, ip_address, user_agent, success, metadata)
      VALUES ($1, 'app_registered', $2, $3, true, $4)
      `,
      [
        req.user.email,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify({ app_id, app_name, client_id: clientId }),
      ]
    )

    return res.status(201).json({
      ...newApp,
      client_secret: clientSecret,
      message:
        'App registered successfully. IMPORTANT: Save the client_secret now - it will not be shown again!',
    })
  } catch (error) {
    console.error('Register app error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  } finally {
    client.release()
  }
}

/**
 * GET /admin/list-apps
 * List all registered apps
 */
export async function listApps(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'admin_override') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_ACCESS_REQUIRED',
    })
  }

  const client = await dbPool.connect()

  try {
    const result = await client.query(
      `
      SELECT
        app_id,
        app_name,
        client_id,
        redirect_uris,
        created_at,
        metadata
      FROM auth_gateway.api_clients
      ORDER BY created_at DESC
      `
    )

    return res.json({
      apps: result.rows,
      total: result.rows.length,
    })
  } catch (error) {
    console.error('List apps error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  } finally {
    client.release()
  }
}
