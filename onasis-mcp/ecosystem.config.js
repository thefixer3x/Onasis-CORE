module.exports = {
  apps: [
    {
      name: 'lanonasis-mcp-server',
      script: './dist/unified-mcp-server.js',
      args: '--http',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        MCP_WS_PORT: 3002,
        MCP_SSE_PORT: 3003,
        ENABLE_HTTP: 'true',
        ENABLE_WEBSOCKET: 'true',
        ENABLE_SSE: 'true',
        ENABLE_STDIO: 'false'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        MCP_WS_PORT: 3002,
        MCP_SSE_PORT: 3003,
        ENABLE_HTTP: 'true',
        ENABLE_WEBSOCKET: 'true',
        ENABLE_SSE: 'true',
        ENABLE_STDIO: 'false'
      },
      error_file: '/var/log/pm2/lanonasis-mcp-error.log',
      out_file: '/var/log/pm2/lanonasis-mcp-out.log',
      log_file: '/var/log/pm2/lanonasis-mcp-combined.log',
      time: true,
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Auto-restart schedule (daily at 2 AM)
      cron_restart: '0 2 * * *',
      
      // Memory monitoring
      monitoring: true,
      
      // Cluster mode settings
      exec_mode: 'fork',
      
      // Node.js specific settings
      node_args: '--max-old-space-size=512',
      
      // Environment-specific settings for enterprise deployment
      source_map_support: true,
      instance_var: 'INSTANCE_ID'
    },
    {
      name: 'lanonasis-mcp-stdio',
      script: './dist/unified-mcp-server.js',
      args: '--stdio',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        ENABLE_HTTP: 'false',
        ENABLE_WEBSOCKET: 'false',
        ENABLE_SSE: 'false',
        ENABLE_STDIO: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        ENABLE_HTTP: 'false',
        ENABLE_WEBSOCKET: 'false',
        ENABLE_SSE: 'false',
        ENABLE_STDIO: 'true'
      },
      error_file: '/var/log/pm2/lanonasis-mcp-stdio-error.log',
      out_file: '/var/log/pm2/lanonasis-mcp-stdio-out.log',
      log_file: '/var/log/pm2/lanonasis-mcp-stdio-combined.log',
      time: true,
      merge_logs: true,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512'
    }
  ],

  deploy: {
    production: {
      user: 'root',
      host: '168.231.74.29',
      port: '2222',
      ref: 'origin/main',
      repo: 'git@github.com:lanonasis/onasis-mcp-server.git',
      path: '/opt/mcp-servers/lanonasis-standalone',
      'pre-deploy': 'git pull',
      'post-deploy': 'npm install --production && npm run test && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /opt/mcp-servers && mkdir -p /var/log/pm2 && mkdir -p /opt/certs'
    }
  }
};