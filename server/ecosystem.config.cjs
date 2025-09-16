module.exports = {
  apps: [{
    name: 'lanonasis-api-server',
    script: 'index.js',
    cwd: '/home/user/webapp/apps/onasis-core/server',
    env: {
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_SECRET=REDACTED_JWT_SECRET
      SUPABASE_URL=https://<project-ref>.supabase.co
      SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    },
    watch: false,
    max_memory_restart: '256M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}