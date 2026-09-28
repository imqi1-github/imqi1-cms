---
name: bun-test-isolate-root-fix
description: "bun:test 加 --isolate 根治跨文件 globalThis + mock.module 污染(767 fail → 0),scripts/test.ts 必带"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1f182c31-517f-4d2f-9ec0-e8b8236ee4da
  modified: 2026-09-28T10:17:21.315Z
---

`bun:test` 默认 **`--no-isolate`**：所有 `.test.ts` 共享同一个 `globalThis` + 同一个 module cache + 同一个 process。跨文件副作用全部泄漏：

- `mock.module("...", ...)` 注册**永久生效**(后注册的覆盖前者,但所有 import 拿到的是注册的版本),无法撤销
- `Object.assign(globalThis, ...)` 写到跨文件仍可见
- `globalThis.__xxx` 单例跨文件复用
- 顶层 `await import(...)` 在 bun 启动阶段就跑完,跨文件共享模块缓存

**后果(2026-09-28 实测 767 测试失败 → 0 失败)**:
- "请先登录" 182 次:`auth.global.test.ts` mock `#server/lib/auth` 的 `getUser` 后,后续 admin 测试 `getUser` 全拿 mock 返 null
- "useNuxtApp is not defined" 9 次:composable 测试覆盖了 globalThis.document/window 后没还原
- "document is not defined" 37 次:aplayer 测试覆盖后 `win.close()` 让原 ref 失效
- sharedFake.on() 永久覆盖、`db down` 雪崩、`redis.scan is not a function` 8 次等

**根除方案(必带)**:在 `scripts/test.ts` 给 `bun test` 加 **`--isolate`**:

```ts
const cmd = [
  "bun", "test",
  "--isolate",                    // ← 核心:每个 .test.ts fresh globalThis + fresh module cache
  "--max-concurrency=1",          // 同文件内串行(默认 --max-concurrency=20 会并发污染同文件状态)
  "--path-ignore-patterns", "{mini,node_modules}/**",
  ...pattern, ...args,
];
```

`--isolate` 让每个 .test.ts 跑在独立 worker(globalThis 隔离 + module cache 隔离),`mock.module` 只在当前 worker 生效,`globalThis` 单例不跨 worker 复用。

**Why:** 用户 2026-09-28 验证:加 `--isolate` 一行,无需重排文件、无需 `test/zz-late/` 物理隔离、无需每个测试手写 `beforeEach` 还原,可直接撤销此前 7 个污染修复 commit(8896cfa / 6dc532f / 16cb7ec / c9a44e6 / 015f957 / a615fe7 / 332f208)。

**How to apply:**
- `scripts/test.ts` 是唯一入口,改这一处全仓生效
- `--isolate` **不影响同文件内**测试间共享 globalThis(同 worker),所以同文件内的 snapshot/restore 仍必要(`bun-preload.ts` 的 `__imqiSessionStore` 删除、单例 reset 等)
- 不需要 `--isolate` 才能修的少数小问题(被 `--isolate` 暴露但跟污染无关):
  - `bun-preload.ts` plugin 注入判定 `includes("setup-composable-globals")` → `startsWith('import "..."')`(注释字符串误判)
  - `test/real/db/_smoke.test.ts` 改顺序:先 `resetDb()` 再 `seedContent()`(避 init-db 显式 cid=1 与 SERIAL nextval=1 的 P2002)
  - `test/zz-late/routes/sitemap-xml.test.ts` 补 `informations.findMany` handler(`getSiteSettings` 走 findMany 不是 findUnique)
- 撤销此前 zz-late 物理隔离等绕过式修复后,如果个别测试还依赖"上一个测试留下的 handler",需在该测试 body 显式 `sharedFake.on(...)` 注册

## 副作用:mock throw / Error 构造触发 "Unhandled error between tests"

写「依赖故障」类测试(模拟 SMTP/Prisma 抛错)时遇到**非 fail 但有 unhandled** 报警:`3 pass / 0 fail / 1 error`,exit code 1。根因不在 mock 本身(throw 在 handler 内被 catch,500 正常返回),而是 bun:test 对 **栈敏感的 Error 构造 + 顶层 helper 调用**有嗅探:

- ❌ `Object.assign(new Error("msg"), { code: "..." })`:辅助函数 `makeSmtpError()` 在 test body 外顶层被 import 时,某些场景栈捕获触发 unhandled。
- ❌ 直接 `throw e` 在 test body 顶层(在 `expect()` 之外):会被 bun:test 当作 unhandled。
- ✅ mock factory 内 `throw`(在 handler 里 catch):正常返回 500,不触发 unhandled。
- ✅ 用 `mock.module(..., () => ({ x: async () => { throw e } }))`:工厂返回的对象在调用时才 throw,栈捕获在 handler 调用栈,正常被 handler catch。

**`?fresh` 不靠谱**:bun 文档提的 `?fresh=1` query 在 mock.module 切换后**不一定**让 handler 重新解析,实测仍用旧 binding。**正确是**:handler 顶层 `import { x } from "#server/utils/mail"` 是 live binding,后续 `mock.module` 会让新 import 拿到 mock,但**已缓存的 binding** 也会指向新值(ESM live semantics);不要 `await import("?fresh")` 折腾。

**How to apply:**
- 写 mock throw 测试,**异常在 mock factory 内 `throw`**,不在 test body 顶层 `throw`
- 错误对象在 test body 内 `const e = new Error(...) as Error & { code?: string }; e.code = "...";` 后**立即**塞进 mock factory(不抽 helper 函数)
- handler 内 catch 后用 `console.error` 吞掉原始 error,只返 500 给客户端(`server/api/admin/mail/test.post.ts:46` 范式);测试断言 message 不外泄敏感信息即可