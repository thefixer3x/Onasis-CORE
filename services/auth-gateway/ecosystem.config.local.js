// PM2 Ecosystem Configuration for LOCAL Development
// Single instance for testing before VPS deployment
module.exports = {
  apps: [
    {
      name: 'auth-gateway-local',
      script: 'start.js',
      instances: 1,  // Single instance for local testing
      exec_mode: 'fork',  // Fork mode (not cluster) for easier debugging
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',  // Minimum uptime before considering stable
      max_restarts: 5,    // Max restarts within 1 minute before stopping
      restart_delay: 4000, // Wait 4 seconds between restarts
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      error_file: 'logs/local-pm2-error.log',
      out_file: 'logs/local-pm2-out.log',
      log_file: 'logs/local-pm2-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Kill timeout - give app 10 seconds to gracefully shutdown
      kill_timeout: 10000,
      // Wait for app to be ready before considering it online
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
}