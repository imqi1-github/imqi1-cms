---
name: test-globals-d-ts-no-undefined
description: test/helpers/test-globals.d.ts 用 declare global 扩展 globalThis 上 Nuxt 自动注入的实例属性类型，声明必须非可选（不要 | undefined），否则会全局污染 app 端触发 TS18048
metadata:
  type: feedback
---

`test/helpers/test-globals.d.ts` 通过 `declare global { var x: T }` 给 globalThis 扩展 Nuxt 运行时注入的属性类型（如 `$fetch: $Fetch`），让 test 里 `typeof globalThis.$fetch` 能解析、`(globalThis as { $fetch?: typeof globalThis.$fetch }).$fetch = mock` 不再报 TS2339/TS2352。

**核心规则**：声明必须**非可选**（`var $fetch: $Fetch`），**绝不**写 `var $fetch: $Fetch | undefined`。

**Why**: vue-tsc references 模式下 5 个 tsconfig（app/server/shared/node/test）共享全局符号表；test 里的 `declare global` 会污染其他 4 个 tsconfig 的全局上下文。实测：把声明写成 `$fetch | undefined` 时，app 端 vue-tsc 推断 `globalThis.$fetch` 可选，触发 TS18048 `'$fetch' is possibly 'undefined'` 误报（一次跑出 30+ 个 app/ 文件报错）。非可选声明匹配 Nuxt 运行时真实语义（$fetch 运行时必有），app 端推断正常。

**How to apply**:
- 给 globalThis 加属性时：`declare global { var x: T }`（非可选）+ 文件末尾 `export {}` 让文件成 module
- 不要写 `| undefined`，即便属性在某些环境"可能"不存在
- 无类型 npm 包的 declare module 参照 `shared/bcryptjs.d.ts` / `shared/meting-core.d.ts` / `shared/markdown-it-container.d.ts` 放 shared/ 下（shared/**/*.d.ts 被 .nuxt/tsconfig.app.json 显式 include）
