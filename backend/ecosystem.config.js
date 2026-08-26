module.exports = {
  apps: [
    {
      name: 'abdm-backend',
      script: 'app.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
