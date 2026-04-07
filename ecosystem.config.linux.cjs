const path = require('path');
// 加载 .env 文件
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'imqi1-nuxt',
      script: path.join(__dirname, '.output', 'server', 'index.mjs'),
      instances: 'max', // Ubuntu/Linux 下使用所有CPU核心
      // 或者指定具体实例数，如: instances: 4
      exec_mode: 'cluster', // cluster 模式支持多实例负载均衡
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 4000,
        DATABASE_URL: process.env.DATABASE_URL,
        // .env 中的其他环境变量会自动被 process.env 读取
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 4000,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      // 日志配置
      error_file: path.join(__dirname, 'logs', 'err.log'),
      out_file: path.join(__dirname, 'logs', 'out.log'),
      log_file: path.join(__dirname, 'logs', 'combined.log'),
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true, // 合并所有实例的日志

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

      // cluster 模式下的额外配置
      node_args: [], // 额外的 node 参数，如 ['--max-old-space-size=2048']
    },
  ],
};
