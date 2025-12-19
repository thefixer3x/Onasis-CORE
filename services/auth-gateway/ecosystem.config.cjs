// PM2 Ecosystem Configuration for Hostinger VPS
module.exports = {
  apps: [
    {
      name: 'auth-gateway',
      script: 'start.js',
      instances: 2,
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
    {
      name: 'outbox-forwarder',
      script: 'node_modules/.bin/tsx',
      args: 'src/workers/outbox-forwarder.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,  // Cron mode - don't auto-restart
      watch: false,
      cron_restart: '* * * * *',  // Run every minute
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/outbox-forwarder-error.log',
      out_file: 'logs/outbox-forwarder-out.log',
      log_file: 'logs/outbox-forwarder-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'bootstrap-sync',
      script: 'node_modules/.bin/tsx',
      args: 'scripts/bootstrap-from-supabase.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,  // Cron mode - don't auto-restart
      watch: false,
      cron_restart: '*/15 * * * *',  // Run every 15 minutes
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/bootstrap-sync-error.log',
      out_file: 'logs/bootstrap-sync-out.log',
      log_file: 'logs/bootstrap-sync-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
