---
name: pg-driver-adapter-explicit-deps
description: Prisma 7 的 @prisma/adapter-pg 某些 transitive deps 会被 prune/部分上传漏装而生产崩；把必带包显式列进根 dependencies 兜底
metadata:
  type: project
---

`@prisma/adapter-pg` 的 dependencies 里写了 `postgres-array`，lockfile 也有，但生产 `node_modules/@prisma/adapter-pg` 在、`node_modules/postgres-array` 缺 ⇒ 报 `ERR_MODULE_NOT_FOUND: Cannot find package 'postgres-array' imported from .../@prisma/adapter-pg/dist/index.mjs`。

**Why:** Prisma 7 的 driver adapter 切到 ESM 子包后，上游 transitive 解析比旧 PrismaClient 更脆 —— 任何"清理式"运维（`npm prune`、手工清理、上传只挑部分包）都可能漏一个，生产即崩。

**How to apply:**
- 兜底：`bun install --frozen-lockfile --production`（与 Dockerfile 的 `--ignore-scripts` 一致）能补回；防复发则把必带包（`postgres-array`、`postgres-bytea`、`postgres-date`、`postgres-interval`、`pg-types`）**显式列进根 `dependencies`**（当前已列 `postgres-array@3.0.4`）。
- 升级 `@prisma/adapter-pg` / 任何 `@prisma/adapter-*` 后，检查新增的 transitive deps，把生产路径上必带的显式列进根依赖。
