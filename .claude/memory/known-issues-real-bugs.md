---
name: known-issues-real-bugs
description: "集成测试已暴露的真实 bug tracker — 2026-09-28 全部修复,记录修复方式"
metadata:
  type: project
---

## 2026-09-28 全部修复 ✅

集成测试在 `--isolate` 全量跑中暴露的 3 个真实 bug,**同一会话内修复**(`d63a61d` 暴露 → `6960a3a`/`9e43834`/`d63a61d`/`e0a19e1`/`0b35dde` 等多次 commit 修复+配套 test 调整),全量 `3468 pass / 0 fail`。

### 1. comments/[id].patch 状态转换 RMW race ✅ 修复

- **症状**:两个并发 PATCH status 0→1,article.comment_num 应只 +1,实际 +2
- **根因**:`server/api/admin/comments/[id].patch.ts` 事务里 read-then-write 非原子
- **修法**:改用 `tx.comments.updateMany` 加乐观锁(`where status = oldStatus`),count===1 才计数
- **commit**:修复见 `comments/[id].patch.ts` 当前版本
- **测试**:4 用例 pass(`test/real/db/comments-status-concurrent-race.test.ts`)
- **副作用**:旧 mock handler 只注册 `comments.update`,未注册 `updateMany` → 给 `test/server/api/admin/comments.test.ts` 加 `comments.updateMany` 乐观锁 mock
- **框架改动**:`test/helpers/fake-prisma.ts` 给 `updateMany` 加 fallback(`count: 1`),让未专门 mock 的 handler 不被 null 阻塞

### 2. search.get cache stampede ✅ 修复

- **症状**:50 个并发 cold miss → DB contents.findMany 被调 50 次(理想:1)
- **根因**:`server/api/search.get.ts` 缓存读路径无 single-flight 保护
- **修法**:模块级 Promise cache(`inflightSearch` Map),50 并发 cold miss 只发一次 DB,其它 await 同一 promise
- **commit**:修复见 `server/api/search.get.ts` `inflightSearch` Map + 改写 miss 分支
- **测试**:3 用例 pass(`test/zz-late/api/cache-stampede-pressure.test.ts`)
- **关键 invariant**:50 并发 cold miss 时 `dbCallCount === 1`(single-flight 生效)

### 3. admin/cache/clear redis 兜底 ✅ 修复

- **症状**:redis 网络断开时 cache/clear 的 scanAndUnlink 抛 ECONNRESET 直接冒泡(unhandled)
- **根因**:`server/api/admin/cache/clear.post.ts` scanAndUnlink 调用未包 try/catch
- **修法**:scanAndUnlink 内部 try/catch + 返哨兵值 `-1`(区分"没找到"返 0 vs "redis 不可用"返 -1);handler 各 if 分支检查 `-1` 返 `{success: false, matched: -1, message: "Redis 不可用..."}`
- **commit**:修复见 `server/api/admin/cache/clear.post.ts`
- **测试**:3 用例 pass(`test/zz-late/api/redis-disconnect-fallback.test.ts`)+ 调整 2 个旧测试期望(scan 异常从 500 → success:false)
- **兼容性**:旧 `admin-cache-clear-noredis.test.ts`(redis=null 路径)仍 PASS — 走的是"未配置"早返分支,不进 try

## 修复后的回归策略

每次代码改动都要 `bun run test` 跑全量(3468 tests),任一 fail 立即定位:
- `comments/[id].patch` 改动 → 必跑 `comments-status-concurrent-race` + `comments-write` + `comments-patch-*`
- `search.get` 改动 → 必跑 `cache-stampede-pressure` + `search-real-flow`
- `cache/clear` 改动 → 必跑 `redis-disconnect-fallback` + `cache-clear-*` + `cache-clear-noredis`

## 跑测试看 fail 数

`bun run test` 当前预期: **3468 pass / 0 fail**(commit `0b35dde` 之后)

修复记录:
- `d63a61d` 4 个 gap 测试(挂 fail,暴露 bug)
- `6960a3a` bug tracker memory
- 后续 commits 修复 3 个 bug + 配套 test 调整 + `fake-prisma.ts` updateMany fallback
