// PM2 Ecosystem Configuration for Auth Gateway
// 
// REMOVED CRON JOBS (2026-01):
// - outbox-forwarder: Run manually when needed: npm run outbox:forward
// - bootstrap-sync: One-time script, run manually: npm run bootstrap:supabase
//
// Database Fallback Configuration:
// - FALLBACK_DATABASE_URL: Neon replica for read operations during primary outage
// - NEON_DATABASE_URL: Alias for FALLBACK_DATABASE_URL

module.exports = {
  apps: [
    {
      name: 'auth-gateway',
      // Always launch through the package start script so dotenvx decrypts and
      // injects .env.production before node boots the gateway.
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Secrets are injected at runtime by the npm start command:
      // dotenvx run --ops-off -f .env.production -- node start.js
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_file: 'logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
