---
name: session-file-store-path-traversal
description: FileSessionStore 的 sessionId 来自客户端 cookie,未净化可路径穿越读/删任意 .json;cleanup() 死代码过期会话泄漏
metadata:
  node_type: memory
  type: security
---

`server/utils/session-store.ts` 的 `FileSessionStore.getFilePath` 直接 `path.join(dir, `${sessionId}.json`)`,而 sessionId 来自客户端 `session` cookie(`auth.ts` `getCookie`)。未净化时 `session=../../package` 会拼出项目根下的 `package.json`,`get()` 读取、`delete()` 删除任意 `.json`(默认 storeType 恰是 `file`)。2026-08-25 已改为 `path.basename(sessionId)`(或加 `/^[A-Za-z0-9_-]{1,64}$/` 白名单,匹配 generateSessionId 的 base64url 字符集)。

另:三处 `cleanup()`(Memory/File/Database)原为死代码——过期 session 只在再次 get() 时懒清,长期运行 Memory Map / `.sessions/` 目录 / MySQL sessions 表无限增长。已改为 `getSessionStore()` 内 TTL 节流(10 分钟)触发 fire-and-forget。关联 [[auth-session-security-invariants]]。
