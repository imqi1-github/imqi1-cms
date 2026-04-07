# PM2 部署指南

本项目提供了针对不同操作系统的 PM2 配置文件。

## 配置文件说明

- `ecosystem.config.windows.cjs` - Windows 环境配置（单实例 fork 模式）
- `ecosystem.config.linux.cjs` - Linux/Ubuntu 环境配置（多实例 cluster 模式）
- `ecosystem.config.cjs` - 通用配置（默认使用 cluster 模式）

## Windows 环境使用

### 启动应用

```bash
# 方式1：使用 npm 脚本（推荐）
npm run pm2:start:windows

# 方式2：直接使用 PM2 命令
pm2 start ecosystem.config.windows.cjs
```

### 其他命令

```bash
# 停止
npm run pm2:stop:windows

# 重启
npm run pm2:restart:windows

# 删除
npm run pm2:delete:windows

# 查看日志
npm run pm2:logs
```

## Linux/Ubuntu 环境使用

### 首次部署步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建 Nuxt 应用
npm run build

# 3. 创建日志目录
mkdir -p logs

# 4. 确保 .env 文件存在
cp .env.example .env
# 编辑 .env 文件，填入正确的配置

# 5. 启动应用
npm run pm2:start:linux

# 或直接使用
pm2 start ecosystem.config.linux.cjs

# 6. 查看运行状态
pm2 status

# 7. 设置开机自启动（重要！）
pm2 startup
# 复制输出的命令并执行，例如：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-username --hp /home/your-username

# 8. 保存 PM2 进程列表
pm2 save
```

### 常用管理命令

```bash
# 查看状态
pm2 status
npm run pm2:status

# 查看日志
pm2 logs imqi1-nuxt
pm2 logs imqi1-nuxt --lines 100  # 查看最近100行

# 重启应用（零停机）
npm run pm2:restart:linux
# 或
pm2 reload ecosystem.config.linux.cjs

# 停止应用
npm run pm2:stop:linux

# 删除应用
npm run pm2:delete:linux

# 监控面板
npm run pm2:monit
```

## 配置差异对比

### Windows 配置特点

- **实例数**: 1 个实例
- **执行模式**: fork 模式
- **适用场景**: 本地开发、Windows 服务器

### Linux/Ubuntu 配置特点

- **实例数**: 'max'（自动使用所有 CPU 核心）
- **执行模式**: cluster 模式（负载均衡）
- **日志合并**: merge_logs: true（所有实例日志合并）
- **适用场景**: 生产环境、高性能要求

## 性能说明

### Cluster 模式优势

- ✅ 自动利用所有 CPU 核心
- ✅ 负载均衡分发请求
- ✅ 单个实例崩溃不影响其他实例
- ✅ 更好的并发处理能力
- ✅ 支持零停机重启（reload）

### 实例数建议

```javascript
// 自动检测 CPU 核心数
instances: 'max'

// 手动指定实例数
instances: 2   // 2个实例
instances: 4   // 4个实例
instances: 0   // 根据CPU核心数自动计算（同 'max'）
```

## 环境变量说明

所有配置文件都会自动加载 `.env` 文件，主要环境变量：

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
# 其他自定义环境变量...
```

## 故障排查

### 查看详细信息

```bash
pm2 show imqi1-nuxt
```

### 查看实时日志

```bash
pm2 logs imqi1-nuxt --lines 100 --raw
```

### 清除日志

```bash
pm2 flush
```

### 重置 PM2

```bash
pm2 delete all
pm2 kill
pm2 start ecosystem.config.linux.cjs
pm2 save
```

## 日志文件位置

- 错误日志: `./logs/err.log`
- 输出日志: `./logs/out.log`
- 合并日志: `./logs/combined.log`

## 注意事项

1. **Windows 环境**: 不支持 cluster 模式，只能使用 fork 模式
2. **Linux 环境**: 推荐使用 cluster 模式以获得最佳性能
3. **端口冲突**: 确保 PORT 配置正确且未被占用
4. **内存限制**: 单个实例内存超过 1G 会自动重启
5. **开机自启**: 生产环境务必执行 `pm2 startup` 和 `pm2 save`
