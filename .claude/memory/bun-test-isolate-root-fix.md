---
name: bun-test-isolate-root-fix
description: "bun:test 加 --isolate 根治跨文件 globalThis + mock.module 污染(767 fail → 0),scripts/test.ts 必带"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1f182c31-517f-4d2f-9ec0-e8b8236ee4da
  modified: 2026-09-28T09:36:42.817Z
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