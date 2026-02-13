# Central Auth Integration Guide

**Created:** August 13, 2025  
**Version:** 1.0  
**Last Updated:** August 13, 2025

## Overview

This guide provides comprehensive instructions for integrating the Central Auth Gateway and API Key management into any Lan Onasis repository (frontend or backend). The central authentication system ensures unified access control, schema isolation, and secure API key management across all services.

## Architecture Overview

### Central Services
- **Central Auth Gateway:** `https://api.lanonasis.com/v1/auth/*`
- **Dashboard SPA:** `https://dashboard.lanonasis.com/*`
- **Central API v1:** `https://api.lanonasis.com/api/v1/*` (includes key management; MCP tools also target v1)

### Per-Repository Isolation
- Use your own schema (e.g., `logistics`, `vortex`, `nixie`, `riskgpt`)
- RLS enabled for every table
- JWT must carry `project_scope=<your-schema>` claim
- Never expose service_role keys to frontends

## 1) Frontend Applications (Vite/Next/React)

### Environment Variables

Add these to `.env` and `.env.example`:

```bash
# Central Auth Gateway
VITE_AUTH_GATEWAY_URL=https://api.lanonasis.com
VITE_API_BASE_URL=https://api.lanonasis.com

# Your app-specific Supabase (if needed)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
REDACTED_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

**Important:** Add your local dev origin to control-room CORS (e.g., `http://localhost:5173`, `3000`, etc.)

### Login Flow Implementation

#### 1. Add Login Button
```typescript
// In your navigation/header component
const handleLogin = () => {
  const redirectUri = `${window.location.origin}/auth/callback`;
  window.location.href = `${import.meta.env.VITE_AUTH_GATEWAY_URL}/v1/auth/login?redirect_uri=${redirectUri}`;
};

<Button onClick={handleLogin}>Sign In</Button>
```

#### 2. Implement AuthCallback Route/Page
```typescript
// src/pages/AuthCallback.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        return;
      }

      if (!code) {
        navigate('/login');
        return;
      }

      try {
        // Exchange code for session
        const response = await fetch(`${import.meta.env.VITE_AUTH_GATEWAY_URL}/v1/auth/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          credentials: 'include' // Important for cookies
        });

        if (response.ok) {
          navigate('/dashboard');
        } else {
          setStatus('error');
        }
      } catch (err) {
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {status === 'processing' && <p>Processing authentication...</p>}
      {status === 'error' && <p>Authentication failed. Please try again.</p>}
    </div>
  );
};

export default AuthCallback;
```

#### 3. Add Route to App.tsx
```typescript
// src/App.tsx
import AuthCallback from './pages/AuthCallback';

// In your Routes
<Route path="/auth/callback" element={<AuthCallback />} />
```

### Session Enforcement

Protect routes by checking session endpoint:

```typescript
// src/hooks/useAuth.ts
import { useEffect, useState } from 'react';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_AUTH_GATEWAY_URL}/v1/auth/session`, {
          credentials: 'include'
        });
        
        setIsAuthenticated(response.ok);
      } catch {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  return { isAuthenticated };
};
```

### API Usage from Frontend

- For app-specific APIs: call your own service's backend
- For central key ops (admin UI): proxy through your service backend or the dashboard app
- **DO NOT** call with service_role from frontend

### Testing Setup (Vitest + RTL)

#### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/test/**/*', 'src/__tests__/**/*']
    },
  },
})
```

#### src/test/setup.ts
```typescript
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock fetch to prevent accidental network calls during tests
global.fetch = vi.fn()

// Mock localStorage for Supabase client
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock window.location for navigation tests
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  },
  writable: true,
})
```

#### Package.json Scripts
```json
{
  "scripts": {
    "test": "bunx --bun vitest run",
    "test:watch": "bunx --bun vitest",
    "test:coverage": "bunx --bun vitest run --coverage"
  }
}
```

## 2) Backend Services (Node/Express/Serverless)

### Environment Variables

```bash
# Supabase
https://<project-ref>.supabase.co
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

# Central Auth
AUTH_GATEWAY_URL=https://api.lanonasis.com
API_BASE_URL=https://api.lanonasis.com

# Service Identity
SERVICE_ID=your_service_name  # for logging and key scope
```

### Incoming Request Authentication

```typescript
// src/middleware/auth.ts
import jwt from 'jsonwebtoken';

interface AuthPayload {
  sub: string;
  project_scope: string;
  role: string;
  exp: number;
}

export const verifyAuth = (requiredScope: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Verify with gateway
      const response = await fetch(`${process.env.AUTH_GATEWAY_URL}/v1/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const payload: AuthPayload = await response.json();

      // Verify project scope
      if (payload.project_scope !== requiredScope) {
        return res.status(403).json({ error: 'Insufficient scope' });
      }

      req.user = payload;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
};
```

### Supabase Client Setup

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Schema-scoped client
export const createScopedClient = (schema: string) => {
  return supabase.schema(schema);
};

// Usage in routes
const logisticsDB = createScopedClient('logistics');
const data = await logisticsDB.from('shipments').select('*');
```

### API Key Management

```typescript
// src/services/keyService.ts
export class KeyService {
  private baseUrl = process.env.API_BASE_URL;
  private serviceToken: string;

  constructor(serviceToken: string) {
    this.serviceToken = serviceToken;
  }

  async createKey(keyData: {
    name: string;
    permissions: string[];
    expiresAt?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/api/v1/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.serviceToken}`
      },
      body: JSON.stringify(keyData)
    });

    if (!response.ok) {
      throw new Error('Failed to create API key');
    }

    return response.json();
  }

  async rotateKey(keyId: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/keys/${keyId}/rotate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.serviceToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to rotate API key');
    }

    return response.json();
  }

  async revokeKey(keyId: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/keys/${keyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.serviceToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to revoke API key');
    }

    return response.json();
  }
}
```

### Audit Logging

```typescript
// src/utils/logger.ts
export const logAuditEvent = async (event: {
  project: string;
  user_id?: string;
  service_id: string;
  endpoint: string;
  status: number;
  error?: string;
}) => {
  try {
    await fetch(`${process.env.API_BASE_URL}/api/v1/audit/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`
      },
      body: JSON.stringify({
        ...event,
        timestamp: new Date().toISOString()
      })
    });
  } catch (error) {
    // Best-effort logging - don't break user flow
    console.error('Failed to log audit event:', error);
  }
};
```

## 3) Database Migrations and RLS

### Migration Template

```sql
-- migrations/001_create_schema.sql
-- Only touch your own schema

-- Create schema
CREATE SCHEMA IF NOT EXISTS your_schema_name;

-- Create tables with RLS enabled
CREATE TABLE your_schema_name.your_table (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE your_schema_name.your_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can access their own data" ON your_schema_name.your_table
  FOR ALL USING (
    auth.jwt() ->> 'project_scope' = 'your_schema_name' 
    AND user_id = auth.uid()
  );

CREATE POLICY "Service role has full access" ON your_schema_name.your_table
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
    AND auth.jwt() ->> 'project_scope' = 'your_schema_name'
  );
```

## 4) Dashboard Access

### Unified Dashboard Experience

Users authenticate via the Central Auth Gateway, then:

1. **Central Dashboard:** Send users to `https://dashboard.lanonasis.com`
2. **Service-Specific Dashboard:** Use the same gateway session enforcement

### Dashboard Link Implementation

```typescript
// In your app's navigation
const goToDashboard = () => {
  window.open('https://dashboard.lanonasis.com', '_blank');
};

<Button onClick={goToDashboard}>Open Dashboard</Button>
```

## 5) CI/CD Integration

### GitHub Actions Template

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Lint
        run: bunx eslint .
      
      - name: Type check
        run: bunx tsc --noEmit
      
      - name: Run tests
        run: bunx vitest run --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## 6) CORS and Session Configuration

### Control Room CORS Update

Add each new service's dev and prod origins to the control-room CORS allowlist:

```javascript
// In control-room/dashboard.js
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080', // maple-site
  'https://your-new-service.lanonasis.com',
  // ... add your origins
];
```

### Cookie Settings

Ensure gateway cookies are set with proper security:
- `Secure` flag for HTTPS
- `SameSite=None` for cross-site redirects
- `SameSite=Strict` for same-site usage

## 7) Security Checklist

For every repository integration, verify:

- [ ] **Schema isolation:** Only your schema is accessed
- [ ] **API scoping:** Only your repo's keys and endpoints
- [ ] **RLS enabled:** All tables have row-level security
- [ ] **No service_role in frontend:** Never expose service keys to client
- [ ] **JWT verification:** All endpoints verify JWT and project_scope
- [ ] **Audit logging:** Every request logged to `core.logs`
- [ ] **Environment separation:** Separate `.env` per repo
- [ ] **Migration safety:** Migrations only touch your schema
- [ ] **CORS configuration:** Origins properly configured

## 8) Testing Examples

### Frontend Test Example

```typescript
// src/__tests__/auth.test.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '@/pages/Login';

vi.mock('@/integrations/auth/gateway', () => ({
  loginInline: vi.fn(),
}));

describe('Authentication Flow', () => {
  test('login form submits with correct credentials', async () => {
    const { loginInline } = require('@/integrations/auth/gateway');
    loginInline.mockResolvedValue({ access_token: 'test-token' });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(loginInline).toHaveBeenCalledWith('test@example.com', 'password');
    });
  });
});
```

### Backend Test Example

```typescript
// src/__tests__/auth.middleware.test.ts
import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';
import app from '@/app';

describe('Auth Middleware', () => {
  test('rejects requests without token', async () => {
    const response = await request(app)
      .get('/api/protected')
      .expect(401);

    expect(response.body.error).toBe('No token provided');
  });

  test('rejects requests with wrong project scope', async () => {
    const token = 'invalid-scope-token';
    
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error).toBe('Insufficient scope');
  });
});
```

## 9) Optional: Shared SDK Approach

Consider creating shared SDKs to avoid duplication:

### @lanonasis/auth
```typescript
// Browser helpers
export const redirectToLogin = (redirectUri: string) => {
  window.location.href = `${AUTH_GATEWAY_URL}/v1/auth/login?redirect_uri=${redirectUri}`;
};

// Node.js middleware
export const createAuthMiddleware = (requiredScope: string) => {
  return verifyAuth(requiredScope);
};
```

### @lanonasis/keys
```typescript
// Key management client
export class KeyManager {
  constructor(private token: string) {}
  
  async createKey(data: CreateKeyRequest) {
    // Implementation
  }
  
  async rotateKey(keyId: string) {
    // Implementation
  }
}
```

## 10) Implementation Priority

When integrating a new repository:

1. **Phase 1:** Basic auth flow (login button, callback, session check)
2. **Phase 2:** Route protection and API integration
3. **Phase 3:** Key management and admin features
4. **Phase 4:** Comprehensive testing and CI

## Support and Updates

- **Documentation:** This guide will be updated as the central auth system evolves
- **Issues:** Report integration issues to the Onasis-CORE repository
- **Examples:** Reference the `maple-site` implementation as a working example

---

**Generated:** August 13, 2025  
**Reference Implementation:** `/apps/maple-site/`  
**Central Auth Repository:** `/packages/onasis-core/`