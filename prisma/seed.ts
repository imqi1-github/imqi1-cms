// 根据 NODE_ENV 路由到不同的种子文件
const env = process.env.NODE_ENV || 'development'

if (env === 'production') {
  console.log('🌱 [生产环境] 加载生产种子数据...')
  require('./seed/prod.ts')
} else {
  console.log('🌱 [开发环境] 加载开发种子数据...')
  require('./seed/dev.ts')
}
