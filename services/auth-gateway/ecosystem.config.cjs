// PM2 Ecosystem Configuration for Hostinger VPS
//
// REMOVED CRON JOBS (2026-01):
// - outbox-forwarder: Run manually when needed: npm run outbox:forward
// - bootstrap-sync: One-time script, run manually: npm run bootstrap:supabase
//
// These were CQRS event sourcing workers that can be replaced with:
// 1. Supabase Database Triggers (push-based, real-time)
// 2. Supabase Edge Functions (serverless, on-demand)
// 3. Manual execution when needed
//
module.exports = {
  apps: [
    {
      name: 'auth-gateway',
      script: 'start.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
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
