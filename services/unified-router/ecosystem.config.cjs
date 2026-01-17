module.exports = {
  apps: [
    {
      name: 'unified-router',
      script: 'index.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        ENABLE_UNIFIED_ROUTER: 'false'
      }
    }
  ]
};

