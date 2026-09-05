module.exports = {
  apps: [
    {
      name: 'abdm-backend',
      script: 'app.js',
      instances: 1,
      autorestart: true,
      restart_delay: 2000,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        API_DEBUG: 'false',
        GATEWAY_TOKEN_TIMEOUT_MS: 8000,
        GATEWAY_TOKEN_ATTEMPTS: 2,
        M3_GATEWAY_TOKEN_TIMEOUT_MS: 8000,
        ABDM_TOKEN_WARM_INTERVAL_MS: 60000,
        GATEWAY_TOKEN_WARM_INTERVAL_MS: 60000,
      }
    }
  ]
};
