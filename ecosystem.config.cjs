const path = require('path');

module.exports = {
  apps: [
    {
      name: 'imqi1-nuxt',
      script: path.join(__dirname, '.output', 'server', 'index.mjs'),
      instances: 1, // Windows 下建议使用单实例
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // 日志配置
      error_file: path.join(__dirname, 'logs', 'err.log'),
      out_file: path.join(__dirname, 'logs', 'out.log'),
      log_file: path.join(__dirname, 'logs', 'combined.log'),
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // 自动重启配置
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,

      // 进程管理
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // 环境变量
      autorestart: true,
      exp_backoff_restart_delay: 100,
    },
  ],
};
