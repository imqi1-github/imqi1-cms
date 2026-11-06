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

**同一污染的另一面：test 文件 import server 的 Nitro 插件/中间件 → 反而把 server 工程自身的类型检查搞挂**（2026-11-06 实测）：test/tsconfig.json 的 `paths` 把 `#server/*` 映射到 `../server/*`，于是 `await import("#server/plugins/cache-control")` 会让该文件**在 test 工程里再编译一遍**；test 工程的 `types: ["bun-types"]` 不含 Nuxt/Nitro 的类型增强 → `nitroApp.hooks.hook("beforeResponse", cb)` 的 cb 形参被推成 `{ body: unknown }`（render:response 的签名）→ **server 工程跟着报一堆 TS2345**（错误信息里看不出是 test 工程引起的，只显示 `server/plugins/xxx.ts`）。
→ **纯逻辑放 `server/utils/`（不依赖 Nitro 类型），test 只 import util**；需要 Nitro 类型的插件/中间件不要被 test 直接 import。
→ 排查手法：把新 test 文件移走再跑 `bunx nuxi typecheck`，若错误消失就是这个原因（不是代码写错）。
