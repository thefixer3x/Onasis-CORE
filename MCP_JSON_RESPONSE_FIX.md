# MCP/API JSON Response Fix Documentation

## Problem Statement
Claude Desktop and other MCP/AI agents were receiving HTML responses from authentication endpoints when they expected JSON. This caused authentication failures and prevented proper integration with the Lanonasis platform.

**User Quote**: "Claude was getting HTML response from the mcp calls... that's what I don't want to happen again... Json is what Claude desktop is expecting"

## Solution Implemented

### 1. Dedicated JSON-Only Endpoints
Created separate endpoints that ALWAYS return JSON regardless of request headers:

#### `/auth/cli-login` (GET/POST)
- **Purpose**: CLI and IDE extension authentication
- **Always Returns**: JSON with authentication instructions or tokens
- **Supports**: VSCode, Windsurf, Cursor, standard CLI tools

#### `/auth/api-login` (POST)
- **Purpose**: Programmatic API authentication
- **Always Returns**: JSON with access tokens
- **Supports**: Both email/password and API key authentication

#### `/mcp/auth` (POST)
- **Purpose**: MCP-specific authentication endpoint
- **Always Returns**: JSON with tokens and MCP endpoint information
- **Headers Set**: `Content-Type: application/json`, `X-MCP-Endpoint: true`

#### `/auth/verify-token` (POST)
- **Purpose**: Token validation for API clients
- **Always Returns**: JSON with validation status and token metadata

### 2. Smart Request Detection
Enhanced request type detection to differentiate between web browsers and API/MCP clients:

```javascript
const isAPIClient = (
  userAgent.includes('Claude') ||
  userAgent.includes('MCP') ||
  userAgent.includes('curl') ||
  userAgent.includes('Postman') ||
  userAgent.includes('axios') ||
  userAgent.includes('fetch') ||
  userAgent.includes('node') ||
  contentType.includes('application/json') ||
  acceptHeader.includes('application/json') ||
  platform === 'cli' ||
  platform === 'mcp' ||
  platform === 'api'
);
```

### 3. Platform-Specific Response Handling

#### For API/MCP Clients:
- Always set `Content-Type: application/json`
- Return structured JSON responses
- Include error codes for programmatic handling
- Never send HTML under any circumstances

#### For Web Browsers:
- Return HTML login pages when appropriate
- Handle redirects with JavaScript
- Maintain user-friendly authentication flow

### 4. URL Construction Fix
Fixed double slash issue in authentication URLs:

```typescript
// Before: Could produce //auth/login
const url = baseUrl + endpoint

// After: Properly joins URLs
const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
const url = `${cleanBaseUrl}${cleanEndpoint}`
```

## Testing Results

All endpoints tested and verified to return appropriate response types:

✅ **MCP/API Endpoints** - Always return JSON:
- `/auth/cli-login` - CLI authentication
- `/auth/api-login` - API authentication  
- `/mcp/auth` - MCP authentication
- `/auth/verify-token` - Token verification
- `/auth/callback?platform=mcp` - MCP callbacks

✅ **Web Endpoints** - Return HTML for browsers:
- `/auth/login` - Web login page
- `/auth/web-login` - Explicit web authentication
- `/auth/callback` - Web redirects

## Usage Examples

### Claude Desktop / MCP Client
```bash
# Authenticate via MCP endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password","client_id":"claude-desktop"}' \
  https://api.lanonasis.com/mcp/auth

# Response (always JSON):
{
  "success": true,
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "mcp_endpoint": "https://api.lanonasis.com/mcp"
}
```

### CLI Tool Authentication
```bash
# Get authentication instructions
curl https://api.lanonasis.com/auth/cli-login

# Authenticate
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password","platform":"cli"}' \
  https://api.lanonasis.com/auth/cli-login

# Response (always JSON):
{
  "success": true,
  "access_token": "eyJhbGc...",
  "platform": "cli",
  "message": "Authentication successful. You can now use this token with cli."
}
```

### API Key Authentication
```bash
# Authenticate with API key
curl -X POST -H "Content-Type: application/json" \
  -d '{"api_key":"lns_api_demo_key_123"}' \
  https://api.lanonasis.com/auth/api-login

# Response (always JSON):
{
  "success": true,
  "access_token": "eyJhbGc...",
  "authentication_method": "api_key"
}
```

## Configuration Updates

### Backend Server (`server/index.js`)
- Added JSON-only endpoints
- Enhanced request detection logic
- Force JSON headers for API responses
- Smart callback handler

### Frontend Config (`src/config/auth.config.ts`)
- Fixed URL building function
- Prevent double slashes

### Auth Service (`src/services/auth.service.ts`)
- Added `joinUrl()` helper
- Proper URL construction

## External Access

The API is accessible at: `https://4000-i9hl0dxks47udja9cy6pd-6532622b.e2b.dev`

### Key Endpoints:
- Health Check: `/health`
- MCP Health: `/mcp/health`
- MCP Auth: `/mcp/auth`
- CLI Login: `/auth/cli-login`
- API Login: `/auth/api-login`

## Benefits

1. **No More HTML for MCP/API Clients**: Claude Desktop and other MCP clients will always receive JSON responses
2. **Clear Separation**: Dedicated endpoints for different client types
3. **Backward Compatible**: Existing web authentication flows remain unchanged
4. **Better Error Handling**: Structured error codes for programmatic clients
5. **URL Fix**: No more double slashes in authentication URLs

## Next Steps

1. Deploy these changes to production
2. Update MCP client configurations to use dedicated endpoints
3. Monitor authentication logs for any issues
4. Consider adding rate limiting for API endpoints
5. Implement API key management UI in dashboard

## Conclusion

The critical issue of MCP/API clients receiving HTML responses has been completely resolved. All programmatic clients now have dedicated JSON-only endpoints, while web browsers continue to receive appropriate HTML responses. The authentication system now properly handles different client types and ensures the correct response format is always returned.