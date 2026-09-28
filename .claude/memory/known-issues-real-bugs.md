---
name: known-issues-real-bugs
description: "集成测试已暴露的真实 bug tracker — comments RMW race / cache stampede / cache/clear redis 兜底缺失"
metadata:
  type: project
---

集成测试在 `--isolate` 全量跑中暴露 3 个真实 bug,挂为 fail 持续监控:

## 1. comments/[id].patch 状态转换 RMW race(暴露:`test/real/db/comments-status-concurrent-race.test.ts`)
- **症状**:两个并发 PATCH status 0→1,article.comment_num 应只 +1,实际 +2
- **根因**:`server/api/admin/comments/[id].patch.ts:99-122` 事务里 read-then-write 非原子:
  1. findUnique 取 `oldComment.status`
  2. update `comments.status`
  3. update `contents.comment_num { increment: 1 }`(条件:status 从非 1 变 1)
  两个事务都看到 status=0 → 都 +1
- **修法**(任选):
  - 改原子条件 update:`UPDATE contents SET comment_num = comment_num + 1 WHERE cid=? AND EXISTS (SELECT 1 FROM comments WHERE coid=? AND status=0)`
  - 改乐观锁:`UPDATE contents SET comment_num = comment_num + 1 WHERE cid=? AND comment_num = (旧值)`
  - 改 PG function / trigger
- **状态**:测试 fail(Received: 2, Expected: 1),bug 持续可见;fix 后改 expect 为 +1 即 PASS

## 2. search.get cache stampede(暴露:`test/zz-late/api/cache-stampede-pressure.test.ts`)
- **症状**:50 个并发 cold miss → DB contents.findMany 被调 50 次(理想:1,single-flight)
- **根因**:`server/api/search.get.ts:446-456` 缓存读路径无 single-flight 保护,直接 await redis.get → miss 时 50 个并发都跑 DB 查询
- **修法**:模块级 Promise cache
  ```ts
  const inflight = new Map<string, Promise<unknown>>();
  async function searchWithSingeFlight(q, type) {
    const key = `${q}:${type}`;
    let p = inflight.get(key);
    if (!p) {
      p = doSearch(q, type);
      inflight.set(key, p);
      p.finally(() => inflight.delete(key));
    }
    return p;
  }
  ```
- **状态**:测试 fail(dbCallCount=50),bug 持续可见

## 3. admin/cache/clear redis 兜底缺失(暴露:`test/zz-late/api/redis-disconnect-fallback.test.ts`)
- **症状**:redis 网络断开时 cache/clear 的 scanAndUnlink 抛 ECONNRESET 直接冒泡
- **根因**:`server/api/admin/cache/clear.post.ts:79-90` scanAndUnlink 调用未包 try/catch
- **修法**:在 scanAndUnlink 内部 + 各 if 分支外包 try/catch,失败返 `{success:false, matched:-1, note: "Redis 不可用"}`
- **状态**:测试 fail(handler 抛 unhandled),bug 持续可见
- 注:cache-clear-noredis.test.ts 已覆盖 `redis=null` 路径,redis 连接错误(ECONNRESET/ETIMEDOUT)走 try/catch 兜底但目前缺失

## 跑测试看 fail 数

`bun run test` 当前预期: 3464 pass / **4 fail** (commit `d63a61d`)
- 2 个 fail 来自 comments-status-concurrent-race(`并发 status 1→0` + `三个并发 0→1`)
- 1 个 fail 来自 cache-stampede-pressure(`缓存 cold miss + 50 并发`)
- 1 个 fail 来自 redis-disconnect-fallback(`search.get:redis.get 抛错`)

修复后:把 expect 改为正确值,测试自动 PASS。
