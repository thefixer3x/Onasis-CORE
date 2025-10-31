import express from 'express'
import { supabaseAdmin } from '../../db/client.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession } from '../services/session.service.js'
import { upsertUserAccount } from '../services/user.service.js'
import { logAuthEvent } from '../services/audit.service.js'

const router = express.Router()

/**
 * GET /web/login
 * Show browser login page
 */
router.get('/login', (req, res) => {
    const returnTo = (req.query.return_to as string) || process.env.DASHBOARD_URL || 'https://dashboard.lanonasis.com'
    const error = req.query.error as string

    // Render login form
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign In - LanOnasis</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 1rem;
        }
        .container {
          background: white;
          padding: 2.5rem;
          border-radius: 1rem;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          width: 100%;
          max-width: 420px;
        }
        .logo {
          text-align: center;
          margin-bottom: 2rem;
        }
        .logo h1 {
          font-size: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          color: #1a202c;
        }
        .subtitle {
          color: #718096;
          margin-bottom: 2rem;
          font-size: 0.875rem;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #2d3748;
        }
        input {
          padding: 0.75rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          transition: all 0.2s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button {
          padding: 0.875rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }
        button:active {
          transform: translateY(0);
        }
        .error {
          color: #ef4444;
          font-size: 0.875rem;
          padding: 0.75rem;
          background: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }
        .footer {
          margin-top: 2rem;
          text-align: center;
          font-size: 0.75rem;
          color: #a0aec0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>🔐 LanOnasis</h1>
        </div>
        <h2>Welcome back</h2>
        <p class="subtitle">Sign in to access your dashboard</p>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form action="/web/login" method="POST">
          <div class="form-group">
            <label for="email">Email address</label>
            <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password" />
          </div>
          <input type="hidden" name="return_to" value="${returnTo}" />
          <button type="submit">Sign In</button>
        </form>
        <div class="footer">
          <p>Secure authentication powered by LanOnasis</p>
        </div>
      </div>
    </body>
    </html>
  `)
})

/**
 * POST /web/login
 * Handle web login form submission
 */
router.post('/login', async (req, res) => {
    const { email, password, return_to } = req.body

    if (!email || !password) {
        return res.redirect(`/web/login?error=${encodeURIComponent('Email and password are required')}&return_to=${encodeURIComponent(return_to || '')}`)
    }

    try {
        // Authenticate with Supabase
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
            email,
            password,
        })

        if (error || !data.user) {
            await logAuthEvent({
                event_type: 'login_failed',
                platform: 'web',
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
                success: false,
                error_message: error?.message || 'Invalid credentials',
                metadata: { email },
            })

            return res.redirect(`/web/login?error=${encodeURIComponent(error?.message || 'Invalid credentials')}&return_to=${encodeURIComponent(return_to || '')}`)
        }

        // Upsert user account
        await upsertUserAccount({
            user_id: data.user.id,
            email: data.user.email!,
            role: data.user.role || 'authenticated',
            provider: data.user.app_metadata?.provider,
            raw_metadata: data.user.user_metadata || {},
            last_sign_in_at: data.user.last_sign_in_at || null,
        })

        // Generate tokens
        const tokens = generateTokenPair({
            sub: data.user.id,
            email: data.user.email!,
            role: data.user.role || 'authenticated',
            platform: 'web',
        })

        // Create session
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
        await createSession({
            user_id: data.user.id,
            platform: 'web',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            expires_at: expiresAt,
        })

        // Log successful login
        await logAuthEvent({
            event_type: 'login_success',
            user_id: data.user.id,
            platform: 'web',
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            success: true,
        })

        // Set HTTP-only session cookies
        const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
        const isProduction = process.env.NODE_ENV === 'production'

        res.cookie('lanonasis_session', tokens.access_token, {
            domain: cookieDomain,
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
        })

        res.cookie('lanonasis_user', JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
        }), {
            domain: cookieDomain,
            httpOnly: false, // Readable by JavaScript
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        })

        // Redirect to personalized dashboard
        const dashboardUrl = process.env.DASHBOARD_URL || 'https://dashboard.lanonasis.com'
        const redirectUrl = return_to || `${dashboardUrl}/dashboard/home`

        return res.redirect(redirectUrl)
    } catch (error) {
        console.error('Web login error:', error)
        return res.redirect(`/web/login?error=${encodeURIComponent('An unexpected error occurred')}&return_to=${encodeURIComponent(return_to || '')}`)
    }
})

/**
 * GET /web/logout
 * Handle web logout
 */
router.get('/logout', (req, res) => {
    const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'

    // Clear session cookies
    res.clearCookie('lanonasis_session', {
        domain: cookieDomain,
        path: '/',
    })
    res.clearCookie('lanonasis_user', {
        domain: cookieDomain,
        path: '/',
    })

    // Redirect to login page
    res.redirect('/web/login')
})

export default router

