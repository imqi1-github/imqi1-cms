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

## 2026-09-28 第二轮:SSRF/XSS payload matrix 暴露 3 个新 bug

`test/zz-late/api-security/{ssrf,xss}-payload-matrix.test.ts` 跑全量时挂 fail:

### A. SSRF 超长 host(>253)通过当前实现

- **症状**:`http://a×254.example.com/` 没被拒
- **根因**:Node `new URL()` 接受超长 host;`assertPublicHttpUrl` 只查 `hostname === "localhost"` 与 DNS 解析;超长 host DNS mock 返公网 IP 时不被拒
- **修法**:在 URL parse 后 host 长度判定,或对超长 host 直接 reject
- **状态**:`test/zz-late/api-security/ssrf-payload-matrix.test.ts` 中 `URL 解析边角:空 / 无主机 / 双斜杠` 测 fail

### B. XSS:DOMPurify 不剥离 style 属性里 url(javascript:)

- **症状**:`<div style="background:url(javascript:alert(1))">` 保留 javascript: 协议
- **根因**:DOMPurify 默认对 style 属性 url() 不做协议白名单;旧 IE 接受,现代浏览器部分拒绝,但仍属于攻击面
- **修法**:在 sanitizeHtml 后追加 style url() 协议白名单(仅 http/https/data:image)
- **状态**:`test/zz-late/api-security/xss-payload-matrix.test.ts` 中 `⚠️ KNOWN ISSUE:CSS url(javascript:)` 测 fail

### C. XSS:Mutation XSS — `<img alt="<svg onload=...>">` 中 alt 嵌套的 svg 未被净化

- **症状**:`<img src="x" alt="<svg onload=alert(1)>">` 净化后 `<svg onload=alert(1)>` 仍在 alt 字符串里
- **根因**:DOMPurify 把 alt 当属性值(字面);如果下游再次 innerHTML 注入(markdown renderer 二次解析),可能执行
- **修法**:DOMPurify 配置 `WHOLE_DOCUMENT_FRAGMENT_PARSE` + 对属性值二次转义
- **状态**:`test/zz-late/api-security/xss-payload-matrix.test.ts` 中 `⚠️ KNOWN ISSUE:Mutation XSS` 测 fail

## 当前 fail 状态

`bun run test`:**3510 pass / 3 fail**(commit `9e43834` + 新 SSRF/XSS 测试)
- 3 fail 都是 known-issue tracker(SSRF 长 host + XSS CSS url() + XSS Mutation)
- 修复后改 expect 即 PASS

## 2026-09-28 第三轮:A/B/C 全部修复 ✅

| Bug | 修法 | commit |
|---|---|---|
| **A SSRF 超长 host** | `assertPublicHttpUrl` 加 hostname 长度 >253 拒绝 | 此 commit |
| **B XSS style url(javascript:)** | `sanitizeHtml` 后置 `sanitizeStyleAttribute` 扫 style="..." 剥离 url() 中危险协议 | 此 commit |
| **C XSS Mutation alt 嵌套 svg** | `sanitizeHtml` 第二道 sanitize + `escapeAttributesForMutationSafety` 强制属性值里 < > 转实体 | 此 commit |

修后 `bun run test`:**3512 pass / 1 fail**(只剩 SSRF localhost 子域名 known-issue,用户未要求修)
