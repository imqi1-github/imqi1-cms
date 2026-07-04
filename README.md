# ImQi1 CMS

> 本 README 最后更新于 2026 年 7 月 4 日，对应的提交为 `91b792617d89fec0b903d53ae9df13ff5582690a`。

## 项目介绍

ImQi1 CMS 是一套基于 **Nuxt 4 + Prisma + TailwindCSS** 构建的全栈个人博客与内容管理系统，也是个人站点 [imqi1.com](https://imqi1.com) 的完整源码。它并非通用型 CMS 模板，而是围绕「做技术的分享者、生活的摄影师、时事的评论员」这一定位打磨的一站式内容平台，覆盖从内容创作、发布、管理到多端展示的完整链路。

项目采用 **SSR + ISR（增量静态再生成）** 架构：页面在服务端渲染以保证首屏与 SEO，同时借助 Redis（未配置时自动降级到文件系统）缓存渲染结果，兼顾性能与实时性。数据层使用 Prisma 7 搭配 MariaDB 适配器直连 MySQL/MariaDB，前后端类型则通过 Nuxt 的 `InternalApi` 自动推断，无需额外的类型生成器。

除了 Web 主站，仓库还以 Git 子模块的形式包含了一个基于 **uni-app** 的小程序端（`mini/`），支持 H5 / 微信小程序 / 支付宝小程序三端，并复用主站提供的专用 API。

主要能力包括：

- **内容创作**：完整的 Markdown 写作体验，代码高亮基于 Shiki，并支持容器提示框、表情、图片灯箱、实况照片（LivePhoto）等扩展语法与富媒体。
- **内容组织**：文章、独立页面、分类与标签（多态 meta）、文章归档、更新日志，以及站内搜索。
- **互动系统**：带审核状态的评论（含验证码、IP / UA 记录、百度内容安全审核）、留言板、友链申请与修改审核流程。
- **特色模块**：RSS 订阅源聚合、旅行足迹地图（高德地图）、访客 IP 地理分布、附件管理（本地 / 腾讯云 COS 双存储）。
- **管理后台**：`/admin` 下提供文章、分类、标签、评论、友链、订阅、旅行、用户、附件、站点设置等全套可视化管理。
- **工程与部署**：PWA 离线支持、CDN 静态资源分发与版本化、生产环境安全响应头（CSP / HSTS 等），并附带数据库初始化、资源上传、Nginx 配置生成等一系列运维脚本。

## 开发环境搭建

### 环境要求

- **Node.js** ≥ 20（推荐 LTS 版本）
- **MySQL** 或 **MariaDB**（用于存储站点数据）
- **Bun** ≥ 1.3（项目使用的包管理器与脚本运行器）
- **Redis**（可选，用于 ISR 缓存；未配置时自动降级到文件系统）

### 安装项目

1. **安装 Node.js**

   前往 [nodejs.org](https://nodejs.org/) 下载并安装 LTS 版本，安装完成后确认：

   ```bash
   node -v
   ```

2. **安装 MySQL / MariaDB**

   安装数据库并创建一个供本项目使用的空数据库，例如 `imqi1`：

   ```sql
   CREATE DATABASE imqi1 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **安装 Bun**

   ```bash
   # macOS / Linux
   curl -fsSL https://bun.sh/install | bash

   # Windows (PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   安装完成后确认：

   ```bash
   bun -v
   ```

4. **克隆仓库**

   项目包含 `mini/` 小程序子模块，克隆时建议一并拉取：

   ```bash
   git clone --recurse-submodules https://gitee.com/imqi1-gitee/imqi1-cms.git
   cd imqi1-cms
   ```

   若克隆时遗漏了子模块，可补充执行：

   ```bash
   git submodule update --init --recursive
   ```

5. **安装依赖**

   ```bash
   bun install
   ```

6. **配置环境变量**

   复制示例文件并按实际情况填写数据库连接、Redis、CDN 等配置：

   ```bash
   cp .env.example .env
   ```

   至少需要配置数据库相关变量（`DATABASE_URL` 供 Prisma 使用，`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` 供应用运行时的 MariaDB 适配器使用）。

7. **生成 Prisma Client**

   ```bash
   bun prisma generate
   ```

8. **初始化数据库**

   执行初始化脚本，一步完成建表、写入站点默认设置并插入示例数据：

   ```bash
   bun run db:init
   ```

   该命令会读取 `.env` 中的数据库配置并执行 `scripts/init-db.sql`，创建全部 15 张数据表、写入所有站点设置项的默认值，并插入一份示例数据（1 个管理员、1 个分类、1 篇文章、1 条评论）。脚本是幂等的，可安全重复执行，不会产生重复数据，也不会覆盖你已修改过的内容。

   初始化后即可使用默认管理员账户登录后台：

   | 项目 | 默认值 |
   | --- | --- |
   | 用户名 | `admin` |
   | 密码 | `123456` |
   | 邮箱 | `example@example.com` |

   > ⚠️ 出于安全考虑，登录后请立即在后台「账户设置」中修改密码。
   >
   > 生产环境也可跳过此命令，直接在数据库管理工具（phpMyAdmin / Navicat / mysql cli 等）中导入 `scripts/init-db.sql` 执行，效果完全一致。

9. **启动开发服务器**

   ```bash
   bun run dev
   ```

   默认访问地址为 [http://localhost:3000](http://localhost:3000)，管理后台位于 `/admin`。

## 生产环境搭建

生产环境采用「**本地打包 → 上传产物 → 服务器运行 Node 服务**」的部署模式。

### 1. 准备开发环境

先按照上一节「[开发环境搭建](#开发环境搭建)」完成本地环境的搭建（克隆仓库、安装依赖、生成 Prisma Client 等），确保项目已能在本地正常打包。

### 2. 配置生产环境变量

在项目根目录的 `.env` 中补充生产环境相关变量（可参考 `.env.example`）。关键项包括：

```shell
# 生产环境 Redis（可选，强烈建议启用以提升性能）
REDIS_HOST_PROD="localhost"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD=""
REDIS_DB_PROD="0"

# 腾讯云 COS 对象存储（可选，用于上传静态资源到 COS）
COS_SECRET_ID=""
COS_SECRET_KEY=""
COS_BUCKET=""
COS_REGION=""

# 上传服务端产物到服务器（可选，SFTP）
SERVER_IP="你的服务器 IP"
SERVER_PORT="22"
SERVER_PASSWORD="你的服务器密码"
SERVER_UPLOAD_DIR="/www/wwwroot/glass"

# 生成 Nginx 配置所需
PORT_PROD=4000
PROJECT_ROOT_DIR_PROD=/www/wwwroot/glass
SITE_DOMAIN_PROD=your-domain.com
CDN_DOMAIN_PROD=cdn.your-domain.com
ENABLE_CDN_REDIRECT_PROD=true
```

### 3. 配置站点信息

在 `site.config.ts` 中修改站点级别的生产配置，例如站点名称、域名、CDN 地址、SEO 文案、社交链接等：

```ts
const _url = "https://your-domain.com";      // 站点访问地址
const _cdnUrl = "https://cdn.your-domain.com"; // CDN 根地址（未使用 CDN 可留空或与站点同域）
```

> 该文件同时被 `nuxt.config.ts`、前端与服务端引用，是 PWA manifest、CSP、SEO 等构建时数据的来源，需在**打包前**配置好。

### 4. 本地打包

```bash
bun run build
```

产物位于 `.output/` 目录。`prebuild` / `postbuild` 钩子会自动生成构建 hash、拷贝 `data/` 数据、更新 Service Worker 的 CDN 引用。

### 5. 上传静态资源到 CDN（可选）

如果使用 CDN，将 `public/` 目录下的静态资源上传到 CDN。若对象存储使用腾讯云 COS，在 `.env` 中配置好 `COS_*` 变量后可直接执行：

```bash
bun run upload:cos
```

### 6. 上传服务端产物到服务器（可选）

将 `.output/server` 内的文件上传到服务器的项目目录。项目内置了基于 SFTP 的上传脚本，配置好 `.env` 中的 `SERVER_*` 变量后可执行：

```bash
# 先干跑预览将要上传的文件
bun run upload:server -- --dry-run

# 正式上传
bun run upload:server
```

> 也可以手动将 `.output/server` 目录上传到服务器，或在服务器上直接 `git clone` 后打包，方式不限。

### 7. 在服务器初始化数据库

在服务器的数据库中创建一个空数据库，然后导入初始化脚本，一次性完成建表、写入默认设置并插入示例数据：

```bash
# 在数据库管理工具（phpMyAdmin / Navicat / mysql cli）中导入
scripts/init-db.sql
```

该脚本与开发环境完全一致，会创建全部 15 张数据表，且幂等可重复执行。默认管理员账户为 `admin` / `123456`（登录后请立即修改密码）。

### 8. 指定服务器运行环境变量

在服务器的运行环境（宝塔「Node 项目管理器」的环境变量、系统环境变量或 `.env`）中配置生产运行所需变量。以下为一份完整示例，请将其中的账号、密码、密钥等替换为你自己的值：

```shell
# 数据库
DATABASE_URL="mysql://nodejs:your_password@localhost:3306/nodejs"
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="nodejs"
DB_PASSWORD="your_password"
DB_NAME="nodejs"

# 运行环境
PORT=4000
NODE_PROJECT_NAME="glass"
NODE_ENV="production"
UV_THREADPOOL_SIZE=64
PROD=1
ROOT_DOMAIN="your-domain.com"

# REDIS配置，用于搜索功能的缓存，可选
REDIS_HOST_PROD="localhost"
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD=""
REDIS_DB_PROD="0"

# 高德地图，可选
AMAP_KEY="your_amap_key"
AMAP_SECURITY_CODE="your_amap_security_code"

# SSR 内部请求密钥 / 小程序 API 密钥（建议填写随机长字符串）
SSR_INTERNAL_REQUEST_SECRET="your_random_secret"
MINI_API_SECRET="your_random_secret"
```

> ⚠️ 上述密钥、密码等敏感信息切勿提交到代码仓库，请仅在服务器运行环境中配置。

### 9. 启动 Node 服务

在服务器上运行打包产物的入口：

```bash
node .output/server/index.mjs
```

生产环境建议使用进程守护（如宝塔的「Node 项目管理器」、PM2、systemd 等）常驻运行并配置异常自动重启。

若使用宝塔面板，项目内置了 `restart:server` 脚本，可在**本地开发环境**通过宝塔 API 远程控制服务器上的 Node 项目。使用前需先在本地 `.env` 中配置远程宝塔面板信息：

```shell
# 宝塔面板地址（含协议与端口）
BT_PANEL_URL="http://your-server-ip:8888"
# 宝塔接口密钥（面板 → 设置 → API 接口 → 获取密钥）
BT_API_KEY="your_bt_api_key"
# 宝塔「Node 项目管理器」中的项目名称
BT_PROJECT_NAME="glass"
```

> 需在宝塔面板「API 接口」中**开启 API**，并将本地公网 IP 加入 **IP 白名单**，否则请求会被拒绝。

配置完成后即可远程控制服务：

```bash
bun run restart:server          # 重启
bun run restart:server -- stop  # 停止
bun run restart:server -- start # 启动
```

服务启动后，还需配置 Nginx 将其（默认 `127.0.0.1:4000`）反向代理到对外域名，并处理 HTTPS、PWA 脚本缓存与静态资源重定向。可执行 `bun run nginx:generate` 根据 `.env` 中的 `*_PROD` 变量生成参考配置。

### 10. 查看运行日志

服务启动后，通过日志确认运行状态、排查启动或运行时错误：

- 使用宝塔「Node 项目管理器」时，可在项目详情页直接查看实时日志；
- 使用 PM2 时，通过 `pm2 logs` 查看；
- 直接运行时，观察终端输出或将 `node .output/server/index.mjs` 的 stdout/stderr 重定向到日志文件。

看到类似 `Listening on http://[::]:4000` 的输出即表示服务已成功启动。

TODO：功能待补充。
