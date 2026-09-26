# bun mock.module 全进程泄漏 → 集成测试放 test/zz-late/

`bun:test` 的 `mock.module` 一旦注册就**整进程生效且无法撤销**（`mock.restore()` 不还原模块 mock，实测确认），后加载文件的注册会覆盖先加载的，但先注册的 mock 会污染之后**首次 import** 真实模块的所有文件。bun 按路径字典序跑文件（api < middleware < plugins < routes < utils < shared）。

**后果**：在 `test/server/api/` 里 `mock.module("#server/utils/cos"|"safe-fetch"|"rss"|"mail")` 写接口测试，会让 `test/server/utils/` 下测**真实模块**的测试（cos.test、safe-fetch.test、mail.test、rss 相关）拿到假件而全挂（2026-09-26 实测 45 个失败全源于此）。

**约定**：需要 mock server 工具模块的「集成型」测试文件统一放 **`test/zz-late/api/`**（字典序在所有真实模块测试之后、shared 纯函数测试之前，shared 不受影响）。现有 9 个文件覆盖 41 个此前未测的公开/admin 端点（comments.post 全矩阵、links 提交链、附件上传链、data export/import、footprint/blog-network 等）。

相关坑：
- **同文件内 mock 也会替换本文件的真实导入**（2026-09-26 实测：一个文件里先 `await import("#server/utils/qqwry")` 测真实现、再 `mock.module("#server/utils/qqwry", ...)` 测分支，真实现部分全部命中假件→断言走 `if (detail === null)` 兜底分支静默通过、coverage 0%，是 coverage 才暴露的）。→ **测真实现与 mock 它必须拆成两个文件**，真实现文件名排在 mock 文件**之前**（`qqwry.test.ts` / `zz-ip-location.test.ts`）。
- `test/types/nitro-globals.d.ts`（test/tsconfig include 的按需全局声明处）：测试 import 链把用 nitro 专属全局的 server 文件拖进 test 编译图时会报 Cannot find name——缺什么补什么（本次补了 `sendRedirect`/`readFormData`，并给 `useRuntimeConfig` 加了 `amapUseServerProxy?`）。
- sharedFake（`#test/helpers/fake-prisma`）注册按「最后注册者胜」：同模型同方法只能有一份 handler，跨 handler 复用时在 handler 内按 `where` 形态分流（见 public-map 的 comments.findMany、public-home 的 contents.findMany），别注册两份互相覆盖；**跨文件也会互相覆盖**，所以需要假件的文件在 `beforeEach` 里重新注册（见 zz-rss.test.ts 的 `registerFakes()`），否则会被后跑文件的注册抢走。
- `test/real/` 放「要测真实现、不需要 mock」的文件（字典序最早，无污染风险）：captcha（真实 WASM 栅格化）、qqwry（真 ipdb）、prisma（真 PrismaClient + isPrismaNotFoundError）。
- `test/zz-late/zzz/` 放**最后**才能跑的 mock 文件（rss-scheduler：它 mock 掉 `#server/utils/rss`，必须排在 `test/server/utils/zz-rss.test.ts` 之后——注意 `utils` 排在 `plugins` 前但 `zz-late` 在后，故整体移出 plugins 目录）。
- `test/server/utils/zz-rss.test.ts`：需 mock `safe-fetch` 又要排在其真实测试（safe-fetch.test）之后，故用 `zz-` 前缀留在同目录（`u<n<z`）。

## app/composables 测试（Nuxt auto-import 全局桩）

`bun:test` 默认无 Nuxt 编译器、`useState`/`ref`/`watch`/`useNuxtApp`/`useRoute`/`navigateTo`/`$fetch` 都不是全局符号；裸 DOM（`localStorage`/`CSS`/`HTMLElement`）同样缺失。**不能**在 test 文件 inline 给 globalThis 赋值——ESM `import` 全部 hoisted，赋值语句永远在 `import "~/composables/..."` 之后执行，composable 内部调用已经 ReferenceError。

通过 **bunfig.toml `[test] preload` + `Bun.plugin`** 解决：
- `bunfig.toml`：`[test] preload = ["./test/helpers/bun-preload.ts"]`
- `bun-preload.ts`：注册 plugin，`onLoad` 仅匹配 `test/app/composables/*.test.ts`，**首行注入 `import "./setup-composable-globals"`**
- `setup-composable-globals.ts`：用 vue 真 `ref/watch/computed/...` + 自写的 `useState/useNuxtApp/useRoute/$fetch/navigateTo` 装到 globalThis（`writable: true` 让 mock 测试仍能覆盖）

**绝不能上 plugin 改写 `app/composables/*.ts`**：
- 注入 `import.meta.client = true` 会让 tsc/eslint 看到这些行 → 报「Cannot find name 'ref'」/lint 改规则 → 整仓库 typecheck + eslint 全红
- plugin `onLoad` 会拦截 mock.module 链，破坏 vue-sonner 等 mock 的完整性（`useToast` 测试需要 `mock.module("vue-sonner", ...)`）
- 受影响 composable（`useAdminPageSize` 用 `import.meta.client` 守 `localStorage.getItem`）测试断言只能覆盖「client=false 兜底」分支；要测「client=true 读 storage」必须加 happy-dom/jsdom（不在仓库依赖，本轮不动）

**已测**：usePageTitle/useConfirm/useToast/useFadeOutOnNavigate/useLivePhoto(纯函数)/useAdminPageSize(fallback)/useLightbox(不依赖 module state 的部分)。
