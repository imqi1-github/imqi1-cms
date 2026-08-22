# imqi1 — Nuxt 4 站点仓库指南

> 面向 Claude/vibe coding 的项目说明。每会话自动加载。踩坑细节见 `.claude/memory/`。

## 一句话
Nuxt 4 前端（`app/`）+ Nitro API（`server/`）+ uni-app 小程序（`mini/`）+ Prisma/MySQL + 高德地图。包管理器 **bun@1.3**。

## 常用命令
- 装依赖 / 初始化：`bun install`（触发 `nuxt prepare`）
- 本地开发：`bun run dev`（app + nitro 同起）
- 构建：`bun run build`（prebuild 生成 hash → nuxt build → postbuild 拷数据/SW）
- 静态预览：`bun run generate` / `preview`，`bun run serve`（本地 file-server）
- 小程序：`bun run mini:dev:h5` / `mini:dev:mp-weixin` / `mini:dev:mp-alipay`
- 数据库：`bun run prisma:generate` / `prisma:studio`；初始化 `bun run db:init`
- 运维：`bun run upload:cos` / `upload:server` / `compress:livephoto` / `clear:redis` / `reset:password`

**⚠️ lint/type-check 根目录没有脚本。** 校验 Nuxt 改动：先 `pwd` 确认在项目根，再 `bunx eslint .` 或 `bunx nuxi typecheck`（根 vue-tsc 不走 .nuxt/tsconfig 会漏报）。小程序校验：`bun run mini:lint` / `mini:type-check`。

## 目录结构
- `app/` — Nuxt 前端：`pages/`（路由）、`components/`、`composables/`、`types/apis`（~ 导入）、`shiki`、`router.options.ts`
- `server/` — Nitro：`api/` + `routes/`、`middleware/`、`plugins/`、`utils/`、`types/apis`（#server 导入）、`lib/`
- `shared/` — 跨 bundle 共享（runtimeConfig、`redis-config.ts`、amap、emoji、city-coords…）。**注意 app 与 nitro 各内联一份 → 模块级单例坑，见记忆**
- `mini/` — uni-app 小程序：`IS_H5` + 运行时 if 分流（`min` 端无 v-html，表情/视频特殊)
- `prisma/`、`server/types` — 数据层
- `scripts/` — 运维脚本（init-db、reset-password、upload-cos、compress-livephoto、generate-nginx-conf）
- `docker/` — **两套显式版本（带/不带 Redis）**,无 COMPOSE_PROFILES;运行 `docker compose --env-file .env -f docker/docker-compose.yml` / `docker/docker-compose.noredis.yml`
- `lib/`、`public/`（素材目录在 `app/assets`；`logs/` 已 gitignored）

## 硬性约定（必须遵守）
1. **公开接口白名单** — 前台任何 `findMany` 必带 `select` 或逐字段构造响应，禁 `...row`。隐私 + 内部审核字段都算泄露。
2. **Admin 写接口必带 CSRF** — `/api/admin/*` POST/PUT/DELETE 走 `validateCsrfToken`（POST/PUT 从 body `csrfToken`，DELETE 从 header `x-csrf-token`）；catch 别吞 400/404。
3. **DB 改动** — 禁用 `migrate dev/reset`（会 reset 丢数据）。schema 变更走 db execute 或 `scripts/` 里幂等 tsx。**库名 `imqi1-nodejs`**（package name 正是它；别误写成**目录名** `nodejs-imqi1`；同实例 imqi1/imqi1-old 是历史库别碰；docker-compose 的 `MYSQL_DATABASE` 默认 `${DB_NAME:-imqi1}`，真值在 .env）。
4. **类型放独立文件** — 前端 `app/types/apis`、服务端 `server/types/apis`，不在 .ts/.vue 内联 interface/type；API 端到端类型用 Nuxt 内置 InternalApi，入参加 zod 局部 `z.infer`。
5. **敏感配置运行时化** — redis/amap key 等走构建期烘焙或 env 注入（`shared/redis-config.ts`），别写死在前端/后端分支里。

## 记忆库（重要，先查再改）
项目踩坑/规范细节按主题存在 **`.claude/memory/`**（git 跟踪：`MEMORY.md` 索引 + 每主题一个 `.md`）。
涉及 Nuxt 双 bundle 单例、AMap zooms/complete、Tiptap link/markdown、mini 端、admin CSRF、auth 回跳 fullPath、公开接口白名单等时，**先读 `.claude/memory/` 对应条目再动手**。

> auto-memory 每会话自动加载的是**用户级镜像**（`~/.claude/projects/A--nodejs-imqi1/memory/`）。`.claude/memory/` 是仓库权威版。改记忆两边同步写。
