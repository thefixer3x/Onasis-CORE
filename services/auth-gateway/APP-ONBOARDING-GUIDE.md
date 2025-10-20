# 🚀 App Onboarding Guide - Central Auth Integration

**Version**: 1.0.0
**Last Updated**: 2025-10-20
**Central Auth Service**: `https://api.lanonasis.com`

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [App Registration](#app-registration)
3. [Authentication Flows](#authentication-flows)
4. [Integration Examples](#integration-examples)
5. [Endpoint Reference](#endpoint-reference)
6. [App Namespaces](#app-namespaces)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Quick Start

### Prerequisites

- App identifier (e.g., `app_lanonasis_maas`, `app_vortexcore`)
- Central Auth Gateway URL: `https://api.lanonasis.com` (or `http://localhost:4000` for dev)
- Admin access token (for app registration)

### 5-Minute Integration

```bash
# 1. Register your app
curl -X POST https://api.lanonasis.com/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "app_id": "app_your_app_name",
    "app_name": "Your App Name",
    "redirect_uris": ["https://yourapp.com/auth/callback"]
  }'

# 2. Get app credentials
# Response includes: client_id, client_secret

# 3. Add to your app's .env
echo "AUTH_GATEWAY_URL=https://api.lanonasis.com" >> .env
echo "APP_CLIENT_ID=your_client_id" >> .env
echo "APP_CLIENT_SECRET=your_client_secret" >> .env

# 4. Test authentication
curl -X POST https://api.lanonasis.com/v1/auth/login \
  -d '{"email":"user@example.com","password":"pass","project_scope":"app_your_app_name"}'
```

---

## 🎫 App Registration

### Step 1: Choose App Identifier

**Format**: `app_<lowercase_name>`

**Examples**:
- `app_lanonasis_maas` - Memory as a Service
- `app_vortexcore` - VortexCore main app
- `app_the_fixer_initiative` - The Fixer Initiative
- `app_onasis_gateway` - API Gateway
- `app_your_new_app` - Your new application

**Naming Rules**:
- Start with `app_`
- Use lowercase
- Use underscores for spaces
- Max 50 characters
- Must be unique

### Step 2: Register App via Admin API

```bash
curl -X POST http://localhost:4000/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "app_your_app_name",
    "app_name": "Your App Display Name",
    "description": "Brief description of your app",
    "redirect_uris": [
      "http://localhost:3000/auth/callback",
      "https://yourapp.com/auth/callback"
    ],
    "allowed_scopes": [
      "read",
      "write",
      "admin"
    ],
    "metadata": {
      "version": "1.0.0",
      "platform": "web",
      "contact": "admin@yourapp.com"
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "app": {
    "id": "uuid",
    "client_id": "app_your_app_name_abc123",
    "client_secret": "secret_xyz789_DO_NOT_SHARE",
    "app_id": "app_your_app_name",
    "app_name": "Your App Display Name",
    "redirect_uris": ["..."],
    "is_active": true,
    "created_at": "2025-10-20T..."
  },
  "message": "App registered successfully"
}
```

**⚠️ IMPORTANT**: Save the `client_secret` securely - it's only shown once!

### Step 3: Configure App Environment

Create `.env` file in your app:

```bash
# Central Auth Configuration
AUTH_GATEWAY_URL=https://api.lanonasis.com
APP_CLIENT_ID=app_your_app_name_abc123
APP_CLIENT_SECRET=secret_xyz789_DO_NOT_SHARE
APP_PROJECT_SCOPE=app_your_app_name

# App-Specific Database (optional)
DATABASE_SCHEMA=app_your_app_name
```

---

## 🔐 Authentication Flows

### Flow 1: Password Login (Web Apps)

**Best for**: Web applications, dashboards, admin panels

```typescript
// Your app's login handler
async function loginUser(email: string, password: string) {
  const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Important for cookies
    body: JSON.stringify({
      email,
      password,
      project_scope: process.env.APP_PROJECT_SCOPE, // Your app_id
      platform: 'web'
    })
  })

  if (!response.ok) {
    throw new Error('Login failed')
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    user: data.user
  }
}
```

### Flow 2: MCP Client Authentication

**Best for**: Claude Desktop, MCP clients

```typescript
async function mcpLogin(email: string, password: string) {
  const response = await fetch(`${AUTH_GATEWAY_URL}/mcp/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Claude-Desktop/1.0' // Important for MCP
    },
    body: JSON.stringify({
      email,
      password,
      client_id: process.env.APP_CLIENT_ID
    })
  })

  return await response.json()
}
```

### Flow 3: CLI Tool Authentication

**Best for**: Command-line tools

```typescript
async function cliLogin(email: string, password: string) {
  const response = await fetch(`${AUTH_GATEWAY_URL}/auth/cli-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password
    })
  })

  return await response.json()
}
```

### Flow 4: API-to-API Authentication

**Best for**: Backend services, microservices

```typescript
// Store service credentials securely
const SERVICE_CREDENTIALS = {
  email: process.env.SERVICE_EMAIL,
  password: process.env.SERVICE_PASSWORD
}

async function getServiceToken() {
  // Check if token is cached and valid
  if (cachedToken && !isTokenExpired(cachedToken)) {
    return cachedToken
  }

  // Get new token
  const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...SERVICE_CREDENTIALS,
      project_scope: process.env.APP_PROJECT_SCOPE,
      platform: 'api'
    })
  })

  const data = await response.json()
  cachedToken = data.access_token

  return cachedToken
}
```

---

## 📝 Integration Examples

### Example 1: React Web App

**File**: `src/lib/auth.ts`

```typescript
import { createContext, useContext, useState, useEffect } from 'react'

interface AuthContextType {
  user: any
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const AUTH_GATEWAY_URL = import.meta.env.VITE_AUTH_GATEWAY_URL
  const PROJECT_SCOPE = import.meta.env.VITE_APP_PROJECT_SCOPE

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    try {
      const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/session`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      }
    } catch (error) {
      console.error('Session check failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        project_scope: PROJECT_SCOPE,
        platform: 'web'
      })
    })

    if (!response.ok) {
      throw new Error('Login failed')
    }

    const data = await response.json()
    setUser(data.user)

    // Store token in localStorage (optional)
    localStorage.setItem('access_token', data.access_token)
  }

  const logout = async () => {
    const token = localStorage.getItem('access_token')

    await fetch(`${AUTH_GATEWAY_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    setUser(null)
    localStorage.removeItem('access_token')
  }

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

**Usage in App**:

```tsx
// App.tsx
import { AuthProvider } from './lib/auth'

function App() {
  return (
    <AuthProvider>
      <YourRoutes />
    </AuthProvider>
  )
}

// Login.tsx
import { useAuth } from './lib/auth'

function Login() {
  const { login, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (error) {
      alert('Login failed')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit" disabled={isLoading}>
        Login
      </button>
    </form>
  )
}
```

### Example 2: Node.js/Express Backend

**File**: `src/middleware/auth.ts`

```typescript
import fetch from 'node-fetch'

const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL
const PROJECT_SCOPE = process.env.APP_PROJECT_SCOPE

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      error: 'No token provided'
    })
  }

  try {
    // Verify token with auth gateway
    const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      return res.status(401).json({
        error: 'Invalid token'
      })
    }

    const data = await response.json()

    // Check project scope
    if (data.payload.project_scope !== PROJECT_SCOPE) {
      return res.status(403).json({
        error: 'Wrong project scope'
      })
    }

    // Attach user to request
    req.user = data.payload
    next()
  } catch (error) {
    return res.status(500).json({
      error: 'Authentication failed'
    })
  }
}
```

**Usage**:

```typescript
import express from 'express'
import { requireAuth } from './middleware/auth'

const app = express()

// Public routes
app.post('/api/login', async (req, res) => {
  // Proxy to auth gateway
  const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...req.body,
      project_scope: PROJECT_SCOPE
    })
  })

  const data = await response.json()
  res.json(data)
})

// Protected routes
app.get('/api/dashboard', requireAuth, (req, res) => {
  res.json({
    message: 'Welcome to dashboard',
    user: req.user
  })
})
```

### Example 3: Python/Flask Backend

**File**: `auth.py`

```python
import os
import requests
from functools import wraps
from flask import request, jsonify

AUTH_GATEWAY_URL = os.getenv('AUTH_GATEWAY_URL')
PROJECT_SCOPE = os.getenv('APP_PROJECT_SCOPE')

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return jsonify({'error': 'No token provided'}), 401

        token = auth_header.replace('Bearer ', '')

        try:
            # Verify token with auth gateway
            response = requests.post(
                f'{AUTH_GATEWAY_URL}/v1/auth/verify',
                headers={'Authorization': f'Bearer {token}'}
            )

            if response.status_code != 200:
                return jsonify({'error': 'Invalid token'}), 401

            data = response.json()

            # Check project scope
            if data['payload']['project_scope'] != PROJECT_SCOPE:
                return jsonify({'error': 'Wrong project scope'}), 403

            # Attach user to request
            request.user = data['payload']

            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({'error': 'Authentication failed'}), 500

    return decorated_function
```

**Usage**:

```python
from flask import Flask, jsonify
from auth import require_auth

app = Flask(__name__)

@app.route('/api/protected')
@require_auth
def protected_route():
    return jsonify({
        'message': 'Protected data',
        'user': request.user
    })
```

---

## 📡 Endpoint Reference

### Base URLs

- **Development**: `http://localhost:4000`
- **Production**: `https://api.lanonasis.com`

### Authentication Endpoints

#### POST /v1/auth/login
Password-based login for web/API clients

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "project_scope": "app_your_app_name",
  "platform": "web"
}
```

**Response**:
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "expires_in": 604800,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "authenticated"
  }
}
```

#### POST /mcp/auth
MCP client authentication

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "client_id": "app_your_app_name_abc123"
}
```

#### POST /auth/cli-login
CLI tool authentication

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST /v1/auth/logout
Revoke session

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "revoked": true
}
```

#### GET /v1/auth/session
Get current session info

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "authenticated",
    "project_scope": "app_your_app_name"
  },
  "sessions": 2
}
```

#### POST /v1/auth/verify
Verify token validity

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "valid": true,
  "payload": {
    "sub": "user_id",
    "email": "user@example.com",
    "role": "authenticated",
    "project_scope": "app_your_app_name",
    "platform": "web",
    "exp": 1761545133
  }
}
```

#### GET /v1/auth/sessions
List all active sessions

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "platform": "web",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2025-10-20T...",
      "last_used_at": "2025-10-20T...",
      "expires_at": "2025-10-27T..."
    }
  ]
}
```

---

## 🗂️ App Namespaces

### Database Schema Naming

Your app gets its own database schema:

```sql
-- Your app's schema
CREATE SCHEMA IF NOT EXISTS app_your_app_name;

-- Your app's tables
CREATE TABLE app_your_app_name.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  -- Your app-specific fields
);

CREATE TABLE app_your_app_name.data (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES app_your_app_name.users(id),
  -- Your app-specific fields
);
```

### Schema Isolation

**Benefits**:
- ✅ Complete data separation
- ✅ No conflicts with other apps
- ✅ Independent migrations
- ✅ App-specific RLS policies
- ✅ Easy to backup/restore per app

**Example** - Query your app's data:

```typescript
import { dbPool } from './db'

// Always specify your app's schema
const result = await dbPool.query(`
  SELECT * FROM app_your_app_name.users
  WHERE email = $1
`, [email])
```

### Existing App Schemas in Neon

Your database already has these app namespaces:

```
app_credit_as_a_service
app_lanonasis_maas
app_onasis_core
app_onasis_gateway
app_vibe_frontend
app_the_fixer_initiative
app_apple
app_saas
app_seftec
app_vortexcore
app_seftechub_verification_service
```

**Your new app** will join this pattern!

---

## 🧪 Testing & Verification

### Step 1: Test Health Check

```bash
curl http://localhost:4000/health
```

Expected:
```json
{
  "status": "ok",
  "service": "auth-gateway",
  "database": {
    "healthy": true
  }
}
```

### Step 2: Test App Registration

```bash
# Get admin token first
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lanonasis.com","password":"LanonasisAdmin2025!"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# Register your app
curl -X POST http://localhost:4000/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "app_test_app",
    "app_name": "Test Application",
    "redirect_uris": ["http://localhost:3000/callback"]
  }'
```

### Step 3: Test Authentication

```bash
# Login as regular user
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass",
    "project_scope": "app_test_app"
  }'
```

### Step 4: Test Token Verification

```bash
# Save token from login response
USER_TOKEN="eyJhbGc..."

# Verify token
curl -X POST http://localhost:4000/v1/auth/verify \
  -H "Authorization: Bearer $USER_TOKEN"
```

### Step 5: Verify Database Schema

```sql
-- Connect to Neon
psql "$DATABASE_URL"

-- Check if your app's schema exists
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name = 'app_your_app_name';

-- List tables in your schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'app_your_app_name';
```

---

## 🔧 Configuration Checklist

Before deploying your app integration:

### Environment Variables
- [ ] `AUTH_GATEWAY_URL` set correctly
- [ ] `APP_CLIENT_ID` configured
- [ ] `APP_CLIENT_SECRET` stored securely (backend only)
- [ ] `APP_PROJECT_SCOPE` matches your app_id
- [ ] `DATABASE_SCHEMA` set to your app's schema

### Code Integration
- [ ] Login handler implemented
- [ ] Token storage configured (localStorage/cookies)
- [ ] Auth middleware added to protected routes
- [ ] Token verification implemented
- [ ] Logout handler implemented
- [ ] Session check on app load

### Database Setup
- [ ] App schema created in Neon
- [ ] App-specific tables created
- [ ] RLS policies enabled (if needed)
- [ ] Database queries scoped to app schema

### Testing
- [ ] Login flow tested
- [ ] Token verification tested
- [ ] Logout tested
- [ ] Protected routes tested
- [ ] Cross-origin requests working
- [ ] Error handling verified

---

## 🐛 Troubleshooting

### Issue 1: CORS Errors

**Problem**: Browser blocks requests to auth gateway

**Solution**: Add your app's origin to auth gateway CORS config

```bash
# Update auth-gateway/.env
CORS_ORIGIN="http://localhost:3000,http://localhost:5173,https://yourapp.com"
```

### Issue 2: Token Verification Fails

**Problem**: 401 error when verifying token

**Possible Causes**:
1. Token expired (check `exp` claim)
2. Wrong JWT secret (shouldn't happen with central auth)
3. Token not properly formatted in Authorization header

**Solution**:
```typescript
// Ensure proper format
const headers = {
  'Authorization': `Bearer ${token}` // Must include "Bearer "
}
```

### Issue 3: Wrong Project Scope

**Problem**: 403 error - insufficient scope

**Solution**: Ensure project_scope matches your app_id

```typescript
// In login request
const loginData = {
  email,
  password,
  project_scope: 'app_your_app_name', // Must match registered app_id
  platform: 'web'
}
```

### Issue 4: Database Schema Not Found

**Problem**: Table doesn't exist errors

**Solution**: Create your app's schema

```sql
CREATE SCHEMA IF NOT EXISTS app_your_app_name;

-- Set search path
SET search_path TO app_your_app_name, public;
```

### Issue 5: Session Not Persisting

**Problem**: User logged out on page refresh

**Solutions**:

1. **Use cookies** (recommended for web):
```typescript
fetch(url, {
  credentials: 'include' // Important!
})
```

2. **Store token in localStorage**:
```typescript
localStorage.setItem('access_token', token)

// On app load
const token = localStorage.getItem('access_token')
if (token) {
  await verifyToken(token)
}
```

---

## 📞 Support & Resources

### Documentation
- [Emergency Admin Access](./EMERGENCY-ADMIN-ACCESS.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Neon Integration](../.devops/NEON-DB-AUTH-INTEGRATION-TEMPLATE.md)

### Example Apps

Check these existing integrations:
- `app_lanonasis_maas` - Memory as a Service
- `app_vortexcore` - VortexCore application
- `app_onasis_gateway` - API Gateway

### Common Endpoints

```bash
# Health check
curl https://api.lanonasis.com/health

# MCP health
curl https://api.lanonasis.com/mcp/health

# Your app login (replace app_id)
curl -X POST https://api.lanonasis.com/v1/auth/login \
  -d '{"email":"user@example.com","password":"pass","project_scope":"app_your_app"}'
```

### Getting Help

1. Check logs:
   ```bash
   # Auth gateway logs
   tail -f services/auth-gateway/logs/*.log

   # Database query logs
   psql "$DATABASE_URL" -c "SELECT * FROM auth_gateway.audit_log ORDER BY created_at DESC LIMIT 10"
   ```

2. Verify database connection:
   ```bash
   psql "$DATABASE_URL" -c "SELECT NOW()"
   ```

3. Test auth gateway directly:
   ```bash
   curl http://localhost:4000/health
   ```

---

## 🎯 Summary

**To integrate your app**:

1. ✅ Register app with admin API → Get client_id & client_secret
2. ✅ Add auth gateway URL to your .env
3. ✅ Implement login using `/v1/auth/login` with your `project_scope`
4. ✅ Store token and use for authenticated requests
5. ✅ Verify tokens on protected routes using `/v1/auth/verify`
6. ✅ Create app-specific database schema: `app_your_app_name`
7. ✅ Test everything works!

**Your app now has**:
- ✅ Centralized authentication
- ✅ Isolated database namespace
- ✅ Complete audit logging
- ✅ Cross-platform auth support
- ✅ Emergency admin access

---

**Questions?** Check existing app implementations or test with admin credentials.

**Version**: 1.0.0
**Last Updated**: 2025-10-20
**Status**: Production Ready
