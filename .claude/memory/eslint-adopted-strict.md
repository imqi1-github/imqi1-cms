---
name: eslint-adopted-strict
description: 项目已用 @nuxt/eslint（flat config + stylistic），存量严格模式，别放松规则
metadata: 
  node_type: memory
  type: project
  originSessionId: 39bc1142-e18c-48f3-bde8-84b41a60d011
---

2026-06-27 给项目加了 ESLint：`@nuxt/eslint@1.16` 模块 + `eslint@10` flat config（`eslint.config.mjs` 用 `withNuxt`，`.nuxt/eslint.config.mjs` 自动生成）。Nuxt 4 用 ESLint Stylistic 取代 Prettier，**未装 Prettier**。**⚠️ 根 package.json 没有 `lint`/`lint:fix` 脚本**，校验用 `bunx eslint .`（小程序 `bun run mini:lint`）。风格默认：无分号、单引号、Allman 风格 catch 等（由 `@nuxt/eslint` 的 stylistic 预设决定，非 `eslint.config.mjs` 里显式的 `stylistic:true`——该文件并无此键）。

首次 `--fix` 已把 26k 问题压到 583（572 错 + 11 警），后经多轮死代码/`any` 清理，**2026-07-19 复验 `bunx eslint .` 已 exit 0（零残留）**。**刻意保持严格模式**——**不要为求 lint 通过把规则降级为 warn**（尤其 `no-explicit-any`，与 [[api-types-nitro-internal]] 的降 any 方向一致）；历史残留分布（`no-explicit-any`/`no-unused-vars`/`vue/no-v-html`/`vue/no-mutating-props`）现已清零，新增代码须维持 exit 0，别回退引入新 `any`/未用变量/v-html。

**How to apply:** 写新代码须过 `bunx eslint .`；改存量 `any` 时优先用真实类型/zod，而非加 `// eslint-disable`。`eslint.config.mjs` 的 `ignores` 实际是 `["scripts","node_modules","mini"]`（非 `.output/.nuxt/dist/.data`）。
