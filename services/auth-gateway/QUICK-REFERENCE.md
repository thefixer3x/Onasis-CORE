# 🚀 Auth Gateway Quick Reference

**For developers integrating with the central auth service**

---

## 🔗 Base URLs

```bash
Development: http://localhost:4000
Production:  https://api.lanonasis.com
```

---

## 🎯 Quick Integration (5 minutes)

### 1. Register Your App

```bash
# Get admin token
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"REDACTED_CHANGE_ME"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# Register app
curl -X POST http://localhost:4000/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "app_your_app_name",
    "app_name": "Your App Name",
    "redirect_uris": ["http://localhost:3000/auth/callback"]
  }'

# Save the client_id and client_secret from response!
```

### 2. Configure Your App

```bash
# .env
AUTH_GATEWAY_URL=http://localhost:4000
APP_CLIENT_ID=app_your_app_name_abc123
APP_CLIENT_SECRET=secret_xyz789
APP_PROJECT_SCOPE=app_your_app_name
```

### 3. Login User

```bash
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "project_scope": "app_your_app_name"
  }'
```

---

## 📋 Essential Endpoints

### Login
```bash
POST /v1/auth/login
{
  "email": "user@example.com",
  "password": "password",
  "project_scope": "app_your_app_name"
}
```

### Verify Token
```bash
POST /v1/auth/verify
Header: Authorization: Bearer <token>
```

### Logout
```bash
POST /v1/auth/logout
Header: Authorization: Bearer <token>
```

### Get Session
```bash
GET /v1/auth/session
Header: Authorization: Bearer <token>
```

---

## 💻 Code Examples

### React Login

```typescript
async function login(email: string, password: string) {
  const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email,
      password,
      project_scope: 'app_your_app_name'
    })
  })

  const data = await response.json()
  localStorage.setItem('access_token', data.access_token)
  return data.user
}
```

### Express Middleware

```typescript
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = await response.json()
  next()
}
```

---

## 🗂️ App Namespaces

Your app gets its own database schema:

```sql
-- Your schema
CREATE SCHEMA IF NOT EXISTS app_your_app_name;

-- Your tables
CREATE TABLE app_your_app_name.users (...);
CREATE TABLE app_your_app_name.data (...);
```

**Always query with schema prefix:**
```sql
SELECT * FROM app_your_app_name.users WHERE id = $1
```

---

## 🛡️ Emergency Admin Access

**Never get locked out:**

```bash
curl -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "REDACTED_CHANGE_ME"
  }'
```

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:4000/health
```

### List Registered Apps
```bash
curl http://localhost:4000/admin/list-apps \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Test Login Flow
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass","project_scope":"app_test"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 2. Verify token
curl -X POST http://localhost:4000/v1/auth/verify \
  -H "Authorization: Bearer $TOKEN"

# 3. Check session
curl http://localhost:4000/v1/auth/session \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🐛 Common Issues

### CORS Error
```bash
# Update auth-gateway/.env
CORS_ORIGIN="http://localhost:3000,https://yourapp.com"
```

### Wrong Project Scope (403)
```typescript
// Ensure project_scope matches your app_id
project_scope: 'app_your_app_name' // Must match registered app_id
```

### Token Not Persisting
```typescript
// Use credentials: 'include' for cookies
fetch(url, { credentials: 'include' })

// OR store in localStorage
localStorage.setItem('access_token', token)
```

---

## 📚 Full Documentation

- **[APP-ONBOARDING-GUIDE.md](./APP-ONBOARDING-GUIDE.md)** - Complete integration guide
- **[EMERGENCY-ADMIN-ACCESS.md](./EMERGENCY-ADMIN-ACCESS.md)** - Admin bypass system
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment

---

## ⚡ Quick Commands

```bash
# Start dev server
npm run dev

# Test health
curl http://localhost:4000/health

# Get admin token
./test-admin-login.sh

# Register new app
# (see APP-ONBOARDING-GUIDE.md)
```

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Support**: See full documentation
