module.exports = {
  apps: [{
    name: 'lanonasis-api-server',
    script: 'index.js',
    cwd: '/home/user/webapp/apps/onasis-core/server',
    env: {
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_SECRET: 'lanonasis-secret-key-change-in-production',
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    },
    watch: false,
    max_memory_restart: '256M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}