# Glass - 基于 Nuxt 4 的现代化博客系统

> 做技术的分享者、生活的摄影师、时事的评论员。

一个使用 Nuxt 4 + Nitro + Prisma 构建的现代化全栈博客系统，支持 ISR（增量静态再生成）、Redis 缓存、PWA 等特性。

本项目不开源。

## ✨ 特性

- 🚀 **现代化技术栈** - Nuxt 4 + Vue 3 + TypeScript + Tailwind CSS
- ⚡ **性能优化** - ISR 缓存、Redis 支持、CDN 加速
- 📱 **PWA 支持** - 渐进式 Web 应用，支持离线访问
- 🎨 **精美 UI** - Shadcn-vue 组件库，支持深色模式
- 💾 **数据库** - Prisma ORM + MySQL/MariaDB
- 🔐 **用户认证** - BCrypt 加密，Session 管理
- 📝 **Markdown** - 完整的 Markdown 渲染支持
- 🖼️ **图片处理** - 腾讯云 COS 存储，支持多封面
- 📊 **管理后台** - 完整的 CMS 管理系统
- 🌍 **SEO 友好** - 自动生成 Sitemap，支持 RSS 订阅

## 🛠️ 技术栈

### 前端
- **框架**: [Nuxt 4](https://nuxt.com/) - Vue 3 全栈框架
- **UI 库**: [Shadcn-vue](https://www.shadcn-vue.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **图标**: [Iconify](https://iconify.design/)
- **动画**: [Swiper](https://swiperjs.com/)
- **PWA**: [@vite-pwa/nuxt](https://vite-pwa-org.netlify.app/)

### 后端
- **运行时**: [Nitro](https://nitro.uno.io/) - Nuxt 内置服务器
- **ORM**: [Prisma](https://www.prisma.io/) + [Prisma MariaDB Adapter](https://www.prisma.io/docs/data-sources/mariaDB)
- **缓存**: [ioredis](https://github.com/luin/ioredis) (可选)
- **认证**: BCrypt + Session
- **邮件**: [Nodemailer](https://nodemailer.com/)

### 存储
- **数据库**: MySQL / MariaDB
- **缓存**: Redis (可选)
- **对象存储**: 腾讯云 COS (可选)
- **本地存储**: 文件系统

## 📦 快速开始

### 环境要求

- Node.js >= 18
- MySQL / MariaDB
- Redis (可选，用于缓存)
- Bun (推荐) 或 npm / pnpm

### 安装

```bash
# 克隆项目
git clone https://gitee.com/imqi1-gitee/glass.git
cd glass

# 安装依赖
bun install

# 复制环境变量配置
cp .env.example .env

# 配置数据库连接（编辑 .env 文件）
# DATABASE_URL="mysql://root:password@localhost:3306/imqi1"
# DB_HOST="localhost"
# DB_PORT="3306"
# DB_USER="root"
# DB_PASSWORD="password"
# DB_NAME="imqi1"

# 运行数据库迁移
bun run prisma:migrate

# 初始化种子数据
bun run prisma:seed

# 启动开发服务器
bun run dev
```

访问 http://localhost:4000 查看网站

## ⚙️ 环境配置

### 数据库配置

```env
# Prisma Migrate 使用
DATABASE_URL="mysql://root:password@localhost:3306/imqi1"

# 应用运行时使用
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD="password"
DB_NAME="imqi1"
```

### Redis 缓存配置（可选）

Redis 用于 ISR 缓存，可显著提升性能。如不配置，将自动降级到文件系统缓存。

**开发环境**（npm run dev）配置：
```env
REDIS_HOST_DEV="127.0.0.1"
REDIS_PORT_DEV="6379"
REDIS_PASSWORD_DEV=""
REDIS_DB_DEV="0"
```

**生产环境**（构建后的服务器）配置：
```env
REDIS_HOST_PROD="redis.example.com"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD="your_password"
REDIS_DB_PROD="0"
```

### 腾讯云 COS 配置（可选）

用于文件上传和 CDN 加速：

```env
COS_SECRET_ID="your_secret_id"
COS_SECRET_KEY="your_secret_key"
COS_BUCKET="your_bucket"
COS_REGION="ap-beijing"
COS_PREFIX="/"
```

### 管理员账户配置

```env
SEED_ADMIN_NAME="棋"
SEED_ADMIN_MAIL="admin@example.com"
SEED_ADMIN_PASSWORD="123456"
```

更多配置选项请参考 `.env.example` 文件。

## 📁 项目结构

```
nodejs-imqi1/
├── app/                    # Nuxt 应用目录
│   ├── components/         # Vue 组件
│   │   └── ui/            # Shadcn-vue UI 组件
│   ├── pages/             # 页面路由
│   └── middleware/        # Nuxt 中间件
├── server/                 # Nitro 服务器
│   ├── api/               # API 路由
│   ├── routes/            # SSR 路由
│   ├── utils/             # 工具函数
│   └── lib/               # 服务端库
├── prisma/                # Prisma 配置
│   ├── schema.prisma     # 数据库模型
│   └── seed/             # 种子数据脚本
├── public/                # 静态资源
├── lib/                   # 共享库
│   └── utils.ts          # 工具函数
├── docs/                  # 项目文档
├── scripts/               # 构建和部署脚本
├── .env.example           # 环境变量示例
├── nuxt.config.ts         # Nuxt 配置
├── ecosystem.config.cjs   # PM2 配置
└── package.json           # 项目依赖
```

## 🚀 可用脚本

### 开发

```bash
bun run dev              # 启动开发服务器（端口 4000）
bun run prisma:studio    # 打开 Prisma Studio
```

### 构建

```bash
bun run build            # 构建生产版本
bun run build:upload     # 上传到腾讯云 CDN
bun run build:debug      # 调试模式构建
```

### 数据库

```bash
bun run prisma:migrate   # 运行数据库迁移
bun run prisma:seed      # 初始化种子数据
bun run db:reset         # 重置数据库
```

### PM2 部署

```bash
bun run pm2:start        # 启动 PM2 进程
bun run pm2:stop         # 停止 PM2 进程
bun run pm2:restart      # 重启 PM2 进程
bun run pm2:reload       # 零停机重载
bun run pm2:logs         # 查看日志
bun run pm2:monit        # 实时监控
```

### 工具

```bash
bun run upload:cos       # 上传静态资源到腾讯云 COS
bun run reset:password   # 重置管理员密码
```

## 📦 部署

### 使用 PM2 部署

1. 配置生产环境变量：
```bash
cp .env.example .env
REDIS_HOST_PROD="your_redis_host"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD=""
REDIS_DB_PROD="0"
```

2. 构建项目：
```bash
bun run build
```

3. 使用 PM2 启动：
```bash
bun run pm2:start
```

### 使用 Nginx 反向代理

```nginx
server
{
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen 443 quic;
    listen [::]:443 ssl;
    listen [::]:443 quic;
    http2 on;
    server_name imqi1.com;
    index index.html index.htm default.htm default.html;
    include /www/server/panel/vhost/nginx/extension/132/*.conf;
    #root /www/wwwroot/glass;
    #CERT-APPLY-CHECK--START
    # 用于SSL证书申请时的文件验证相关配置 -- 请勿删除
    include /www/server/panel/vhost/nginx/well-known/132.conf;
    #CERT-APPLY-CHECK--END


    #SSL-START SSL相关配置
    #error_page 404/404.html;
    ssl_certificate    /www/server/panel/vhost/cert/132/fullchain.pem;
    ssl_certificate_key    /www/server/panel/vhost/cert/132/privkey.pem;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";
    add_header Alt-Svc 'quic=":443"; h3=":443"; h3-29=":443"; h3-27=":443";h3-25=":443"; h3-T050=":443"; h3-Q050=":443";h3-Q049=":443";h3-Q048=":443"; h3-Q046=":443"; h3-Q043=":443"';
    error_page 497  https://$host$request_uri;
    #HTTP_TO_HTTPS_START
    if ($server_port !~ 443){
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
    #HTTP_TO_HTTPS_END
    #SSL-END

    #ERROR-PAGE-START  错误页相关配置
    #error_page 404 /404.html;
    #error_page 502 /502.html;
    #ERROR-PAGE-END


    #REWRITE-START 伪静态相关配置
    include /www/server/panel/vhost/rewrite/node_132.conf;
    #REWRITE-END

    #禁止访问的文件或目录
    location ~ ^/(\.user.ini|\.htaccess|\.git|\.svn|\.project|LICENSE|README.md|package.json|package-lock.json|\.env) {
        return 404;
    }

    #一键申请SSL证书验证目录相关设置
    location /.well-known/ {
        root  /www/wwwroot/glass;
    }

    #禁止在证书验证目录放入敏感文件
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }


    # HTTP反向代理相关配置开始 >>>
    location ~ /purge(/.*) {
        proxy_cache_purge cache_one $host$request_uri$is_args$args;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host:$server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header REMOTE-HOST $remote_addr;
        add_header X-Cache $upstream_cache_status;
        proxy_set_header X-Host $host:$server_port;
        proxy_set_header X-Scheme $scheme;
        proxy_connect_timeout 30s;
        proxy_read_timeout 86400s;
        proxy_send_timeout 30s;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    # HTTP反向代理相关配置结束 <<<

    access_log  /www/wwwlogs/132.log;
    error_log  /www/wwwlogs/132.error.log;
}
```

伪静态：

```nginx
location = /sw.js {
    root /www/wwwroot/glass;
    add_header Cache-Control "no-cache";
}

# Workbox 相关脚本（关键）
location ^~ /workbox {
    root /www/wwwroot/glass;
    add_header Cache-Control "public, max-age=0, must-revalidate";
}

# 多目录统一处理
location ~ ^/(emojis|fonts|icons|imgs|skills)/ {
    return 302 https://cdn.imqi1.com$request_uri;
}

# 单文件
location = /favicon.ico {
    return 302 https://cdn.imqi1.com/favicon.ico;
}
```

## 🗄️ 数据模型

项目包含以下主要数据模型：

- **用户** (Users) - 管理员账户
- **文章** (Posts) - 博客文章
- **分类** (Categories) - 文章分类
- **标签** (Tags) - 文章标签
- **评论** (Comments) - 文章评论
- **友情链接** (Links) - 友情链接
- **订阅列表** (Subscribes) - 订阅的博客
- **更新日志** (Changelogs) - 项目更新记录
- **附件** (Attachments) - 上传的文件
- **设置** (Settings) - 网站设置

完整的数据模型定义请查看 `prisma/schema.prisma`

## 📄 文档

- [宝塔面板部署](docs/baota.md)

## 👤 作者

**棋**

- 网站: https://imqi1.com
- GitHub: [@棋](https://github.com/imqi1-gitee)
