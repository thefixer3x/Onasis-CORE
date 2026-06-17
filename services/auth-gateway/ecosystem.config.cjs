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
      max_memory_restart: '448M',
      min_uptime: '30s',       // Must stay up 30s before counted as stable
      max_restarts: 10,        // Stop restarting after 10 failures (prevents runaway loops)
      restart_delay: 5000,          // Wait 5s on first restart
      exp_backoff_restart_delay: 100, // Then double each attempt (100→200→400...→15000ms cap)
      kill_timeout: 10000,     // Give app 10s to gracefully shut down
      // Secrets are injected at runtime by the npm start command:
      // dotenvx run --no-ops -f .env.production -- node start.js
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=384',
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
