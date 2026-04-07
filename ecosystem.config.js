module.exports = {
  apps: [
    {
      name: 'imqi1-nuxt',
      script: './.output/server/index.mjs',
      instances: 'max', // 使用所有 CPU 核心
      exec_mode: 'cluster', // 集群模式
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // 日志配置
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
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
