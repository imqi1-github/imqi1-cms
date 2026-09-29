---
name: nuxt-imports-alias-is-internal
description: #imports 是 Nuxt 内部 alias（指向 .nuxt/imports/），源码不应该 import 它，应直接用全局 const
metadata:
  type: feedback
---

`#imports` 是 Nuxt 内部 alias（指向 .nuxt/imports/ 目录），composables 由 `.nuxt/types/imports.d.ts` 通过 `declare global { const defineNuxtPlugin: ...; const useState: ...; }` 等暴露成**全局 const**。源码里**不应该**写 `import { defineNuxtPlugin } from "#imports"`，应该直接用全局符号（不写 import）。

**Why**: 源码直接 `import from "#imports"` 在 vue-tsc references 模式下会失败——根 `tsconfig.json` 没 `#imports` paths 定义，TS2307 `Cannot find module '#imports'` 误报。即便路径解析能 fallback，TS7006 `Parameter 'nuxtApp' implicitly has an 'any' type` 仍可能触发（defineNuxtPlugin 拿不到完整 NuxtApp 类型签名）。源码里只用全局 const 是 Nuxt 4 标准模式。`#imports` 只在 Nuxt 生成的代码（如 `.nuxt/pwa-icons-plugin.ts`）里用。

**How to apply**:
- Nuxt composable（`defineNuxtPlugin` / `useState` / `useNuxtApp` / `navigateTo` / `useFetch` 等）在源码里**不写 import**，直接当全局函数用
- `#imports` 仅用于 Nuxt 生成代码
- test 代码若需模拟 composable 行为，用 `#test/helpers/nitro-globals`（运行时桩）+ `test/helpers/test-globals.d.ts`（类型桩），不要 `import from "#imports"`
- 真要给 `#imports` 加 declare module 兜底（如 pwa-icons-plugin.ts 在 root tsconfig 模式下扫不到 paths），放 shared/*.d.ts 用 `declare module "#imports" { ... }` 作 fallback——paths 命中时不走 fallback，app 端类型不受影响（参照 `shared/pwa-icons-internal.d.ts`）
