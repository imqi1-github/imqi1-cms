# ImQi1 CMS

## 目录

- [项目介绍](#项目介绍)
- [开发环境搭建](#开发环境搭建)
- [生产环境搭建](#生产环境搭建)
- [使用 Docker 部署](#使用-docker-部署)
- [site.config.ts 说明](#siteconfigts-说明)
- [package.json 内脚本](#packagejson-内脚本)
- [小程序](#小程序)
- [更新日志格式](#更新日志格式)
- [辅助功能](#辅助功能)
- [故障排查](#故障排查)

## 项目介绍

ImQi1 CMS 是一套基于 **Nuxt 4 + Prisma + TailwindCSS** 构建的全栈个人博客与内容管理系统，也是个人站点 [imqi1.com](https://imqi1.com) 的完整源码。它并非通用型 CMS 模板，而是围绕「做技术的分享者、生活的摄影师、时事的评论员」这一定位打磨的一站式内容平台，覆盖从内容创作、发布、管理到多端展示的完整链路。

项目采用 **SSR + ISR（增量静态再生成）** 架构：页面在服务端渲染以保证首屏与 SEO，同时借助 Redis（未配置时 ISR 自动降级到文件系统、搜索缓存关闭）缓存渲染结果，兼顾性能与实时性。数据层使用 Prisma 7 搭配 MariaDB 适配器直连 MySQL/MariaDB，前后端类型则通过 Nuxt 的 `InternalApi` 自动推断，无需额外的类型生成器。

除了 Web 主站，仓库还以 Git 子模块的形式包含了一个基于 **uni-app** 的小程序端（`mini/`），支持 H5 / 微信小程序 / 支付宝小程序三端，并复用主站提供的专用 API。

主要能力包括：

- **内容创作**：完整的 Markdown 写作体验，代码高亮基于 Shiki，并支持容器提示框、表情、图片灯箱、实况照片（LivePhoto）等扩展语法与富媒体。
- **内容组织**：文章、独立页面、分类与标签（多态 meta）、文章归档、更新日志，以及站内搜索。
- **互动系统**：带审核状态的评论（含验证码、IP / UA 记录、百度内容安全审核）、留言板、友链申请与修改审核流程。
- **特色模块**：RSS 订阅源聚合、旅行足迹地图（高德地图）、访客 IP 地理分布、附件管理（本地 / 腾讯云 COS 双存储）。
- **管理后台**：`/admin` 下提供文章、分类、标签、评论、友链、订阅、旅行、用户、附件、站点设置等全套可视化管理。
- **工程与部署**：PWA 离线支持、CDN 静态资源分发与版本化、生产环境安全响应头（CSP / HSTS 等），并附带数据库初始化、资源上传、Nginx 配置生成等一系列运维脚本。

预览：[https://imqi1.com](https://imqi1.com)

## 开发环境搭建

### 环境要求

- **Node.js** ≥ 20（推荐 LTS 版本）
- **MySQL** 或 **MariaDB**（用于存储站点数据）
- **Bun** ≥ 1.3（项目使用的包管理器与脚本运行器）
- **Redis**（可选，用于 ISR 增量缓存与搜索缓存；未配置时 ISR 降级到文件系统、搜索缓存关闭）

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

   至少需要配置数据库相关变量（`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`）：应用运行时的 MariaDB 适配器直接使用它们，需连库的 Prisma 命令（`prisma studio`、`prisma db execute` 等）也会由 `prisma.config.ts` 用这套变量自动拼接连接串，无需单独配置 `DATABASE_URL`。

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

    | 项目   | 默认值                |
    |--------|-----------------------|
    | 用户名 | `admin`               |
    | 密码   | `123456`              |
    | 邮箱   | `example@example.com` |

   > ⚠️ 出于安全考虑，登录后请立即在后台「账户设置」中修改密码。
   >
   > 生产环境也可跳过此命令，直接在数据库管理工具（phpMyAdmin / Navicat / mysql cli 等）中导入 `scripts/init-db.sql` 执行，效果完全一致。

9. **启动开发服务器**

   ```bash
   bun run dev
   ```

   默认访问地址为 [http://localhost:3000](http://localhost:3000)，管理后台位于 `/admin`。

### 开发

本站采用 eslint 作为代码规范工具，使用 Nuxt 自动生成的类型和 TypeScript 做类型校验，覆盖绝大部分代码。

开发环境，运行 `bun run dev` 启动开发服务器，然后在浏览器访问 [http://localhost:3000](http://localhost:3000) 即可查看站点效果。

为方便开发，本站提供了一个简易文件服务器。在根目录创建 .attachments 文件夹，它是文件服务器的根目录，并运行 `bun run serve` 启动。使用它可以在不污染 uploads 文件夹的情况下管理文件。注意这种方式没有对接 ImQi1 CMS 的文件上传功能，需要手动上传文件并拖拽到 .attachments 内，并且附件功能也未适配。

开发完成后，参照下一节做好生产环境的相关配置，就可以打包部署了。

开发前记得先执行 `bun prisma generate` 生成 Prisma Client，确保数据库模型与代码保持一致。

## 生产环境搭建

生产环境采用「**本地打包 → 上传产物 → 服务器运行 Node 服务**」的部署模式。

> 📌 **关于端口号**：下文出现的端口均为各路径的默认示例，均可任意修改——开发服务器默认 `3000`、裸机生产示例用 `DEPLOY_PORT=3000`、Docker 示例用 `DEPLOY_PORT=3000`，只需保持 `DEPLOY_PORT`、Nginx 反代目标与容器端口映射三者一致即可。

### 1. 准备开发环境

先按照上一节「[开发环境搭建](#开发环境搭建)」完成本地环境的搭建（克隆仓库、安装依赖、生成 Prisma Client 等），确保项目已能在本地正常打包。

### 2. 配置生产环境变量

在项目根目录的 `.env` 中补充生产环境相关变量（可参考 `.env.example`）。关键项包括：

```shell
# 生产环境 Redis（可选，构建期配置；打包时烘焙进产物，改动需重新打包）
REDIS_HOST_PROD="localhost"     # 裸机填 localhost/服务器 IP；Docker 部署填 redis（见下方「使用 Docker 部署」章节）
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD=""
REDIS_DB_PROD="0"

# 腾讯云 COS 对象存储（可选，用于上传静态资源到 COS）
COS_SECRET_ID=""
COS_SECRET_KEY=""
COS_BUCKET=""
COS_REGION=""

# 上传服务端产物到服务器（可选，SFTP）
SERVER_HOST="你的服务器 IP"        # 旧名 SERVER_IP 仍兼容
SERVER_PORT="22"
SERVER_USER="root"                 # 旧名 SERVER_USERNAME 仍兼容
SERVER_PASSWORD="你的服务器密码"
SERVER_UPLOAD_DIR="/www/wwwroot/glass"
SERVER_UPLOAD_CONCURRENCY="8"      # 上传并发数（可选）

# 生成 Nginx 配置所需
DEPLOY_PORT=3000
DEPLOY_PROJECT_ROOT_DIR=/www/wwwroot/glass
DEPLOY_SITE_DOMAIN=your-domain.com
DEPLOY_CDN_DOMAIN=cdn.your-domain.com
DEPLOY_ENABLE_CDN_REDIRECT=true
```

Redis 是**构建期配置**：`nuxt build` 打包时从本机 `.env` 读取 `REDIS_*_PROD` 并烘焙进服务端产物，ISR 增量缓存与搜索缓存共用同一组值。**生产服务器运行环境不要再设置任何 Redis 环境变量**（`REDIS_*_PROD` / `NUXT_REDIS_*`），改动 prod 配置后重新打包即可生效。未配置（`REDIS_HOST_PROD` 为空）时：ISR 自动降级到文件系统缓存、搜索缓存关闭。

### 3. 配置站点信息

在 `site.config.ts` 中修改站点级别的生产配置，例如站点名称、域名、CDN 地址、SEO 文案、社交链接等：

```ts
const _url = "https://your-domain.com";      // 站点访问地址
const _cdnUrl = "https://cdn.your-domain.com"; // CDN 根地址（未使用 CDN 可留空或与站点同域）
```

其中 `security.enableCsp` 控制是否启用 CSP（内容安全策略）：

```ts
security: {
  allowedRefererDomains: [_host],
  enableCsp: true, // 正式部署保持 true；本地用 nuxi preview 验证打包产物时建议改为 false
},
```

> 该文件同时被 `nuxt.config.ts`、前端与服务端引用，是 PWA manifest、CSP、SEO 等构建时数据的来源，需在**打包前**配置好。

### 4. 本地打包

```bash
bun run build
```

产物位于 `.output/` 目录。`prebuild` 钩子生成构建 hash，`postbuild` 钩子拷贝 `data/` 数据并更新 Service Worker 的 CDN 引用；此外 Nitro 会在构建收尾时通过钩子把运行时资源（`qqwry.ipdb` IP 库、验证码字体、svg2png WASM）拷贝到 `.output/server/runtime-assets/`。

> ⚠️ **本地上传目录建议设置 `UPLOADS_DIR`**。附件若使用「本地上传」（非 COS），默认写入 `.output/public/uploads`；而 `bun run build` 会删除并重建整个 `.output`，**重新打包后已上传的文件会全部丢失**。请在运行环境变量中把 `UPLOADS_DIR` 指向 `.output` 之外的独立绝对路径（如 `/www/wwwroot/glass/uploads`）持久保存，详见下文第 8 节。使用腾讯云 COS 存储的用户不受影响。

> **本地用 `nuxi preview` 验证打包产物时，建议先把 `site.config.ts` 的 `security.enableCsp` 改为 `false`**。CSP 仅在生产构建注入，会拦截音乐直链、地图第三方脚本等，干扰本地功能验证；确认功能正常后改回 `true` 再打正式包。

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
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="nodejs"
DB_PASSWORD="your_password"
DB_NAME="nodejs"

# 运行环境
PORT=3000
NODE_PROJECT_NAME="glass"
# 必须为完整单词 production（写 prod / 留空会按非生产处理）：构建与启动都需要。
# 非 production 时 referer / 小程序签名校验会跳过、上传目录解析错误、CDN / ISR / cookie secure 不生效。
NODE_ENV="production"
UV_THREADPOOL_SIZE=64

# 本地上传目录（强烈建议设置为 .output 之外的绝对路径）
# 不设时默认写入 .output/public/uploads，而每次重新打包 `bun run build` 会
# 删除并重建整个 .output，导致已上传的用户文件全部丢失。设为独立目录即可持久保留。
UPLOADS_DIR="/www/wwwroot/glass/uploads"

# Redis 无需在此配置：Redis 是构建期配置，打包时烘焙进产物，生产运行时不再读取
# Redis 环境变量（见上文「生产环境搭建」第 2 节）。

# 高德地图，可选
# key / securityCode 均为运行时读取，不烘焙进构建产物：
# - 生产走服务端 nitro 代理（site.config 的 amap.useServerProxy=true）：浏览器不持 key，
#   部署后在运行环境设置 AMAP_KEY / AMAP_SECURITY_CODE 即可生效，无需重新打包。
# - 开发环境恒直连：浏览器需 key 加载高德 JS，开发运行时从环境变量读取。
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

服务启动后，还需配置 Nginx 将其（默认 `127.0.0.1:3000`）反向代理到对外域名，并处理 HTTPS、PWA 脚本缓存与静态资源重定向。可执行 `bun run nginx:generate` 根据 `.env` 中的 `*_PROD` 变量生成参考配置。

### 10. 查看运行日志

服务启动后，通过日志确认运行状态、排查启动或运行时错误：

- 使用宝塔「Node 项目管理器」时，可在项目详情页直接查看实时日志；
- 使用 PM2 时，通过 `pm2 logs` 查看；
- 直接运行时，观察终端输出或将 `node .output/server/index.mjs` 的 stdout/stderr 重定向到日志文件。

看到类似 `Listening on http://[::]:3000` 的输出即表示服务已成功启动。

## 使用 Docker 部署

Docker 部署文件已整理进 `docker/` 子目录，提供**两套独立版本**按是否需要 Redis 二选一：

- **带 Redis**（`docker/docker-compose.yml` + `docker/Dockerfile`）：应用 + MySQL 8 + Redis 7。宿主 `.env` 填 `REDIS_HOST_PROD=redis` 即烘焙 Redis 连接并启动 redis 容器，ISR 增量缓存与搜索缓存共用。
- **不带 Redis**（`docker/docker-compose.noredis.yml` + `docker/Dockerfile.noredis`）：仅应用 + MySQL 8。ISR 走文件系统缓存、搜索缓存关闭，不创建 redis 容器/卷。

不需要在 `.env` 中配置任何 `COMPOSE_PROFILES`，Redis 段只保留 `REDIS_*_DEV` / `REDIS_*_PROD` 各四个变量即可。两个版本的具体用法、启动命令与运维命令见 **[`docker/README.md`](docker/README.md)**。

前置要求：服务器已安装 **Docker** 与 **Docker Compose v2**（`docker compose version` 可用）。

### 1. 准备代码与环境变量

> 完整的站点 / CDN / CSP 配置说明见 [「site.config.ts 说明」](#siteconfigts-说明) 与 [「生产环境搭建」](#生产环境搭建)，本节只列 Docker 路径必需项。

```bash
# 拉代码（含子模块 mini/）
git clone --recurse-submodules <你的仓库地址> imqi1
cd imqi1

# 从模板生成 .env
cp .env.example .env
```

编辑 `.env`，至少修改以下几项（`UPLOADS_DIR` 等其余均为可选，留空用默认）：

```bash
DB_PASSWORD="改成强密码"          # MySQL 密码（root 与普通用户共用），compose 用它建库
DB_NAME="imqi1-nodejs"           # 库名，可自定义；compose 建库与导入 SQL 都用它
DB_USER="nodejs"                 # 应用连接的普通用户；⚠️ 不能设为 root，见下
DEPLOY_PORT=3000                   # 宿主对外端口，按需修改
```

常用可选变量（按需添加，均可留空）：

```bash
UPLOADS_DIR=""                 # 上传目录宿主路径；默认项目根 uploads/，本地可见
REDIS_HOST_PROD=""             # 启用 Redis 填 redis（compose 服务名，非空即烘焙 redis:6379）；留空则不启用
REDIS_PORT_PROD="6379"
REDIS_PASSWORD_PROD=""
REDIS_DB_PROD="0"
AMAP_KEY=""                    # 高德地图 Key（旅行足迹地图功能）
AMAP_SECURITY_CODE=""          # 高德 JS API 安全密钥
SSR_INTERNAL_REQUEST_SECRET="" # SSR 内部请求密钥（建议随机长串）
MINI_API_SECRET=""             # 小程序 API 签名密钥
```

> `DB_HOST` 会被 compose 自动覆盖为服务名 `mysql`，**无需手动填写容器名**。Redis：需要就用带 Redis 的版本（`docker-compose.yml`），并在 `.env` 填 `REDIS_HOST_PROD=redis`；不需要就选不带 Redis 的版本。其它 COS 等按需填写，完整变量见 `.env.example`。
>
> ⚠️ **`DB_USER` 不能设为 `root`**：compose 会把它映射成 MySQL 镜像的 `MYSQL_USER`，而 MySQL 官方镜像的 `MYSQL_USER` 只用于创建普通用户，设为 `root` 会在 entrypoint 阶段直接报错退出、容器无限重启。请使用普通用户名（如 `nodejs`），root 密码由 `DB_PASSWORD` 单独管理（映射 `MYSQL_ROOT_PASSWORD`），应用与 healthcheck 全程只使用 `DB_USER` 这个普通用户。

改动 site.config.ts 的配置，改成你自己的，比如 CDN 路径。

### 2. 构建并启动

从项目根目录运行（注意命令带 `--env-file .env` 和 `-f docker/...`，详见 `docker/README.md`）：

```bash
# 带 Redis：构建镜像 + 后台启动 app / mysql / redis
docker compose --env-file .env -f docker/docker-compose.yml up -d --build

# 不带 Redis：仅 app / mysql
docker compose --env-file .env -f docker/docker-compose.noredis.yml up -d --build
```

首次启动时，MySQL 会自动创建空库（`DB_NAME`）并**自动执行数据库初始化**：`scripts/init-db.sql` 已挂载到 MySQL 官方镜像的 `/docker-entrypoint-initdb.d/` 目录，容器首次启动（数据卷为空）时会自动导入——建全部表 + 写入默认设置 + 插入示例数据，并创建默认管理员：

- 用户名：`admin`
- 密码：`123456`（登录后请立即在后台「账户设置」修改）

> 该自动初始化**仅在 `mysql-data` 数据卷为空时执行一次**（即首次部署）。之后重新 `up`/重建不会再次执行，也**不会覆盖或清空已有数据**。因此无需再手动运行任何初始化命令。

### 3. 验证

```bash
# 查看 app/mysql（+ redis，若用带 Redis 版本）状态（healthy/up）
docker compose --env-file .env -f docker/docker-compose.yml ps
docker compose --env-file .env -f docker/docker-compose.yml logs -f app   # 查看应用日志
curl http://localhost:3000       # 或浏览器访问 服务器IP:3000
```

### 4. 常用运维命令

以下以带 Redis 版本为例；不带 Redis 时把 `docker/docker-compose.yml` 换成 `docker/docker-compose.noredis.yml` 即可。

```bash
# 更新代码后重新部署（不影响数据库数据）
git pull --recurse-submodules
docker compose --env-file .env -f docker/docker-compose.yml up -d --build

# 重启 / 停止
docker compose --env-file .env -f docker/docker-compose.yml restart app
docker compose --env-file .env -f docker/docker-compose.yml down   # 停止并删除容器（数据卷保留）

# 查看日志
docker compose --env-file .env -f docker/docker-compose.yml logs -f mysql

# 进入 MySQL 命令行（库名以 .env 中的 $DB_NAME 为准）
docker compose --env-file .env -f docker/docker-compose.yml exec mysql mysql -uroot -p"$DB_PASSWORD" "$DB_NAME"

# 数据备份
docker compose --env-file .env -f docker/docker-compose.yml exec mysql mysqldump -uroot -p"$DB_PASSWORD" "$DB_NAME" > backup.sql
```

> ⚠️ **重新构建/升级前，请先在后台备份数据**
>
> 常规的 `docker compose ... up -d --build` 只重建应用镜像，**不会**动 MySQL 数据卷，数据是安全的。但在以下场景数据可能丢失或不兼容，务必先备份：
>
> - 需要执行 `docker compose ... down -v`（会**删除数据卷、清空所有数据**）；
> - 迁移服务器、更换数据库；
> - 版本升级涉及数据表结构变更。
>
> **备份方式（推荐）**：登录后台 →「数据备份与恢复」→「导出数据」，下载全站数据 JSON 备份；升级完成后在同一页面「导入数据」即可恢复。（该功能不含 `users`/`sessions` 表，登录态与管理员账户不受影响。）
>
> 也可用上面的 `mysqldump` 命令做整库 SQL 级备份。

### 5. 反向代理与 HTTPS

容器仅对外暴露 `${DEPLOY_PORT}`（默认 `3000`，HTTP）。生产环境建议在宿主机再挂一层 Nginx，将 `80/443` 反代到 `127.0.0.1:3000` 并配置 TLS。可用 `scripts/generate-nginx-conf.mjs` 生成 Nginx 配置模板。

> ⚠️ **数据持久化与安全**
> - MySQL 数据存于 `mysql-data` 卷、带 Redis 版本下 Redis 数据存于 `redis-data` 卷。
> - 用户上传目录是 **bind mount**：宿主目录 `UPLOADS_DIR`（默认项目根 `uploads/`，本地文件系统直接可见）挂载到容器内固定路径 `/app/.output/public/uploads`。重建镜像不丢失，上传文件在宿主机即可直接访问/备份。Linux 上若容器内 `node` 用户写不进去（EACCES），需自行 `chown` 该宿主目录。
> - `docker compose down` **不会**删除数据卷；仅 `docker compose down -v` 会清空所有数据，请谨慎使用。
> - 首次 `up -d --build` 会执行 Bun 构建，耗时较长，属正常现象。

## site.config.ts 说明

`site.config.ts` 是全站的**静态配置**文件，被 `nuxt.config.ts`、`app/`（前端）与 `server/`（服务端）三方共同引用。它提供三类值：数据库未初始化时的默认 / 兜底值、构建时需要的常量（PWA manifest、CSP、SEO meta），以及统一的 SEO 文案。

> ⚠️ 该文件的值在**打包时被内联**进客户端与服务端产物，属于构建时常量，**运行时无法修改**（改动需重新打包）。真正运行时可变的配置由数据库 + `useSiteSettings()` 管理。因此这里只放「基本不变」或「构建期就要确定」的内容。

文件顶部集中定义了一批原始字面量（`_name`、`_url`、`_cdnUrl` 等），下方字段由它们派生，**大多数情况下只需修改这些字面量**即可：

```ts
const _name = "ImQi1";                 // 站点名称
const _url = "https://imqi1.com";      // 站点访问地址
const _cdnUrl = "https://cdn.imqi1.com"; // CDN 根地址（未用 CDN 可与站点同域）
```

主要配置项：

| 字段 | 说明 |
| --- | --- |
| `siteName` / `siteUrl` / `cdnUrl` / `rootDomain` | 站点名、访问地址、CDN 根地址与主域名。 |
| `siteAvatarPath` / `ownerName` | 站点头像路径（自动带 CDN 前缀）与站长名。 |
| `security.allowedRefererDomains` | 允许访问 `/api/*` 的 Referer 域名白名单（`/api/mini/*` 除外，走签名鉴权）。 |
| `seo` | 全站默认的 description、keywords、og:image、og:locale、Twitter 账号等。 |
| `social` | 页脚 / 侧栏的社交链接列表（名称、图标、地址）。 |
| `manifest` | PWA manifest 的名称、主题色、背景色等。 |
| `build.brotliCompression` | 构建时是否预压缩静态资源为 brotli（`.br`），需 Nginx / CDN 配合发送预压缩文件。 |
| `features.miniApi` | 是否启用小程序 API。关闭后 `server/api/mini` 不注册、也不打入生产包。 |
| `features.miniComment` | 是否开启小程序评论。关闭后小程序端不展示评论区，服务端评论接口也不受理。 |
| `amap` | 高德地图相关：`useServerProxy` 生产是否走服务端 nitro 代理路由 `/_AMapService`（开发恒直连）、`entryLinks` 是否展示地图入口胶囊（分开发 / 生产）。地图能否加载由运行时判断，key / securityCode 运行时从环境变量读取（不打包进产物），生产代理模式下浏览器不持 key。 |
| `pageTransition.fadeDuration` | 页面过渡淡入淡出时长（ms），也是各页面等待过渡完成再启动元素动画的统一延迟。 |
| `homeCustomText` | 首页自定义 HTML 文案。 |
| `links` | 友链页的博客组织入口（`blogOrganizations`）与本站资料（`profile`，供他人添加友链）。 |
| `pageSeo` | 各页面（首页、关于、友链、留言、归档、地图、分类、标签等）的独立 SEO 文案；`category` / `tag` 等为函数，按名称 / 描述动态生成。 |

> 该文件同时是 PWA manifest、CSP、SEO 等构建时数据的来源，务必在**打包前**配置好。修改后需重新 `bun run build` 才会生效。

## package.json 内脚本

项目的常用命令都收敛在根目录 `package.json` 的 `scripts` 中，下面按用途分组说明。带 `pre` / `post` 前缀的钩子（`prebuild`、`postbuild`、`postinstall`）由 Bun 在对应主命令前后自动执行，一般无需手动调用。

> **运维脚本的独立依赖**：部分脚本（`upload:cos`、`upload:server`、`compress:livephoto`、`db:init` 等）依赖较重的包（`ffmpeg-static` 约 80M、`cos-nodejs-sdk-v5`、`ssh2-sftp-client`、`mysql2`、`tsx`）。这些包已从根 `package.json` 移到 `scripts/package.json` 单独管理，**不参与主项目 `bun install` 与 Docker 构建**，以加快日常安装。首次运行这些脚本前，先执行一次 `bun run scripts:install`（即 `bun install --cwd scripts`）安装脚本依赖。脚本中共享的轻量依赖（如 `dotenv`、`bcryptjs`、`ipdb`）仍由根 `node_modules` 提供，无需重复安装。

### 开发与构建

| 命令               | 说明                                                                                                                        |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `bun run dev`      | 启动 Nuxt 开发服务器（默认 [http://localhost:3000](http://localhost:3000)），带热更新。                                     |
| `bun run build`    | 打包生产产物到 `.output/`。`prebuild` 会先生成构建 hash，`postbuild` 会拷贝 `data/` 数据并更新 Service Worker 的 CDN 引用。 |
| `bun run preview`  | 本地预览已打包的生产产物（`nuxt preview`），用于上线前验证 `.output/`。                                                     |
| `bun run generate` | 生成静态站点（`nuxt generate`）。本项目以 SSR 为主，一般用不到。                                                            |
| `bun run serve`    | 启动简易文件服务器（根目录为 `.attachments/`），方便开发期管理附件，不污染 `uploads/`。                                     |

### 数据库与 Prisma

| 命令                      | 说明                                                                                    |
|---------------------------|-----------------------------------------------------------------------------------------|
| `bun run prisma:generate` | 生成 Prisma Client（等价于 `bun prisma generate`）。修改 `schema.prisma` 后需重新执行。 |
| `bun run prisma:studio`   | 打开 Prisma Studio 可视化查看 / 编辑数据库。                                            |
| `bun run db:init`         | 执行 `scripts/init-db.sql`，一步完成建表、写入默认设置并插入示例数据；幂等可重复执行。  |
| `bun run reset:password`  | 重置指定用户的登录密码，忘记后台密码时使用。                                            |

### 部署与运维

| 命令                     | 说明                                                                                          |
|--------------------------|-----------------------------------------------------------------------------------------------|
| `bun run upload:cos`     | 将 `public/` 静态资源上传到腾讯云 COS（需配置 `.env` 中的 `COS_*`）。                         |
| `bun run upload:server`  | 通过 SFTP 将 `.output/server` 上传到服务器（需配置 `SERVER_*`）；支持 `-- --dry-run` 预览。   |
| `bun run restart:server` | 通过宝塔面板 API 远程重启服务器上的 Node 项目；支持 `-- start` / `-- stop`（需配置 `BT_*`）。 |
| `bun run nginx:generate` | 根据 `.env` 中的 `*_PROD` 变量生成参考 Nginx 配置，填写到宝塔面板 node 管理器中的伪静态中。   |
| `bun run clear:redis`    | 通过宝塔面板 API 远程清空 Redis 中的 ISR / 搜索缓存。                                         |

### 辅助工具

| 命令                         | 说明                                                              |
|------------------------------|-------------------------------------------------------------------|
| `bun run scripts:install`    | 安装运维脚本的独立依赖（`scripts/package.json`），运行下方需要重依赖的脚本前执行一次即可。 |
| `bun run check:update`       | 从 npm 检查项目依赖是否有新版本。                                 |
| `bun run get:ip`             | 查询 IP 的地理归属信息（IP 归属地数据库工具），基于纯真IP数据库。 |
| `bun run compress:livephoto` | 压缩实况照片（JPEG + 内嵌 MP4 的合并文件）。                      |

### 小程序（`mini/` 子模块）

为省去手动切换目录，根目录预置了一批 `mini:*` 转发脚本，它们本质是 `bun --cwd mini run <子命令>`，也可以直接进入 `mini/` 目录执行对应命令。

| 命令                           | 说明                                                     |
|--------------------------------|----------------------------------------------------------|
| `bun run mini:dev:h5`          | 以 H5 模式启动小程序开发。                               |
| `bun run mini:dev:mp-weixin`   | 以微信小程序模式启动开发（产物需用微信开发者工具打开）。 |
| `bun run mini:dev:mp-alipay`   | 以支付宝小程序模式启动开发。                             |
| `bun run mini:build:h5`        | 打包 H5 版本。                                           |
| `bun run mini:build:mp-weixin` | 打包微信小程序版本。                                     |
| `bun run mini:build:mp-alipay` | 打包支付宝小程序版本。                                   |
| `bun run mini:type-check`      | 对小程序代码做 TypeScript 类型校验（`vue-tsc`）。        |
| `bun run mini:lint`            | 对小程序代码执行 ESLint 并自动修复。                     |

> 小程序端通过 HMAC-SHA256 签名（时间戳 + nonce）调用主站的 `/api/mini/*` 接口，签名密钥由主站的 `MINI_API_SECRET` 与小程序的 `VITE_MINI_API_SECRET` 两处**填写相同的值**保证一致。开发环境（`NODE_ENV=development`）或主站未配置密钥时跳过校验。

## 小程序

`mini/` 是一个以 Git 子模块形式并入的 [uni-app](https://uniapp.dcloud.net.cn/) 项目（Vue 3 + TypeScript + Vite），UI 基于 [wot-design-uni](https://wot-design-uni.pages.dev/)，一套代码可编译到 **H5 / 微信小程序 / 支付宝小程序** 三端。它不直连数据库，而是复用主站提供的 `/api/mini/*` 专用接口，是主站内容的一个轻量展示端（评论 / 留言可写）。

### 环境变量

`mini/` 使用独立的 `.env.*` 文件（与主站根目录的 `.env` 无关），复制 `.env.example` 后按 mode 分别填写：

- `.env.development` — 执行 `dev:*` 时加载；
- `.env.production` — 执行 `build:*` 时加载（提审 / 正式发布用）。

```shell
# 后端 API 基址，统一包含 /api/mini（生产须为 HTTPS）
#   dev  示例：http://localhost:3000/api/mini
#   prod 示例：https://imqi1.com/api/mini
VITE_API_BASE_URL=https://imqi1.com/api/mini

# API 签名密钥，须与主站的 MINI_API_SECRET 完全一致；
# 留空则请求不带签名头（主站未配置密钥时也不校验，两端需同步开关）
VITE_MINI_API_SECRET=
```

### 站点配置

`src/site.config.ts` 是小程序侧的静态配置，与主站的 `site.config.ts` 相互独立，常用项：

- `siteName` / `siteUrl` — 站点名与主站地址；
- `home` — 首页顶部的标语、按钮文案；
- `category.pageSize` — 分类 / 列表分页大小；
- `category.photoCategorySlugs` — **图片分类**的 slug 列表。命中的分类走双列封面瀑布流，从中进入文章详情时带 `photo=1` 切换为「大图在上、信息在下」的图片版式，其余分类走普通标题列表。

### 本地开发

在**项目根目录**通过转发脚本启动（也可进入 `mini/` 直接执行）：

```bash
# H5（浏览器预览，最快）
bun run mini:dev:h5

# 微信小程序：产物在 mini/dist/dev/mp-weixin，用微信开发者工具打开该目录
bun run mini:dev:mp-weixin

# 支付宝小程序
bun run mini:dev:mp-alipay
```

微信 / 支付宝端还需在对应的开发者工具中填入自己的 AppId（`src/manifest.json` 的 `mp-weixin.appid` / `mp-alipay.appid`），并将主站 API 域名加入平台的 **request 合法域名**。

### 打包发布

```bash
bun run mini:build:mp-weixin   # 产物：mini/dist/build/mp-weixin
bun run mini:build:mp-alipay
bun run mini:build:h5          # H5 静态站点，可单独部署
```

小程序端的打包产物用各平台开发者工具上传、提交审核、发布。提交前建议先跑 `bun run mini:lint` 与 `bun run mini:type-check` 确保代码规范与类型无误。

> 小程序 `<image>` 只能加载平台白名单内的域名且无法携带自定义请求头，因此评论头像使用镜像站（Gravatar / Cravatar / WeAvatar 等）直链而非经主站代理——记得把所用镜像站域名一并加入小程序后台的 **downloadFile 合法域名**。

## 更新日志格式

每次通过 Claude Code 等软件更新代码并提交后，可让它生成符合后台一键导入格式的更新日志。

格式：

```ts
type Changelogs = Changelog[];

type Changelog = {
  createTime: string;
  entries: ChangelogItem[];
};

type ChangelogItem = {
  type: "新增" | "修改" | "修复" | "优化" | "设计" | "删除" | "其他";
  value: string;
};
```

## 辅助功能

### 实况照片压缩

本 CMS 支持显示实况照片，目前支持的格式为安卓的 JPEG，它将图片和视频用 `ftyp` 隔开，所以代码库中内置了一个压缩实况照片的脚本，可以同时压缩图片和视频。

使用方式：将 jpg 格式的实况照片放在根目录的 `.live-photos` 目录下，运行 `bun run compress:livephoto` 即可压缩。压缩后的实况照片位于 `.compressed-live-photos` 目录下。

### IP 地址查询

本站 IP 和 ISP 离线库源于社区开源的 qqwry 和 ipv6wry.db 数据库，并拼接到一起，只保留了城市信息（国外则是国家名），为了精简体积和访客地图显示粒度（访客地图只精确到城市名）。

为确保结果准确，可执行 `bun run get:ip` 查询 IP 的归属地和运营商，该命令会同时查询本地数据库和 [ip.zxinc.org](https://ip.zxinc.org)，并返回两者的结果。

## 故障排查

部署或运行中遇到问题时，先对照下表常见原因排查：

| 现象 | 排查方向 |
| --- | --- |
| 启动报 Prisma 相关错误、查询报模型 / 字段不存在 | 忘记执行 `bun prisma generate`，或修改 `schema.prisma` 后未重新生成 Client。 |
| 重新打包后 `uploads/` 下之前上传的文件全部消失 | 裸机部署未设置 `UPLOADS_DIR`，`bun run build` 会重建 `.output/`。把 `UPLOADS_DIR` 指向 `.output` 之外的独立目录；Docker 部署已用 bind mount（`UPLOADS_DIR` 默认项目根 `uploads/`）持久化，无此问题。 |
| 本地 `bun run preview` 时页脚音乐、高德地图等被拦截 | CSP 仅在生产构建注入，会拦第三方直链 / 脚本。把 `site.config.ts` 的 `security.enableCsp` 临时改 `false`，验证完改回 `true`。 |
| Bun 相关命令异常 | 项目要求 Bun ≥ 1.3（`packageManager` 锁定 `bun@1.3.10`），版本过低请升级。 |
| 小程序请求 `/api/mini/*` 返回 401 / 签名校验失败 | 主站 `MINI_API_SECRET` 与小程序 `VITE_MINI_API_SECRET` 必须完全一致；其中一端留空时另一端也必须留空。 |
| 改了 `DB_NAME` 后 Docker 节里的 `mysql` / `mysqldump` 命令连不上 | 这些命令请用 `"$DB_NAME"` 而非硬编码库名，详见 [「使用 Docker 部署」](#使用-docker-部署)。 |
| Firefox 下实况照片无法播放 | 多为 HEVC 编码，Firefox 暂不支持，会自动降级为静态图；如需播放需服务端转码。 |
| Docker 部署时 `imqi1-mysql` 容器无限重启，日志报 `MYSQL_USER="root" ... cannot be used for the root user` | `.env` 的 `DB_USER` 误设为 `root`。改为普通用户名（如 `nodejs`）后重新 `docker compose ... up -d`；若数据卷从未成功初始化，mysql 会全新建库并自动导入 `init-db.sql`。 |
