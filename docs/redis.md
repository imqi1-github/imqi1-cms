# Redis 配置文档

本文档说明如何在项目中配置和使用 Redis 缓存。

## 功能说明

本项目使用 Redis 实现：
- **ISR（增量静态再生成）缓存**：自动缓存页面到 Redis，提升访问速度
- **搜索结果缓存**：可选的搜索结果缓存，减少数据库查询

## 环境变量配置

在 `.env` 文件中配置 Redis 连接信息：

### 开发环境配置

```bash
# 开发环境 Redis 配置
REDIS_HOST_DEV="localhost"
REDIS_PORT_DEV="6379"
REDIS_PASSWORD_DEV=""
REDIS_DB_DEV="0"
```

### 生产环境配置

```bash
# 生产环境 Redis 配置（留空则不使用 Redis）
REDIS_HOST_PROD="your-redis-host"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD="your-password"
REDIS_DB_PROD="0"
```

> **注意**：如果不需要使用 Redis，将所有配置项注释掉即可。

## 工作原理

### 自动环境判断

项目会自动判断运行环境：

- **开发环境**（`npm run dev`）：读取 `REDIS_HOST_DEV` 等配置
- **生产环境**（构建后运行）：读取 `REDIS_HOST_PROD` 等配置

### ISR 缓存自动启用

当 Redis 配置正确时，ISR 缓存会**自动使用 Redis**，无需额外配置。

配置了 Redis 的页面会在以下位置缓存：
- 首页 `/`：1小时
- 分类页 `/category/**`：1小时
- 文章详情 `/content/**`：永久缓存
- 标签页 `/tag/**`：1小时
- 订阅页 `/subscribes`：1小时
- 站点地图 `/sitemap`：1小时
- 关于页 `/about`：10分钟
- 友链页 `/links`：10分钟
- 留言板 `/message`：10分钟
- 搜索页 `/search`：10分钟

**不走缓存的页面**：
- 登录页 `/login`：禁用 SSR
- 管理后台 `/admin/**`：禁用 ISR

### 搜索结果缓存

搜索结果缓存需要在**后台管理**中手动启用：

1. 登录管理后台
2. 进入「系统设置」→「高级设置」→「搜索优化」
3. 开启「启用搜索缓存」
4. 设置「缓存过期时间」（默认300秒）

## 部署配置

### 方式1：使用 .env 文件

在服务器上创建 `.env` 文件：

```bash
REDIS_HOST_PROD="your-redis-host"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD="your-password"
REDIS_DB_PROD="0"
```

### 方式2：使用环境变量（推荐）

**Docker 容器：**
```yaml
environment:
  - REDIS_HOST_PROD=your-redis-host
  - REDIS_PORT_PROD=6379
  - REDIS_PASSWORD_PROD=your-password
  - REDIS_DB_PROD=0
```

**PM2 进程管理：**
在 `ecosystem.config.js` 中配置：
```javascript
module.exports = {
  apps: [{
    name: 'nuxt-app',
    env: {
      REDIS_HOST_PROD: 'your-redis-host',
      REDIS_PORT_PROD: '6379',
      REDIS_PASSWORD_PROD: 'your-password',
      REDIS_DB_PROD: '0'
    }
  }]
}
```

**Linux 服务器：**
```bash
export REDIS_HOST_PROD="your-redis-host"
export REDIS_PORT_PROD="6379"
export REDIS_PASSWORD_PROD="your-password"
export REDIS_DB_PROD="0"
```

## 验证 Redis 连接

启动应用后，在控制台查看 Redis 连接日志：

**成功连接：**
```
[Redis] 正在连接到 localhost:6379, db=0
[Redis] 当前状态: connect
[Redis] 连接成功
[Redis] 服务就绪，可以接受命令
[Redis] 配置信息: host=localhost, port=6379, db=0
```

**未配置 Redis：**
```
[Redis] 未配置 Redis 连接，将使用本地缓存或无缓存模式
```

## 性能优化建议

### 开发环境

- 建议关闭 Redis（注释掉配置），方便调试
- 如需测试 ISR 功能，可启用 Redis

### 生产环境

- 建议启用 Redis，显著提升页面访问速度
- 合理设置缓存时间，平衡内容新鲜度和性能
- 监控 Redis 内存使用，避免缓存膨胀

## 常见问题

### Q: Redis 连接失败怎么办？

检查：
1. Redis 服务是否启动
2. 主机地址、端口、密码是否正确
3. 防火墙是否允许连接
4. Redis 配置是否允许远程连接

### Q: 修改配置后不生效？

修改 `.env` 文件后需要：
1. 重新构建项目：`bun run build`
2. 重启应用

### Q: 如何禁用 Redis？

将 `.env` 中的所有 Redis 配置项注释掉即可：

```bash
# REDIS_HOST_PROD="localhost"
# REDIS_PORT_PROD="6379"
# REDIS_PASSWORD_PROD=""
# REDIS_DB_PROD="0"
```

### Q: 开发环境和生产环境使用不同 Redis？

是的，分别配置：
- 开发环境：配置 `REDIS_HOST_DEV` 等
- 生产环境：配置 `REDIS_HOST_PROD` 等
