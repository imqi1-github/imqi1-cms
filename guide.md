# 部署指南

本项目是一个基于 Nuxt 4 的全栈博客系统，使用 PostgreSQL 数据库和 Prisma ORM。

## 环境要求

- Node.js >= 18.17.0
- PostgreSQL 数据库
- Bun 包管理器

## 部署步骤

### 1. 准备服务器

确保服务器已安装：
- Node.js
- PostgreSQL
- Bun

### 2. 克隆代码并安装依赖

```bash
git clone <your-repo-url>
cd nodejs-imqi1
bun install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键变量：

```bash
# 数据库连接（必填）
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# 管理员账户（生产环境必填）
SEED_ADMIN_NAME="admin"
SEED_ADMIN_MAIL="admin@example.com"
SEED_ADMIN_PASSWORD="your_strong_password"

# 网站基本信息
SEED_SITE_NAME="ImQi1"
SEED_SITE_URL="https://yourdomain.com"
SEED_SITE_DESC="做技术的分享者"
SEED_SITE_KEYWORDS="关键词1,关键词2"

# 邮件配置（可选）
SEED_SMTP_HOST="smtp.example.com"
SEED_SMTP_USER="your_email@example.com"
SEED_SMTP_PASSWORD="your_password"
SEED_SMTP_FROM_NAME="Your Site Name"

# 附件上传（可选，默认本地存储）
SEED_UPLOAD_LOCATION="local"  # 或 "upyun" 使用又拍云
```

### 4. 初始化数据库

```bash
# 生成 Prisma Client
bun run prisma:generate

# 运行数据库迁移
bunx prisma migrate deploy

# 初始化种子数据（创建管理员账户等）
NODE_ENV=production bun run prisma:seed
```

### 5. 构建项目

```bash
bun run build
```

构建完成后，产物在 `.output` 目录。

### 6. 启动服务

```bash
# 开发环境
yarn dev

# 生产环境（使用 PM2）
yarn pm2:start
```

### 7. 配置反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 8. 配置 HTTPS（使用 Certbot）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

## PM2 配置（推荐）

项目已包含 `ecosystem.config.js` 配置文件，使用集群模式自动利用所有 CPU 核心。

### PM2 常用命令

```bash
# 启动服务
bun run pm2:start

# 停止服务
bun run pm2:stop

# 重启服务（有停机）
bun run pm2:restart

# 零停机重载（推荐用于更新）
bun run pm2:reload

# 删除服务
bun run pm2:delete

# 查看日志
bun run pm2:logs

# 实时监控
bun run pm2:monit

# 查看状态
bun run pm2:status
```

### PM2 开机自启

```bash
# 保存当前进程列表
pm2 save

# 生成开机自启脚本
pm2 startup
# 按照提示执行输出的命令
```

## 常见问题

### 数据库连接失败
检查 `DATABASE_URL` 是否正确，确保 PostgreSQL 服务正在运行。

### 静态资源 404
检查 `nuxt.config.ts` 中的 `app.cdnURL` 配置，确保 CDN 地址可访问。

### 邮件发送失败
检查 SMTP 配置，确保服务器可以访问邮件服务器端口。

## 更新部署

```bash
# 拉取最新代码
git pull

# 安装依赖
bun install

# 运行迁移（如有数据库变更）
bunx prisma migrate deploy

# 重新构建
bun run build

# 零停机重载服务
bun run pm2:reload
```
