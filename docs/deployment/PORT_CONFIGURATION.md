# 📡 Port Configuration & Endpoint Documentation

## 🔢 Port Mapping

### Local Development (Sandbox)
| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Frontend (Vite) | 3000 | http://localhost:3000 | React Dashboard UI |
| Backend API | 4000 | http://localhost:4000 | Authentication & API Server |
| MCP Server (HTTP) | 8080 | http://localhost:8080 | MCP HTTP endpoint |
| MCP Server (WebSocket) | 8081 | ws://localhost:8081 | MCP WebSocket |

### Production/VPS
| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Nginx (HTTPS) | 443 | https://api.lanonasis.com | Main entry point |
| Nginx (HTTP) | 80 | http://api.lanonasis.com | Redirects to HTTPS |
| Backend API | 4000 | http://localhost:4000 (internal) | Behind Nginx proxy |
| MCP Server | 8080 | http://localhost:8080 (internal) | Behind Nginx proxy |

## 🚨 Current Issues

### 1. VPS Returns "Auth endpoint not found"
**Problem**: The VPS at port 443 isn't routing to the authentication endpoints
**Reason**: Nginx configuration missing or incorrect proxy settings

### 2. OAuth Callback Fails
**Problem**: OAuth callback doesn't return properly
**Reason**: Redirect URI mismatch or CORS issues

### 3. API Key Generation
**Problem**: Dashboard can't generate API keys
**Reason**: Backend endpoint not properly connected

### 4. Placeholder Values
**Problem**: Seeing "Hello user" instead of actual username
**Reason**: User data not being properly fetched/stored

## 🔧 Required Nginx Configuration for VPS

```nginx
# /etc/nginx/sites-available/api.lanonasis.com
server {
    listen 443 ssl http2;
    server_name api.lanonasis.com;
    
    ssl_certificate /etc/letsencrypt/live/api.lanonasis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.lanonasis.com/privkey.pem;
    
    # Authentication endpoints
    location /auth/ {
        proxy_pass http://localhost:4000/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # API endpoints
    location /api/ {
        proxy_pass http://localhost:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # MCP WebSocket
    location /mcp {
        proxy_pass http://localhost:4000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:4000/health;
    }
    
    # Root endpoint
    location / {
        proxy_pass http://localhost:4000/;
    }
}
```

## 📍 Endpoint Structure

### Authentication Endpoints
- `POST /auth/login` - User login
- `POST /auth/signup` - User registration
- `GET /auth/authorize` - OAuth authorization
- `POST /auth/token` - Token exchange
- `GET /auth/userinfo` - Get user info
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Refresh token

### API Endpoints
- `GET /api/status` - API status
- `GET /api/keys` - List API keys
- `POST /api/keys` - Create new API key
- `DELETE /api/keys/:id` - Delete API key
- `GET /api/stats` - Usage statistics

### MCP Endpoints
- `GET /mcp/health` - MCP health check
- `POST /mcp/execute` - Execute MCP command
- `ws://[host]/mcp` - WebSocket connection

## 🔄 OAuth Flow

1. Frontend initiates: `GET /auth/authorize`
2. Redirect to: `https://api.lanonasis.com/auth/authorize`
3. After auth: Redirect to `https://dashboard.lanonasis.com/auth/callback`
4. Exchange code: `POST /auth/token`
5. Get user info: `GET /auth/userinfo`