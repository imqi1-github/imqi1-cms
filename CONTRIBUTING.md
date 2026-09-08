# 参与贡献

欢迎来到 **ImQi1 CMS**！感谢有意做出贡献。这是一套个人博客 + 内容管理系统（Nuxt 4 + Prisma + PostgreSQL），站点 [imqi1.com](https://imqi1.com) 的完整源码。

> 在动手前，建议先读一遍本指南，特别是「校验」与「硬性约定」两节——它们与本仓库的既有架构和安全性直接相关。

## 新手如何开始

1. **提 Issue 先沟通**：功能/改动较大时，先开 Issue 说明需求，避免返工。
2. **认领任务**：若已有 Issue，留言告知你在处理。
3. **分支 + PR**：从 `master` 拉分支，完成自测后提 PR。

## 环境准备

- [bun ≥ 1.4](https://bun.sh)（包管理用 `bun`，`package.json` 的 `packageManager` 已钉死 `bun@1.4.0`）
- Node（交由 bun 管理）
- PostgreSQL（本地或 Docker）
- 克隆时初始化小程序子模块：
  ```bash
  git submodule update --init --recursive
  ```

## 快速开始

```bash
bun install            # 安装依赖（postinstall 会触发 `nuxt prepare`）
bun run dev            # 启动 Nuxt app + Nitro API
bun run prisma:generate
bun run db:init        # 初始化数据库（幂等，默认账号 admin/123456）
```

## 校验（每次改动后必须，提交前再跑一遍）

> 项目根没有封装 lint/type-check 脚本，直接 `bunx`。CWD 务必在根目录（曾因残留在 mini/ 而验错项目）。

```bash
bunx eslint .          # ESLint（flat config，error 驱动，刻意不降级为 warn）
bunx nuxi typecheck    # Nuxt 类型检查（根 vue-tsc 不走 .nuxt/tsconfig 会漏报）
bun run tailwindcss:lint
```

小程序端改动（`mini/`）用：

```bash
bun run mini:lint
bun run mini:type-check
```

## 硬性约定（务必遵守）

这些是本仓库反复踩出来的安全/工程底线，评审 PR 时会重点核对这些点：

1. **公开接口字段白名单**：前台任何 `findMany` 必须带 `select` 或逐字段构造响应，**禁 `...row`**——隐私与内部审核字段都算泄露。
2. **Admin 写接口必须带 CSRF**：`/api/admin/*` 的 POST/PUT/DELETE 走 `validateCsrfToken`（POST/PUT 从 body `csrfToken`，DELETE 从 header `x-csrf-token`）。
3. **DB 改动**：**禁用 `migrate dev/reset`**（会 reset 丢数据）。schema 变更走 `db execute` 或 `scripts/` 里的幂等 tsx；库名 `imqi1-cms`。
4. **类型放独立文件**：前端 `app/types/apis`、服务端 `server/types/apis`，不在 `.ts/.vue` 内联 `interface/type`；API 端到端类型用 Nuxt 内置 `InternalApi`，入参加 zod 局部 `z.infer`。
5. **敏感配置运行时化**：Redis / 高德 / COS 等密钥走构建期烘焙或 env 注入（`shared/redis-config.ts`），**别写死**。
6. **会话与令牌**：`sessionId`/`authCode` 等必须用 `crypto.randomBytes`（非 `Math.random`，否则可预测）。
7. **公开 URL**：生产域名如需替换，改 `site.config.ts`；提交前确认没有把个人隐私或内部主机信息一并带入。

### 改代码前先查踩坑库

涉及 Nuxt 双 bundle 单例、AMap、Tiptap、mini 端、admin CSRF、auth 回跳等主题时，先看 `.claude/memory/` 对应条目再动手——那是本仓库踩坑与规范的沉淀。

### 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` / `fix:` / `style:` / `docs:` / `chore:` 等），用中文描述。代码注释保持简短，只写「为什么」或非显而易见的取舍。

## 目录速览

- `app/` — Nuxt 前端（页面、组件、composables、类型、shiki）
- `server/` — Nitro API 与路由、middleware、plugins、utils、lib
- `shared/` — 跨 bundle 共享（runtimeConfig、redis-config、amap…）
- `mini/` — uni-app 小程序端（git 子模块）
- `prisma/` / `server/types` — 数据层
- `scripts/` — 运维脚本（重依赖在 `scripts/package.json`）
- `.claude/memory/` — 仓库踩坑/规范记忆（git 跟踪，改记忆以它为准）
