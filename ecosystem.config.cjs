const path = require('path')

module.exports = {
  apps: [
    {
      name: 'imqi1-nuxt',
      script: path.join(__dirname, '.output/server/index.mjs'),

      // ❗推荐单实例
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },

      error_file: path.join(__dirname, 'logs/err.log'),
      out_file: path.join(__dirname, 'logs/out.log'),
      time: true,

      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
}