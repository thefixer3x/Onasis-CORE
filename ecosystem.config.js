module.exports = {
  apps: [{
    name: 'onasis-core-api',
    script: 'npm',
    args: 'run dev',
    cwd: '/home/user/webapp/apps/onasis-core',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      VITE_AUTH_DOMAIN: 'api.lanonasis.com',
      VITE_AUTH_BASE_URL: 'https://api.lanonasis.com',
      VITE_AUTH_REDIRECT_URI: 'http://localhost:3000/auth/callback',
      VITE_AUTH_CLIENT_ID: 'lanonasis-api-dashboard',
      VITE_API_BASE_URL: 'https://api.lanonasis.com',
      VITE_MCP_SERVER_URL: 'https://mcp.lanonasis.com',
      VITE_APP_NAME: 'Lanonasis API Dashboard',
      VITE_APP_VERSION: '1.0.0',
      VITE_ENABLE_OAUTH: 'true',
      VITE_ENABLE_MCP: 'true',
      VITE_ENABLE_ANALYTICS: 'false',
      VITE_JWT_SECRET: process.env.JWT_SECRET || '',
      VITE_JWT_EXPIRY: '7d'
    },
    watch: false,
    max_memory_restart: '512M',
    error_file: '/home/user/webapp/apps/onasis-core/logs/error.log',
    out_file: '/home/user/webapp/apps/onasis-core/logs/out.log',
    log_file: '/home/user/webapp/apps/onasis-core/logs/combined.log',
    time: true
  }]
}