# ImQi1 CMS

[![license](https://img.shields.io/github/license/imqi1-github/imqi1-cms.svg?label=License&color=blue)](LICENSE)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com)
[![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2d3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![bun](https://img.shields.io/badge/bun-1.4-f472b6?logo=bun&logoColor=white)](https://bun.sh)
[![uni-app](https://img.shields.io/badge/uni--app-H5%2FWeChat%2FAlipay-1685a5?logo=vuedotjs&logoColor=white)](mini)

预览：[https://imqi1.com](https://imqi1.com) · 文档：[https://docs.qi1.website](https://docs.qi1.website)

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
- [服务器管理 PostgreSQL 数据库](#服务器管理-postgresql-数据库)
- [参与贡献](#参与贡献)

## 项目介绍

ImQi1 CMS 是一套基于 **Nuxt 4 + Prisma + TailwindCSS** 构建的全栈个人博客与内容管理系统，也是个人站点 [imqi1.com](https://imqi1.com) 的完整源码。它并非通用型 CMS 模板，而是围绕「做技术的分享者、生活的摄影师、时事的评论员」这一定位打磨的一站式内容平台，覆盖从内容创作、发布、管理到多端展示的完整链路。

项目采用 **SSR + ISR（增量静态再生成）** 架构：页面在服务端渲染以保证首屏与 SEO，同时借助 Redis 缓存渲染结果（未配置 Redis 时页面不做整页缓存、每次实时渲染，搜索缓存关闭），兼顾性能与实时性——ISR 路由统一 **30 分钟过期**（时长由 `nuxt.config.ts` 的 `ISR_CACHE_SECONDS` 常量统一控制，改动内容最迟 30 分钟内在全站可见）。数据层使用 Prisma 7 搭配 PostgreSQL 适配器直连 PG，前后端类型则通过 Nuxt 的 `InternalApi` 自动推断，无需额外的类型生成器。

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

- **Node.js** ≥ 22（推荐 LTS 版本）
- **PostgreSQL** ≥ 14（推荐 16，与 docker 镜像版本一致；用于存储站点数据）
- **Bun** ≥ 1.3（项目使用的包管理器与脚本运行器）

### 安装项目

1. **安装 Node.js**

   前往 [nodejs.org](https://nodejs.org/) 下载并安装 LTS 版本，安装完成后确认：

   ```bash
   node -v
   ```

2. **安装 PostgreSQL**

   安装并启动 PostgreSQL 即可，**无需手动建库**：第 8 步的 `bun run db:init` 会在库不存在时自动创建 `DB_NAME` 指定的数据库（UTF8 编码 + C 排序规则、属主为 `DB_USER`）并建表。该脚本以 `DB_USER` 身份连库，所以这个账号要能建库、并能创建 `pg_trgm` 扩展（通常需要超级用户）；权限不足时，改用超级用户单独执行 `scripts/init-db.sql` 末尾的扩展与索引段。

   > PG 默认超级用户是 `postgres`，生产建议新建应用账号单独管理（见 `.env.example` 的 `DB_USER` / `DB_PASSWORD`）。

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
   git clone --recurse-submodules https://github.com/imqi1-github/imqi1-cms.git
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

   复制示例文件并按实际情况填写数据库连接等配置：

   ```bash
   cp .env.example .env
   ```

   至少需要配置数据库相关变量（`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`）：应用运行时的 PostgreSQL 适配器直接使用它们，需连库的 Prisma 命令（`prisma studio`、`prisma db execute` 等）也会由 `prisma.config.ts` 用这套变量自动拼接连接串，无需单独配置 `DATABASE_URL`。

7. **生成 Prisma Client**

   ```bash
   bun prisma generate
   ```

8. **初始化数据库**

   执行初始化脚本，一步完成建表、写入站点默认设置并插入示例数据：

   ```bash
   bun run db:init
   ```

   该命令会读取 `.env` 中的数据库配置，先自动创建 `DB_NAME` 指定的数据库（不存在时）并把该库的默认时区设为 UTC（归档分组与按时间排序依赖它，见 `scripts/init-db.ts` 注释），再执行 `scripts/init-db.sql`：创建全部 16 张数据表、写入所有站点设置项的默认值，并插入一份示例数据（1 个管理员、1 个分类、1 篇文章、1 条评论）。脚本是幂等的，可安全重复执行，不会产生重复数据，也不会覆盖你已修改过的内容。

   初始化后即可使用默认管理员账户登录后台：

    | 项目   | 默认值                |
    |--------|-----------------------|
    | 用户名 | `admin`               |
    | 密码   | `123456`              |
    | 邮箱   | `example@example.com` |

   > ⚠️ 出于安全考虑，登录后请立即在后台「账户设置」中修改密码。
   >
   > 生产环境也可跳过此命令，直接在数据库管理工具（pgAdmin / DBeaver / psql 等）中导入 `scripts/init-db.sql`。但这样只执行 SQL 本身：**不会**自动建库、**不会**把库时区设为 UTC，两者需自行处理（时区非 UTC 会影响归档分组与按时间排序）。

9. **启动开发服务器**

   ```bash
   bun run dev
   ```

   默认访问地址为 [http://localhost:3000](http://localhost:3000)，管理后台位于 `/admin`。

### 开发

代码规范与类型校验分三项，项目根没有封装 lint / type-check 脚本，直接在**项目根目录**用 `bunx`（CWD 别停在 `mini/`）：

```bash
bunx eslint .          # ESLint（flat config，error 驱动，刻意不降级为 warn）
bunx nuxi typecheck    # Nuxt 类型检查（根 vue-tsc 不走 .nuxt/tsconfig 会漏报）
bun run tailwindcss:lint
```

小程序端（`mini/`）改动用 `bun run mini:lint` / `bun run mini:type-check`。

开发环境，运行 `bun run dev` 启动开发服务器，然后在浏览器访问 [http://localhost:3000](http://localhost:3000) 即可查看站点效果。

为方便开发，本站提供了一个简易文件服务器（`scripts/file-server.ts`）：在根目录创建 `.attachments` 文件夹作为它的根目录，运行 `bun run serve` 启动，默认监听 `3030` 端口并绑定所有网卡（同局域网设备可直接访问；只想本机用可 `HOST=127.0.0.1 bun run serve`）。使用它可以在不污染 `uploads/` 文件夹的情况下管理文件。注意这种方式没有对接 ImQi1 CMS 的文件上传功能，需要手动把文件放进 `.attachments`，并且附件功能也未适配。

开发完成后，参照下一节做好生产环境的相关配置，就可以打包部署了。

开发前记得先执行 `bun prisma generate` 生成 Prisma Client，确保数据库模型与代码保持一致。

## 生产环境搭建

生产环境采用「**本地打包 → 上传产物 → 服务器运行 Node 服务**」的部署模式。

> 📌 **关于端口号**：下文端口均为默认示例，可任意修改。注意有两套变量：应用真正监听的端口是运行环境的 `PORT`（见第 8 节），`DEPLOY_PORT` 只喂给 Nginx 配置生成与 Docker 的宿主端口映射。**裸机部署**须让 `PORT` 与 `DEPLOY_PORT` 相等——Nginx 的反代目标就是 `127.0.0.1:${DEPLOY_PORT}`，只改一个会断掉反代。**Docker 部署**下 `DEPLOY_PORT` 即宿主端口（容器内固定 `3000`）。

### 1. 准备开发环境

先按照上一节「[开发环境搭建](#开发环境搭建)」完成本地环境的搭建（克隆仓库、安装依赖、生成 Prisma Client 等），确保项目已能在本地正常打包。

### 2. 配置生产环境变量

在项目根目录的 `.env` 中补充生产环境相关变量（可参考 `.env.example`）。关键项包括：

```shell
# 腾讯云 COS 对象存储（可选，用于上传静态资源到 COS）
COS_SECRET_ID=""
COS_SECRET_KEY=""
COS_BUCKET=""
COS_REGION=""

# 上传服务端产物到服务器（可选，SFTP）
SERVER_HOST="你的服务器 IP"
SERVER_PORT="22"
SERVER_USER="root"
SERVER_PASSWORD="你的服务器密码"
SERVER_UPLOAD_DIR="/www/wwwroot/your-site"
SERVER_UPLOAD_CONCURRENCY="8"      # 上传并发数（可选）

# 生成 Nginx 配置所需
DEPLOY_PORT=3000
DEPLOY_PROJECT_ROOT_DIR=/www/wwwroot/your-site
DEPLOY_SITE_DOMAIN=your-domain.com
DEPLOY_CDN_DOMAIN=cdn.your-domain.com
DEPLOY_ENABLE_CDN_REDIRECT=true
```

Redis 是**构建期配置**，取值写在 `site.config.ts` 的 `build.redis`（裸机部署改这里，`host` 填 `127.0.0.1` 或服务器 IP 即可）：

```ts
build: {
  redis: { enabled: true, host: "127.0.0.1", port: 6379, db: 0 },
},
```

`nuxt build` 打包时读取并烘焙进服务端产物，ISR 增量缓存与搜索缓存共用同一组值，**改动后需重新打包**；**生产服务器运行环境不要再设置任何 Redis 环境变量**（`NUXT_REDIS_*` 之类）。**开发环境恒不启用 Redis**（本地走普通 SSR、搜索缓存关闭），无需配置。未启用（`enabled: false` 或 `host` 为空）时页面整页缓存与搜索缓存一并关闭，均不报错。

> Docker 部署不用改 `site.config.ts`：选哪套 compose 文件即决定是否启用，参数在构建命令里覆盖，见下方「[使用 Docker 部署](#使用-docker-部署)」。

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

> 该文件同时被 `nuxt.config.ts`、前端与服务端引用，是 CSP、SEO meta、CDN 前缀、Referer 白名单等构建时数据的来源。

### 4. 本地打包

```bash
bun run build
```

产物位于 `.output/` 目录，内部包含一个前端文件目录、服务端代码目录、nitro 版本信息和构建哈希。

> ⚠️ **本地上传目录建议设置 `UPLOADS_DIR`**。附件若使用「本地上传」（非 COS），默认写入 `.output/public/uploads`；而 `bun run build` 会删除并重建整个 `.output`，**重新打包后已上传的文件会全部丢失**。请在运行环境变量中把 `UPLOADS_DIR` 指向 `.output` 之外的独立绝对路径（如 `/www/wwwroot/your-site/uploads`）持久保存，详见下文第 8 节。使用腾讯云 COS 存储的用户不受影响。

> **本地用 `nuxi preview` 验证打包产物时，建议先把 `site.config.ts` 的 `security.enableCsp` 改为 `false`**。CSP 仅在生产构建注入，会拦截音乐直链、地图第三方脚本等，干扰本地功能验证；确认功能正常后改回 `true` 再打正式包。

### 5. 上传构建产物到 CDN（可选）

使用 CDN 时，构建产物需要放到 CDN 的 `static/<hash>/` 目录下（引用路径由构建 hash 与 `site.config.ts` 的 `site.cdnUrl` 共同决定）。若对象存储使用腾讯云 COS，在 `.env` 中配置好 `COS_*` 变量后，**在本地打包之后**执行：

```bash
bun run upload:cos
```

上传来源是 `.output/public`（**不是源码里的 `public/`**），且默认只收构建产物：`.js` / `.css` 及其 `.br` / `.gz` 预压缩变体、`builds/**` 懒加载元数据；目标前缀取自 `.output/build-hash.json` 的 `dir`（即 `static/<hash>`）。该文件不存在时脚本会直接报错退出，所以**必须先 `bun run build`**。

`imgs/` / `fonts/` / `icons/` / `skills/` / `emojis/` / `uploads/` 这些静态目录，以及 `manifest.webmanifest`、`sw.js` **都不在**默认上传范围内（由 CDN 回源到站点提供）。

> ⚠️ 上传前脚本会交互式询问「是否清空远程目录」，答 `y` 才继续、答 `n` 则取消本次上传（不动已有文件）。清空范围限于上面那个 `static/<hash>` 前缀，不是整个存储桶。

### 6. 上传服务端产物到服务器（可选）

将 `.output/server` 内的文件上传到服务器的项目目录。项目内置了基于 SFTP 的上传脚本，配置好 `.env` 中的 `SERVER_*` 变量后可执行：

```bash
# 先干跑预览将要上传的文件
bun run upload:server -- --dry-run

# 正式上传
bun run upload:server
```

> 默认**跳过** `node_modules` 与 `runtime-assets/`（内含 `qqwry.ipdb` IP 库、验证码字体 `DejaVuSans.ttf`、`svg2png_wasm_bg.wasm`、`emojis.json`——大且几乎不变，重复上传浪费）。**首次部署新服务器或这些资源更新时，务必加 `--node-modules` 一并上传**，否则验证码与 IP 归属地查询会失效：

```bash
bun run upload:server -- --node-modules
```

> 也可以手动将 `.output/server` 目录上传到服务器，或在服务器上直接 `git clone` 后打包，方式不限。

### 7. 在服务器初始化数据库

在服务器的数据库中创建一个空数据库，然后导入初始化脚本，一次性完成建表、写入默认设置并插入示例数据：

```bash
# 在数据库管理工具（pgAdmin / DBeaver / psql）中导入
scripts/init-db.sql
```

SQL 与开发环境用的是同一份（`scripts/init-db.sql`），会创建全部 16 张数据表，且幂等可重复执行。默认管理员账户为 `admin` / `123456`（登录后请立即修改密码）。文件末尾的 `pg_trgm` 扩展与索引需要超级用户权限，导入账号权限不足时会报错（可单独用超级用户执行该段）。

> ⚠️ 手动导入只执行 SQL 本身：**不会**自动建库、**不会**把库时区设为 UTC，两者需自行处理。时区非 UTC 会影响归档分组与按时间排序（开发环境第 8 步的 `bun run db:init` 会在执行 SQL 前替你设好）。可自行补一句：
>
> ```sql
> ALTER DATABASE "你的库名" SET timezone = 'UTC';
> ```

### 8. 升级已有部署的数据库

新版本可能涉及 schema 变更（新增字段、修改索引、改 informations 表种子等）。**禁止 `prisma migrate dev/reset`**（会清空数据）。按当前运行版本与目标版本，**到文档站的「数据库迁移」页面在线生成 SQL**：

- 打开 [https://docs.qi1.website/migration-tool](https://docs.qi1.website/migration-tool)
- 起点选当前运行版本（如 v1.1.0），目标选要升级到的版本（如 v1.2.0）
- 工具按区间顺序或逆序拼接所有需要执行的 SQL（含 DDL / informations 表种子变更 / 索引）
- **执行前先备份**：`pg_dump -Fc dbname > backup.dump`
- 复制 SQL 到 psql / pgadmin 执行
- 升级 v1.1.4→v1.2.0 这步含 `pg_trgm` GIN 索引，**需数据库属主有 `CREATE EXTENSION` 权限**（PostgreSQL 13+ 为 trusted 扩展，多数情况下应用账号即可；无权限时以超级用户单独执行该段）

数据条目维护在 docs 仓的 `data/migrations.json`，每条对应「**从某 release/commit 到下一段**」的一段可执行 SQL + commit hash。文档站的迁移页面会列出所有 DDL 变更点，方便逐条对照执行。

### 9. 指定服务器运行环境变量

在服务器的运行环境（宝塔「Node 项目管理器」的环境变量、系统环境变量或 `.env`）中配置生产运行所需变量。以下为一份完整示例，请将其中的账号、密码、密钥等替换为你自己的值：

```shell
# 数据库
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="nodejs"
DB_PASSWORD="your_password"
DB_NAME="nodejs"

# 运行环境
PORT=3000
# 必须为完整单词 production（写 prod / 留空会按非生产处理）：构建与启动都需要。
# 非 production 时 CDN 前缀 / 构建 hash 目录 / PWA start_url / cookie secure 等不生效（这些判断都是 === "production"）。
# 注意：referer 与小程序签名校验只在 NODE_ENV=development 时整段跳过——写 prod 或留空**不会**跳过，仍按生产强制校验。
NODE_ENV="production"
UV_THREADPOOL_SIZE=64

# 本地上传目录（强烈建议设置为 .output 之外的绝对路径）
# 不设时默认写入 .output/public/uploads，而每次重新打包 `bun run build` 会
# 删除并重建整个 .output，导致已上传的用户文件全部丢失。设为独立目录即可持久保留。
UPLOADS_DIR="/www/wwwroot/your-site/uploads"

# Redis 无需在此配置：Redis 是构建期配置（源头在 site.config.ts 的 build.redis），
# 打包时已烘焙进产物（见上文「生产环境搭建」第 2 节）。同时不要设 NUXT_REDIS_* / NITRO_REDIS_*——
# 它们会在运行时覆盖烘焙值（见 docker/README.md「运行时覆盖」）。

# 高德地图，可选
# key / securityCode 均为运行时读取，不烘焙进构建产物：
# - 生产走服务端 nitro 代理（site.config 的 amap.proxy=true）：浏览器不持 key，
#   部署后在运行环境设置 AMAP_KEY / AMAP_SECURITY_CODE 即可生效，无需重新打包。
# - 开发环境恒直连：浏览器需 key 加载高德 JS，开发运行时从环境变量读取。
AMAP_KEY="your_amap_key"
AMAP_SECURITY_CODE="your_amap_security_code"

# 反向代理（生产在 Nginx 之后时必配）
# 填前端接入层的回源 IP 或网段（逗号分隔，支持 CIDR）。不配则 X-Forwarded-For 被忽略、
# 所有访客 IP 塌缩成反代 IP——访客地图与评论 IP 记录会全部失真。
TRUSTED_PROXY="127.0.0.1"

# 微信小程序码（可选）：留空则 /api/qrcode 返回 404，前台自动隐藏「小程序看」入口
WECHAT_MINI_APPID=""
WECHAT_MINI_SECRET=""

# 登录令牌签名密钥（2FA challenge 与「信任此设备」cookie）
# 留空会退回 SSR 密钥、再退化为每次启动随机生成——信任设备状态重启即失效。
LOGIN_SECRET=""

# SSR 内部请求密钥 / 小程序 API 密钥（建议填写随机长字符串）
SSR_INTERNAL_REQUEST_SECRET="your_random_secret"
MINI_API_SECRET="your_random_secret"
```

> ⚠️ 上述密钥、密码等敏感信息切勿提交到代码仓库，请仅在服务器运行环境中配置。

### 10. 启动 Node 服务

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
BT_PROJECT_NAME="your-project-name"
```

> 需在宝塔面板「API 接口」中**开启 API**，并将本地公网 IP 加入 **IP 白名单**，否则请求会被拒绝。

配置完成后即可远程控制服务：

```bash
bun run restart:server          # 重启
bun run restart:server -- stop  # 停止
bun run restart:server -- start # 启动
```

服务启动后，还需配置 Nginx 将其（默认 `127.0.0.1:3000`）反向代理到对外域名，并处理 HTTPS、PWA 脚本缓存与静态资源重定向。可执行 `bun run nginx:generate` 根据 `.env` 中的 `DEPLOY_*` 变量生成参考配置。

### 11. 查看运行日志

服务启动后，通过日志确认运行状态、排查启动或运行时错误：

- 使用宝塔「Node 项目管理器」时，可在项目详情页直接查看实时日志；
- 使用 PM2 时，通过 `pm2 logs` 查看；
- 直接运行时，观察终端输出或将 `node .output/server/index.mjs` 的 stdout/stderr 重定向到日志文件。

看到类似 `Listening on http://[::]:3000` 的输出即表示服务已成功启动。

## 使用 Docker 部署

Docker 部署文件已整理进 `docker/` 子目录，提供**两套独立版本**按是否需要 Redis 二选一：

- **带 Redis**（`docker/docker-compose.yml` + `docker/Dockerfile`）：应用 + PostgreSQL 16 + Redis 7。默认烘焙 `redis:6379`（compose 服务名）并启动 redis 容器，ISR 增量缓存与搜索缓存共用。
- **不带 Redis**（`docker/docker-compose.noredis.yml` + `docker/Dockerfile.noredis`）：仅应用 + PostgreSQL 16。页面不做整页缓存、搜索缓存关闭，不创建 redis 容器/卷。

**是否启用 Redis 只由「选哪套 compose 文件」决定**：compose 的 `build.args` 是固定字面量，不读环境变量，所以 `.env` 里不需要也不应该写 `REDIS_*`（也不需要任何 `COMPOSE_PROFILES` 之类的环境变量魔法）。要指定连哪台 Redis、端口、DB 号，在**构建命令里用 `--build-arg` 覆盖**，例如 `--build-arg REDIS_HOST=10.0.0.5`（可用变量：`REDIS_ENABLED` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB`；默认部署的 redis 只在 compose 内网可达、未开鉴权，故**不支持密码**——原因与自行加密码的做法见 [`docker/README.md`](docker/README.md) 的「指定 Redis 参数」）。两个版本的具体用法、启动命令与运维命令见 **[`docker/README.md`](docker/README.md)**。

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
DB_PASSWORD="改成强密码"          # PostgreSQL 应用用户密码（compose 用它建库并传给 POSTGRES_PASSWORD）
DB_NAME="imqi1-cms"           # 库名，可自定义；compose 建库与导入 SQL 都用它
DB_USER="nodejs"                 # 应用连接用户；PG 单用户即超级用户，建议沿用非 postgres 的命名
DEPLOY_PORT=3000                   # 宿主对外端口，按需修改
```

常用可选变量（按需添加，均可留空）：

```bash
UPLOADS_DIR=""                 # 上传目录宿主路径；默认项目根 uploads/；自填建议用绝对路径——相对路径以 docker/ 为基准
AMAP_KEY=""                    # 高德地图 Key（旅行足迹地图功能）
AMAP_SECURITY_CODE=""          # 高德 JS API 安全密钥
SSR_INTERNAL_REQUEST_SECRET="" # SSR 内部请求密钥（建议随机长串）
MINI_API_SECRET=""             # 小程序 API 签名密钥
TRUSTED_PROXY="172.16.0.0/12"  # 反代回源网段（见下方说明）
```

> `DB_HOST` 会被 compose 自动覆盖为服务名 `postgres`，**无需手动填写容器名**。Redis：需要就用带 Redis 的版本（`docker-compose.yml`），不需要就选不带 Redis 的版本——**无需在 `.env` 里配任何 Redis 变量**；要改 Redis 地址等，在构建命令里加 `--build-arg`（见上文；**不支持密码**）。其它 COS 等按需填写，完整变量见 `.env.example`。
>
> ⚠️ **PG 单用户即超级用户**，不像 MySQL 区分 `root` / `MYSQL_USER`；`DB_USER` 设成 `postgres` 也能跑，但建议沿用普通用户名（如 `imqi1`）保持历史命名习惯。`DB_PASSWORD` 会作为 `POSTGRES_PASSWORD` 直接传给镜像，应用与 healthcheck 全程只使用这个用户。
>
> ⚠️ **建议配置 `TRUSTED_PROXY`**：端口映射下容器看到的对端是 **docker 网桥网关**（不是 `127.0.0.1`），不在白名单里就会被当成不可信来源、忽略 `X-Forwarded-For`，结果所有访客 IP 都塌缩成网关 IP——评论入库 IP、足迹去重、限流键全部合并成一个。网段由 docker 动态分配，所以要**写网段而不是单个网关 IP**（如 `172.16.0.0/12`）；详见 `server/utils/client-ip.ts` 的部署注意。

改动 site.config.ts 的配置，改成你自己的，比如 CDN 路径。配了 CDN 的话，构建完成后用 `bun run export:bundle` 从镜像里导出 `.output/public` 到 `./dist/<hash>/`，把整个目录上传到 CDN 的 `static/<hash>/` 即可。

### 2. 构建并启动

从项目根目录运行（注意命令带 `--env-file .env` 和 `-f docker/...`，详见 `docker/README.md`）：

```bash
# 带 Redis：构建镜像 + 后台启动 app / postgres / redis
docker compose --env-file .env -f docker/docker-compose.yml up -d --build

# 不带 Redis：仅 app / postgres
docker compose --env-file .env -f docker/docker-compose.noredis.yml up -d --build
```

首次启动时，PostgreSQL 会自动创建空库（`DB_NAME`）并**自动执行数据库初始化**：`scripts/init-db.sql` 已挂载到 PostgreSQL 官方镜像的 `/docker-entrypoint-initdb.d/` 目录，容器首次启动（数据卷为空）时会自动导入——建全部表 + 写入默认设置 + 插入示例数据，并创建默认管理员：

- 用户名：`admin`
- 密码：`123456`（登录后请立即在后台「账户设置」修改）

> 该自动初始化**仅在 `pg-data` 数据卷为空时执行一次**（即首次部署）。之后重新 `up`/重建不会再次执行，也**不会覆盖或清空已有数据**。因此无需再手动运行任何初始化命令。
>
> 这条路径只执行 SQL 本身，**不含** `bun run db:init` 里那句 `ALTER DATABASE ... SET timezone = 'UTC'`。实践中无碍：`postgres:16-alpine` 容器自身就是 UTC，PG 建库时按系统时区取默认值，落库即 UTC。若你改过容器时区或换了基础镜像，需自行补一句：
>
> ```bash
> docker compose --env-file .env -f docker/docker-compose.yml exec postgres \
>   psql -U imqi1 -d imqi1-cms -c "ALTER DATABASE \"imqi1-cms\" SET timezone = 'UTC';"
> ```

### 3. 验证

```bash
# 查看 app/postgres（+ redis，若用带 Redis 版本）状态（healthy/up）
docker compose --env-file .env -f docker/docker-compose.yml ps
docker compose --env-file .env -f docker/docker-compose.yml logs -f app   # 查看应用日志
curl "http://localhost:${DEPLOY_PORT:-3000}"   # 或浏览器访问 服务器IP:对应端口
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
docker compose --env-file .env -f docker/docker-compose.yml logs -f postgres

# 进入 PostgreSQL 命令行（用户名 / 库名换成你 .env 里的 DB_USER / DB_NAME）
docker compose --env-file .env -f docker/docker-compose.yml exec postgres psql -U imqi1 -d imqi1-cms

# 数据备份
docker compose --env-file .env -f docker/docker-compose.yml exec postgres pg_dump -U imqi1 imqi1-cms > backup.sql
```

> 上面两处的用户名 / 库名请替换成你 `.env` 里的实际值。**别写成 `"$DB_USER"` / `"$DB_NAME"`**：`--env-file .env` 只把变量提供给 compose，**不会**进当前 shell，没 `export` 时它们展开成空串、命令会直接报错。确实想在命令里用变量名，可以先 `set -a; . ./.env; set +a` 导入当前 shell（注意 `.env` 里含 `$` 的值会被 shell 展开，密码较复杂时建议直接填字面值）。

> ⚠️ **重新构建/升级前，请先在后台备份数据**
>
> 常规的 `docker compose ... up -d --build` 只重建应用镜像，**不会**动 PostgreSQL 数据卷，数据是安全的。但在以下场景数据可能丢失或不兼容，务必先备份：
>
> - 需要执行 `docker compose ... down -v`（会**删除数据卷、清空所有数据**）；
> - 迁移服务器、更换数据库；
> - 版本升级涉及数据表结构变更。
>
> **备份方式（推荐）**：登录后台 →「数据备份与恢复」→「导出数据」，下载全站数据 JSON 备份；升级完成后在同一页面「导入数据」即可恢复。（该功能不含 `users`/`sessions` 表，登录态与管理员账户不受影响。）
>
> 也可用上面的 `pg_dump` 命令做整库 SQL 级备份。

#### 两步验证（2FA）锁定重置

> 若开启了两步验证后**丢失认证器**（无法生成动态码），会被锁在登录"输动态码"这一步。此时清除该用户的 2FA 后即可用密码登录，再在后台「账户设置 → 两步验证」重新启用。

对数据库执行一句 SQL 即可（**无需安装任何额外依赖**，容器 / psql / 宝塔数据库管理任选其一）：

```bash
# Docker（服务名 postgres；用户名 / 库名换成你 .env 里的 DB_USER / DB_NAME）
docker compose --env-file .env -f docker/docker-compose.yml exec postgres \
  psql -U imqi1 -d imqi1-cms \
  -c "UPDATE users SET totp_enabled = false, totp_secret = NULL;"

# 或直连 psql： psql "<连接串>" -c "UPDATE users SET totp_enabled=false, totp_secret=NULL;"
```

> 只动 `totp_enabled` / `totp_secret` 两列，不影响密码、会话与 `auth_code`（登录态不失效）。单用户博客即清除当前管理员。执行后可用账号 + 密码登录。
>
> `trusted_devices` 表（此前勾选过「信任此设备」的记录）不受影响：重新启用 2FA 后，这些浏览器仍会免输动态码。要么重新启用后到后台「用户」页的设备列表里撤回，要么顺手清掉：`-c "DELETE FROM trusted_devices;"`。
>
> 开发环境 / 有 node_modules 的构建机不想手写 SQL 时，可跑 `bun run reset:2fa`（`scripts/reset-2fa.ts`；bun 原生编译 TS 无需 tsx，依赖 `@prisma/client`、`@prisma/adapter-pg` 均为**根依赖**，非 scripts 专属）。

### 5. 反向代理与 HTTPS

容器仅对外暴露 `${DEPLOY_PORT}`（默认 `3000`，HTTP）。生产环境建议在宿主机再挂一层 Nginx，将 `80/443` 反代到 `127.0.0.1:3000` 并配置 TLS。可用 `scripts/generate-nginx-conf.ts` 生成 Nginx 配置模板。

> ⚠️ **数据持久化与安全**
> - PostgreSQL 数据存于 `pg-data` 卷、带 Redis 版本下 Redis 数据存于 `redis-data` 卷、登录会话（后台设置 `sessionStoreType=file` 时）存于 `sessions-data` 卷。
> - 用户上传目录是 **bind mount**：宿主目录 `UPLOADS_DIR`（默认项目根 `uploads/`，本地文件系统直接可见）挂载到容器内固定路径 `/app/.output/public/uploads`。重建镜像不丢失，上传文件在宿主机即可直接访问/备份。Linux 上若容器内 `node` 用户写不进去（EACCES），需自行 `chown` 该宿主目录。
> - `docker compose down` **不会**删除数据卷；仅 `docker compose down -v` 会清空所有数据，请谨慎使用。
> - 首次 `up -d --build` 会执行 Bun 构建，耗时较长，属正常现象。

## site.config.ts 说明

`site.config.ts` 是全站的**静态配置**文件，被 `nuxt.config.ts`、`app/`（前端）与 `server/`（服务端）三方共同引用。它提供三类值：数据库未初始化时的默认 / 兜底值、构建时需要的常量（CSP、SEO meta、CDN 前缀），以及统一的 SEO 文案。

> ⚠️ 该文件的值在**打包时被内联**进客户端与服务端产物，属于构建时常量，**运行时无法修改**（改动需重新打包）。真正运行时可变的配置由数据库 + `useSiteSettings()` 管理。因此这里只放「基本不变」或「构建期就要确定」的内容。

文件顶部集中定义了一批原始字面量（`_name`、`_url`、`_cdnUrl` 等），下方字段由它们派生，**大多数情况下只需修改这些字面量**即可：

```ts
const _name = "ImQi1";                 // 站点名称
const _url = "https://imqi1.com";      // 站点访问地址
const _cdnUrl = "https://cdn.imqi1.com"; // CDN 根地址（未用 CDN 可与站点同域）
```

主要配置项：

| 区 | 字段 | 说明 |
| --- | --- | --- |
| 站点基础设置 | `site.name` / `site.url` / `site.cdnUrl` / `site.rootDomain` | 站点名、访问地址、CDN 根地址与主域名。 |
| | `site.avatarPath` / `site.ownerName` | 站点头像与站长名。站点图标（SVG）经 `seo.ogImage` 供 og:image 与页头 logo 使用。 |
| 构建 | `build.brotliCompression` | 是否预压缩静态资源（Nuxt 的 `compressPublicAssets`，同时产出 `.br` 与 `.gz`），需 Nginx / CDN 配合发送预压缩文件。 |
| | `build.statsHtml` | 是否生成 vite 体积分析 `stats.html`；默认 `false`，需要排查包体积时临时打开。 |
| | `build.redis` | Redis 连接配置（仅生产构建生效）。裸机部署改这里；Docker 由构建参数覆盖，改这里无效。 |
| 安全 | `security.allowedRefererDomains` | 允许访问 `/api/*` 的 Referer 域名白名单（`/api/mini/*` 除外，走签名鉴权）。 |
| | `security.enableCsp` | 是否启用 CSP（内容安全策略）。 |
| SEO | `seo` | 全站默认的 `description`、`keywords`、`ogImage`、`ogLocale`、`twitterSite`。 |
| | `seo.pages` | 各页面（首页、关于、友链、留言、归档、地图、分类、标签等）的独立 SEO 文案；`category` / `tag` 为函数，按名称 / 描述动态生成。 |
| 页面 | `pages.transition` | 页面过渡动画：`fadeDuration` 时长（ms，也是各页面等待过渡完成再启动元素动画的统一延迟）、`translateY` 位移（px）。 |
| | `pages.homeCustomText` | 首页自定义 HTML 文案。 |
| | `pages.homeLinks` | 首页联系 / 入口图标条（名称、图标、链接或二维码）。 |
| | `pages.aboutLinks` | 关于页「交个朋友」区的外链（邮箱 / 个人网站 / GitHub）。 |
| | `pages.links` | 友链页的博客组织入口（`blogOrganizations`）与本站资料（`profile`，供他人添加友链）。 |
| 功能 | `features.miniApi` / `features.miniComment` | 是否启用小程序服务端 API（`server/api/mini`）和小程序评论；关闭 `miniApi` 后不注册这些路由，关闭 `miniComment` 后小程序不展示评论区且接口拒绝评论请求。 |
| | `features.mobileQr` / `features.miniQr` | 文章页「本文可在【手机】上看」「【小程序】上看」入口开关。 |
| | `features.amap` | 高德地图：`proxy` 生产是否走服务端 nitro 代理路由 `/_AMapService`（开发恒直连）、`entry` 是否展示地图入口胶囊。地图能否加载由运行时判断，key / securityCode 运行时从环境变量读取（不打包进产物），生产代理模式下浏览器不持 key。 |

> 该文件是 CSP、SEO meta、CDN 前缀、Referer 白名单等构建时数据的来源（PWA manifest 不在此列，它是静态文件 `public/manifest.webmanifest`），务必在**打包前**配置好。修改后需重新 `bun run build` 才会生效。

## package.json 内脚本

项目的常用命令都收敛在根目录 `package.json` 的 `scripts` 中，下面按用途分组说明。带 `pre` / `post` 前缀的钩子（`postbuild`、`postinstall`）由 Bun 在对应主命令前后自动执行，一般无需手动调用。

> **运维脚本的独立依赖**：部分脚本（`upload:cos`、`upload:server`、`compress:livephoto` 等）依赖较重的包（`ffmpeg-static` 约 80M、`cos-nodejs-sdk-v5`、`ssh2-sftp-client`、`sharp`、`tsx`）。这些包已从根 `package.json` 移到 `scripts/package.json` 单独管理，**不参与主项目 `bun install` 与 Docker 构建**，以加快日常安装。首次运行这些脚本前，先执行一次 `bun run scripts:install`（即 `bun install --cwd scripts`）安装脚本依赖。脚本中共享的轻量依赖（如 `dotenv`、`bcryptjs`、`ipdb`）仍由根 `node_modules` 提供，无需重复安装——`pg` 也属这一档，所以 `db:init`、`reset:2fa`、`reset:password` 直接用根依赖就能跑，不必先 `scripts:install`。

### 开发与构建

| 命令               | 说明                                                                                                                        |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `bun run dev`      | 启动 Nuxt 开发服务器（默认 [http://localhost:3000](http://localhost:3000)），带热更新。                                     |
| `bun run build`    | 打包生产产物到 `.output/`。构建 hash 在打包时由 `genBuildHash()` 生成，`postbuild` 会把它落盘为 `.output/build-hash.json`、拷贝运行时资源并更新 Service Worker 的 CDN 引用。 |
| `bun run preview`  | 本地预览已打包的生产产物（`nuxt preview`），用于上线前验证 `.output/`。                                                     |
| `bun run generate` | 生成静态站点（`nuxt generate`）。本项目以 SSR 为主，一般用不到。                                                            |
| `bun run serve`    | 启动简易文件服务器（根目录为 `.attachments/`），方便开发期管理附件，不污染 `uploads/`。                                     |

### 数据库与 Prisma

| 命令                      | 说明                                                                                    |
|---------------------------|-----------------------------------------------------------------------------------------|
| `bun run prisma:generate` | 生成 Prisma Client（等价于 `bun prisma generate`）。修改 `schema.prisma` 后需重新执行。 |
| `bun run prisma:studio`   | 打开 Prisma Studio 可视化查看 / 编辑数据库。                                            |
| `bun run db:init`         | 建库（不存在时）+ 把库时区设为 UTC + 执行 `scripts/init-db.sql`，一步完成建表、写入默认设置并插入示例数据；幂等可重复执行。 |
| `bun run reset:password`  | 重置指定用户的登录密码，忘记后台密码时使用。                                            |
| `bun run reset:2fa`       | 清除全部用户的 TOTP 两步验证（丢失认证器被锁在「输动态码」那步时用），执行后可用密码登录。 |

### 部署与运维

| 命令                     | 说明                                                                                          |
|--------------------------|-----------------------------------------------------------------------------------------------|
| `bun run upload:cos`     | 将 `.output/public` 里的构建产物上传到腾讯云 COS 的 `static/<hash>/`（需先 `bun run build`，并配置 `.env` 中的 `COS_*`）。 |
| `bun run upload:server`  | 通过 SFTP 将 `.output/server` 上传到服务器（需配置 `SERVER_*`）；支持 `-- --dry-run` 预览；默认跳过 `node_modules` 与 `runtime-assets/`，加 `--node-modules` 一并上传（首次部署/资源更新时用）。   |
| `bun run export:bundle`  | 从构建好的镜像导出 `.output/public` 到 `./dist/<hash>/`，整个目录上传到 CDN 的 `static/<hash>/` 即可（**Docker 部署 + CDN 的取产物方式**，需先 `up -d --build`）。 |
| `bun run restart:server` | 通过宝塔面板 API 远程重启服务器上的 Node 项目；支持 `-- start` / `-- stop`（需配置 `BT_*`）。 |
| `bun run nginx:generate` | 根据 `.env` 中的 `DEPLOY_*` 变量生成参考 Nginx 配置，填写到宝塔面板 node 管理器中的伪静态中。   |
| `bun run clear:redis`    | 通过宝塔面板 API 远程 **flush 该 Redis 实例的全部库（db 0–15）**。站点的 ISR / 搜索缓存都在 db 0，效果即清空缓存；但同实例上别的库也会被一起清掉。 |

### 辅助工具

| 命令                         | 说明                                                              |
|------------------------------|-------------------------------------------------------------------|
| `bun run scripts:install`    | 安装运维脚本的独立依赖（`scripts/package.json`），运行下方需要重依赖的脚本前执行一次即可。 |
| `bun run check:update`       | 从 npm 检查项目依赖是否有新版本。                                 |
| `bun run get:ip`             | 查询 IP 的地理归属信息（IP 归属地数据库工具），基于纯真IP数据库。 |
| `bun run compress:livephoto` | 压缩实况照片（JPEG + 内嵌 MP4 的合并文件）。                      |
| `bun run tailwindcss:lint`   | 检查 Tailwind 类名（`@apply` 指令、类名冲突、canonical 写法建议）；仓库三项自测之一。 |

### 小程序（`mini/` 子模块）

为省去手动切换目录，根目录预置了一批 `mini:*` 转发脚本，它们本质是 `cd mini && bun run <子命令>`，也可以直接进入 `mini/` 目录执行对应命令。

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

> 小程序端通过 HMAC-SHA256 签名（时间戳 + nonce）调用主站的 `/api/mini/*` 接口，签名密钥由主站的 `MINI_API_SECRET` 与小程序的 `VITE_MINI_API_SECRET` 两处**填写相同的值**保证一致。开发环境（`NODE_ENV=development`）跳过校验；**生产环境未配置密钥时 fail-closed**（`/api/mini/*` 全部返回 401，避免未鉴权放行），所以生产必须配置。

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

微信 / 支付宝端还需在对应的开发者工具中填入自己的 AppId：`src/manifest.json` 里 `mp-weixin.appid` 预置的是作者自己的 AppId，**记得改成你自己的**；`mp-alipay` 段没有该字段，在开发者工具里填即可。同时把主站 API 域名加入平台的 **request 合法域名**。

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

一份更新日志由若干**条目**组成，条目类型定义在 `shared/changelog.ts`：

```ts
type ChangelogEntry = {
  // 合法类别即 CHANGELOG_TYPES，顺序也是后台的展示顺序
  type: "功能" | "优化" | "修复" | "删除" | "设计" | "新增" | "其他";
  value: string; // 支持 markdown
};
```

后台「一键导入」接受两种 JSON 形态（见 `server/api/admin/changelogs/import.post.ts`）：

```ts
// ① 单条记录：直接给条目数组
[{ "type": "功能", "value": "新增 xxx" }]

// ② 多条记录：每个元素含 entries；createTime 可选，用于排序（也可直接给单个 { entries: [...] } 对象）
[
  { "createTime": "2026-06-22", "entries": [{ "type": "修复", "value": "修了什么" }] }
]
```

> ⚠️ `type` 写错**不会报错**：`normalizeChangelogEntries` 会把非法类别静默回退成「其他」。注意类别是**「功能」**，没有「修改」。

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
| Bun 相关命令异常 | 项目要求 Bun ≥ 1.3（`packageManager` 锁定 `bun@1.4.0`），版本过低请升级。 |
| 小程序请求 `/api/mini/*` 返回 401 / 签名校验失败 | 主站 `MINI_API_SECRET` 与小程序 `VITE_MINI_API_SECRET` 必须完全一致；其中一端留空时另一端也必须留空。 |
| Docker 节里的 `psql` / `pg_dump` 命令连不上（报无此用户 / 库） | 命令里的用户名 / 库名要换成 `.env` 里 `DB_USER` / `DB_NAME` 的实际值。`--env-file .env` 只喂给 compose、不进 shell，所以 `"$DB_NAME"` 在没 `export` 时展开成空串——想用变量名先 `set -a; . ./.env; set +a`。详见 [「使用 Docker 部署」](#使用-docker-部署)。 |
| Firefox 下实况照片无法播放 | 多为 HEVC 编码，Firefox 暂不支持，会自动降级为静态图；如需播放需服务端转码。 |
| Docker 构建报 `lockfile had changes, but lockfile is frozen` | 镜像 `oven/bun` 与本地 bun 大版本不一致。本仓库 `package.json` 锁定 `bun@1.4.0`，`docker/Dockerfile*` 的 builder 阶段已统一改为 `oven/bun:1.4`；若你 fork 后改回 1.3.x 会触发此错。 |

## 服务器管理 PostgreSQL 数据库

宝塔面板没有提供 PostgreSQL 数据库的管理器，没有类似 phpMyAdmin 的界面，所以我们需要手动安装，并在宝塔面板中配置入口。

示例机器：Ubuntu 24.04。

在宝塔中安装 Docker，然后在应用搜 “pgadmin”，配置好相关信息，安装完成就可以使用了。

## 参与贡献

欢迎参与！无论是提 Issue、提交代码，还是反馈使用问题，都很有价值。请先看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解环境与约定。

- **查看文档**：[docs.qi1.website](https://docs.qi1.website)——多数部署与使用问题在文档里已有答案。
- **报告 Bug / 提需求**：使用 [Issue 模板](https://github.com/imqi1-github/imqi1-cms/issues/new/choose) 提交，模板已要求确认「问题与本项目相关、文档无对应说明」，**与本项目无关的问题请勿在此提交**（通用浏览器/系统问题、第三方服务问题、个人项目托管问题等，请到对应上游反馈）。
- **提交代码**：从 `master` 拉分支，自测通过（`bunx eslint .` / `bunx nuxi typecheck` / `bun run tailwindcss:lint`）后提 PR。
- **安全相关**：疑似漏洞请**私密**报告（仓库 → Security → Report a vulnerability），别在公开 Issue 披露——见 [SECURITY.md](SECURITY.md)；其中的**已知局限**与**威胁模型与范围**两节列了已知开放口子与既定设计，报告前先过一眼，避免重复报告。

项目采用 [AGPL-3.0](LICENSE) 开源许可。

Copyright (C) 2026 棋 (Qi1) <https://github.com/imqi1-github>
