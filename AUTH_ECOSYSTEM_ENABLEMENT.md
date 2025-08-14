# 🔐 Onasis Core Auth Ecosystem Enablement

**Enable centralized authentication across SDK, Dashboard, Extensions, and all components**

## 🎯 Current Status

### ✅ **Already Enabled**
- **Onasis Core API Gateway** - Auth API mounted at `/v1/auth` with full OAuth + password support
- **CLI Tool** - Deployed v1.5.0 with Core Gateway integration
- **Maple-Site** - Updated to use Core Gateway authentication
- **Integration Guide** - Complete templates for all project types

### 🔄 **Ready to Enable**
- **SDK Components** - Memory SDK, AI SDK, UI Kit
- **Dashboard Components** - Admin dashboard, control room
- **IDE Extensions** - VS Code, Cursor, Windsurf extensions
- **Other Apps** - VortexCore, VortexCore-SaaS, Lanonasis-Index

## 🚀 **SDK Authentication Enablement**

### 1. **Memory SDK** (`packages/memory-sdk/`)

```typescript
// src/auth/CoreGatewayAuth.ts
import { createClient } from '@supabase/supabase-js';

export class CoreGatewayAuth {
  private apiUrl: string;
  private projectScope: string;

  constructor(projectScope: string, apiUrl = 'https://api.lanonasis.com') {
    this.apiUrl = apiUrl;
    this.projectScope = projectScope;
  }

  async login(email: string, password: string) {
    const response = await fetch(`${this.apiUrl}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-scope': this.projectScope
      },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        project_scope: this.projectScope
      })
    });

    if (!response.ok) throw new Error('Login failed');
    return await response.json();
  }

  async signInWithOAuth(provider: 'google' | 'github' = 'google') {
    const authUrl = new URL(`${this.apiUrl}/v1/auth/oauth`);
    authUrl.searchParams.set('provider', provider);
    authUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/callback`);
    authUrl.searchParams.set('project_scope', this.projectScope);
    authUrl.searchParams.set('response_type', 'code');
    
    window.location.href = authUrl.toString();
  }

  async validateSession() {
    const response = await fetch(`${this.apiUrl}/v1/auth/session`, {
      credentials: 'include',
      headers: {
        'x-project-scope': this.projectScope
      }
    });

    if (!response.ok) return null;
    return await response.json();
  }

  async logout() {
    await fetch(`${this.apiUrl}/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-project-scope': this.projectScope
      }
    });
  }
}

// Export SDK with auth
export class MemorySDK {
  private auth: CoreGatewayAuth;

  constructor(projectScope: string, apiUrl?: string) {
    this.auth = new CoreGatewayAuth(projectScope, apiUrl);
  }

  // Auth methods
  login = this.auth.login.bind(this.auth);
  signInWithOAuth = this.auth.signInWithOAuth.bind(this.auth);
  validateSession = this.auth.validateSession.bind(this.auth);
  logout = this.auth.logout.bind(this.auth);

  // Memory operations (require auth)
  async createMemory(title: string, content: string, type?: string) {
    const session = await this.validateSession();
    if (!session) throw new Error('Authentication required');

    // Memory creation logic with authenticated user context
    // ...
  }

  async searchMemories(query: string) {
    const session = await this.validateSession();
    if (!session) throw new Error('Authentication required');

    // Search logic with user context
    // ...
  }
}
```

### 2. **AI SDK** (`packages/ai-sdk/`)

```typescript
// src/auth/index.ts
export { CoreGatewayAuth } from '../memory-sdk/auth/CoreGatewayAuth';

// src/AIService.ts
import { CoreGatewayAuth } from './auth';

export class AIService {
  private auth: CoreGatewayAuth;

  constructor(projectScope: string) {
    this.auth = new CoreGatewayAuth(projectScope);
  }

  async chat(messages: any[]) {
    const session = await this.auth.validateSession();
    if (!session) throw new Error('Authentication required');

    // AI chat with user context
    // ...
  }
}
```

### 3. **UI Kit** (`packages/ui-kit/`)

```tsx
// src/components/auth/AuthProvider.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CoreGatewayAuth } from '@onasis/memory-sdk';

interface AuthContextType {
  user: any;
  login: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'github') => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
  projectScope: string;
  apiUrl?: string;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ 
  children, 
  projectScope, 
  apiUrl 
}) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const auth = new CoreGatewayAuth(projectScope, apiUrl);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const session = await auth.validateSession();
      setUser(session?.user || null);
    } catch (error) {
      console.error('Session check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const result = await auth.login(email, password);
    setUser(result.user);
  };

  const signInWithOAuth = async (provider: 'google' | 'github') => {
    await auth.signInWithOAuth(provider);
  };

  const logout = async () => {
    await auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signInWithOAuth, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// src/components/auth/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from './AuthProvider';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, signInWithOAuth } = useAuth();

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Sign In</h2>
      
      {/* OAuth Buttons */}
      <div className="space-y-3 mb-6">
        <button 
          onClick={() => signInWithOAuth('google')}
          className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
        >
          Continue with Google
        </button>
        <button 
          onClick={() => signInWithOAuth('github')}
          className="w-full bg-gray-800 text-white py-2 px-4 rounded hover:bg-gray-900"
        >
          Continue with GitHub
        </button>
      </div>

      <div className="text-center mb-4 text-gray-500">or</div>

      {/* Email/Password Form */}
      <form onSubmit={(e) => { e.preventDefault(); login(email, password); }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 border rounded mb-3"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 border rounded mb-3"
          required
        />
        <button 
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          Sign In
        </button>
      </form>
    </div>
  );
};
```

## 🎛️ **Dashboard Authentication Enablement**

### 1. **Control Room Dashboard** (`packages/onasis-core/apps/control-room/`)

```typescript
// dashboard.js - Add auth integration
const { CoreGatewayAuth } = require('@onasis/memory-sdk');

class ControlRoomDashboard {
  constructor() {
    this.auth = new CoreGatewayAuth('control-room');
    this.initializeAuth();
  }

  async initializeAuth() {
    const session = await this.auth.validateSession();
    if (!session) {
      // Redirect to login
      window.location.href = '/login';
      return;
    }

    this.currentUser = session.user;
    this.initializeDashboard();
  }

  initializeDashboard() {
    // Dashboard initialization with authenticated user
    this.renderUserProfile();
    this.loadUserData();
    this.setupRealTimeUpdates();
  }

  renderUserProfile() {
    const userProfile = {
      email: this.currentUser.email,
      role: this.currentUser.role,
      project_scope: this.currentUser.project_scope
    };

    // Render user profile in dashboard
    document.getElementById('user-profile').innerHTML = `
      <div class="user-info">
        <h3>Welcome, ${userProfile.email}</h3>
        <p>Role: ${userProfile.role}</p>
        <p>Project: ${userProfile.project_scope}</p>
        <button onclick="dashboard.logout()">Logout</button>
      </div>
    `;
  }

  async logout() {
    await this.auth.logout();
    window.location.href = '/login';
  }
}

// Initialize dashboard with auth
const dashboard = new ControlRoomDashboard();
```

### 2. **MaaS Dashboard** - Already enabled in `apps/lanonasis-maas/dashboard/`

Update the existing dashboard to use Core Gateway:

```typescript
// src/hooks/useAuth.tsx
import { CoreGatewayAuth } from '@onasis/memory-sdk';

const auth = new CoreGatewayAuth('maas');

export const useAuth = () => {
  // Use Core Gateway auth instead of direct Supabase
  return {
    login: auth.login,
    signInWithOAuth: auth.signInWithOAuth,
    logout: auth.logout,
    validateSession: auth.validateSession
  };
};
```

## 🔌 **IDE Extensions Authentication**

### 1. **VS Code Extension** (`apps/lanonasis-maas/vscode-extension/`)

```typescript
// src/auth/CoreGatewayAuth.ts
import * as vscode from 'vscode';
import fetch from 'node-fetch';

export class VSCodeAuth {
  private context: vscode.ExtensionContext;
  private apiUrl = 'https://api.lanonasis.com';
  private projectScope = 'vscode-extension';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async login(): Promise<boolean> {
    const method = await vscode.window.showQuickPick(
      [
        { label: '🌐 OAuth (Browser)', value: 'oauth' },
        { label: '🔑 API Key', value: 'api-key' }
      ],
      { placeHolder: 'Choose authentication method' }
    );

    if (!method) return false;

    if (method.value === 'oauth') {
      return this.loginWithOAuth();
    } else {
      return this.loginWithApiKey();
    }
  }

  private async loginWithOAuth(): Promise<boolean> {
    try {
      // Generate OAuth URL
      const authUrl = new URL(`${this.apiUrl}/v1/auth/oauth`);
      authUrl.searchParams.set('provider', 'google');
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/auth/vscode-callback');
      authUrl.searchParams.set('project_scope', this.projectScope);
      authUrl.searchParams.set('response_type', 'code');

      vscode.window.showInformationMessage('Opening browser for authentication...');
      await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

      // Listen for callback (simplified - would need local server)
      const token = await this.waitForCallback();
      if (token) {
        await this.context.secrets.store('auth-token', token);
        vscode.window.showInformationMessage('✅ Authentication successful!');
        return true;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Authentication failed: ${error.message}`);
    }
    return false;
  }

  private async loginWithApiKey(): Promise<boolean> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Lanonasis API Key',
      password: true,
      placeHolder: 'sk-...'
    });

    if (!apiKey) return false;

    try {
      // Validate API key
      const response = await fetch(`${this.apiUrl}/v1/auth/session`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-project-scope': this.projectScope
        }
      });

      if (response.ok) {
        await this.context.secrets.store('api-key', apiKey);
        vscode.window.showInformationMessage('✅ API Key authentication successful!');
        return true;
      } else {
        throw new Error('Invalid API key');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`API Key authentication failed: ${error.message}`);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.context.secrets.get('auth-token');
    const apiKey = await this.context.secrets.get('api-key');
    
    if (!token && !apiKey) return false;

    try {
      const response = await fetch(`${this.apiUrl}/v1/auth/session`, {
        headers: {
          'Authorization': `Bearer ${token || apiKey}`,
          'x-project-scope': this.projectScope
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.context.secrets.delete('auth-token');
    await this.context.secrets.delete('api-key');
    vscode.window.showInformationMessage('✅ Logged out successfully');
  }

  private async waitForCallback(): Promise<string | null> {
    // Implementation would create local server to catch callback
    // This is simplified for demo
    return new Promise((resolve) => {
      setTimeout(() => resolve('mock-token'), 2000);
    });
  }
}

// src/extension.ts
import { VSCodeAuth } from './auth/CoreGatewayAuth';

let auth: VSCodeAuth;

export function activate(context: vscode.ExtensionContext) {
  auth = new VSCodeAuth(context);

  // Register authentication commands
  const loginCommand = vscode.commands.registerCommand('lanonasis.login', async () => {
    const success = await auth.login();
    if (success) {
      vscode.window.showInformationMessage('Ready to use Lanonasis Memory Service!');
    }
  });

  const logoutCommand = vscode.commands.registerCommand('lanonasis.logout', async () => {
    await auth.logout();
  });

  const statusCommand = vscode.commands.registerCommand('lanonasis.status', async () => {
    const isAuth = await auth.isAuthenticated();
    vscode.window.showInformationMessage(
      isAuth ? '✅ Authenticated' : '❌ Not authenticated'
    );
  });

  context.subscriptions.push(loginCommand, logoutCommand, statusCommand);
}
```

### 2. **Cursor Extension** - Similar pattern as VS Code
### 3. **Windsurf Extension** - Similar pattern as VS Code

## 📱 **App Authentication Enablement**

### 1. **VortexCore** (`apps/vortexcore/`)

Add to existing app:

```typescript
// src/lib/auth.ts
import { CoreGatewayAuth } from '@onasis/memory-sdk';

export const auth = new CoreGatewayAuth('vortex');

// src/contexts/AuthContext.tsx - Update existing context
import { auth } from '../lib/auth';

// Replace existing Supabase auth with Core Gateway auth
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const signIn = async (email: string, password: string) => {
    const result = await auth.login(email, password);
    setUser(result.user);
  };

  const signInWithOAuth = async (provider: 'google' | 'github') => {
    await auth.signInWithOAuth(provider);
  };

  // ... rest of provider
};
```

### 2. **VortexCore-SaaS** (`apps/vortexcore-saas/`)
- Same pattern as VortexCore with `project_scope: 'vortex-saas'`

### 3. **Lanonasis-Index** (`apps/lanonasis-index/`)
- Same pattern with `project_scope: 'lanonasis-index'`

## 🔧 **Environment Configuration**

Each component needs these environment variables:

```bash
# .env for each project
VITE_AUTH_GATEWAY_URL=https://api.lanonasis.com
VITE_PROJECT_SCOPE=your-project-scope

# Project scopes:
# - control-room
# - maas  
# - vortex
# - vortex-saas
# - lanonasis-index
# - maple
# - vscode-extension
# - cursor-extension
# - windsurf-extension
```

## 🚀 **Deployment Steps**

### 1. **Enable SDK Auth**
```bash
cd packages/memory-sdk
npm run build
npm publish
```

### 2. **Update All Apps**
```bash
# Update dependencies to use new auth-enabled SDK
bun add @onasis/memory-sdk@latest

# Update each app to use CoreGatewayAuth
# Test authentication flows
# Deploy to staging/production
```

### 3. **Update Extensions**
```bash
# Rebuild extensions with auth
cd apps/lanonasis-maas/vscode-extension
npm run compile
vsce package

# Test in VS Code
# Publish to marketplace
```

## ✅ **Testing Checklist**

### **SDK Testing**
- [ ] Memory SDK login/logout
- [ ] AI SDK authenticated requests
- [ ] UI Kit AuthProvider functionality

### **Dashboard Testing**
- [ ] Control room authentication
- [ ] MaaS dashboard OAuth flows
- [ ] User profile management

### **Extension Testing**
- [ ] VS Code OAuth flow
- [ ] API key authentication
- [ ] Memory operations with auth

### **App Testing**
- [ ] VortexCore OAuth integration
- [ ] VortexCore-SaaS session management
- [ ] Cross-app session sharing

## 🎯 **Benefits After Enablement**

✅ **Unified Authentication** - Same login across all components  
✅ **OAuth Support** - Google/GitHub in every app  
✅ **Project Isolation** - Scoped sessions per project  
✅ **Audit Logging** - Centralized security tracking  
✅ **Session Management** - Consistent token handling  
✅ **Developer Experience** - Single auth system to maintain  

---

**🔐 Ready to enable authentication across the entire Onasis ecosystem!**