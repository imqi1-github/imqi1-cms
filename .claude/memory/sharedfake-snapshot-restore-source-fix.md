---
name: sharedfake-snapshot-restore-source-fix
description: sharedFake.on() 进程级污染的源头治本：bun-preload 全局 beforeEach 拍快照 + afterEach 还原
metadata:
  type: project
---

sharedFake（`#test/helpers/fake-prisma`）的 `on(key, handler)` 调用永久改写进程级 `state`，没有撤销机制；测试 A body 里 `sharedFake.on("users", "update", throwFn)` 会污染测试 B 的 `setSession → prisma.users.update` 抛 uniq。

**治本方案（2026-09-28 落地）**：
1. `fake-prisma.ts` 加 `snapshot()` / `restore(snap)` 两个方法
2. `bun-preload.ts`（已存在 bunfig.toml preload）注册全局：
   - `beforeEach(async)` 用 `setImmediate` 推迟到当前 macrotask 结束后再拍快照（否则 file 级 beforeEach 里的 registerXxxFakes 还没跑完就被拍走，afterEach 还原时会把它们误删）
   - `afterEach` 还原到 perTestSnap

**Why:** 比「每个测试文件自己写 afterEach 调用 registerAuthFakes()」更源头；改动只动 2 个 helper，不污染 100+ 测试文件。

**How to apply:** 任何 `bun:test` 全局 hook 都加在 `test/helpers/bun-preload.ts`。mock.module 的跨文件泄漏问题（memory `bun-mock-module-leak-zz-late-layout`）依然无解——那只得靠把文件挪到 `test/zz-late/` 字典序末尾，或不用 mock.module 改用 sharedFake.on 模式（如本次修的 `admin-cache-clear-handler.test.ts`）。

**配套行为变更**：未注册的 handler 现在返 `null`（原本抛 "未设置"）—— 模拟真实 Prisma 「记录不存在」语义，让缺 registerMetasFakes 的测试不再因「假件未注册」崩，转而由断言形态失败暴露。