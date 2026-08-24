---
name: nuxt-ssr-api-bundle-singleton-memory-session
description: Nuxt server utils 模块级单例被 app/nitro 两个 bundle 各内联一份，memory session 跨 bundle 互不可见致 /admin 每次整页进入跳登录
metadata: 
  node_type: memory
  type: project
  originSessionId: 047a543a-76b1-4011-87ab-0fdb18269fef
---

Docker 部署（sessionStoreType=memory）下，每次整页进入 /admin 先 302 跳 /login?to=/admin，login 页 verify 又 valid 自动跳回；dev 无此问题，与容器重启无关。

**Why:** Nuxt 会把同时被 app 层（页面中间件）与 nitro 层（API handler）引用的 server util 分别内联进 **app bundle** 和 **nitro bundle**。`server/utils/session-store.ts` 的模块级单例 `currentStore`（getSessionStore 缓存）因此存在**两份独立实例**。memory store 是纯内存单例 → 登录（API）写进 nitro 那份，SSR 中间件（app 份）读不到 → 302；login 页 verify（API）读得到 → 自动跳回。file/database store 走文件系统/MySQL 天然跨 bundle 共享，故**只有 memory 受影响**。dev 用 file（init-db.ts 不设 sessionStoreType → 默认 file），docker 用 init-db.sql 显式 `('sessionStoreType','memory')` → 只有 docker 中招。

**How to apply:**
- 排查：curl 登录拿 cookie 后对比 `curl -i /admin`（302）与 `curl /api/auth/verify`（valid）即暴露；302 响应无 Set-Cookie 删除头 = store.get 返回 null（非 authCode 分支）
- 修复范式：进程内共享单例挂 `globalThis`（`globalStore.__imqiSessionStore`），node-server preset 单进程跨模块图共享；多进程 cluster 时 globalThis 仍不共享，需 file/database
- 写 Nuxt server util 若含模块级可变状态且可能被 app+nitro 同时引用，一律 globalThis 或共享存储，别用模块级 `let`
- 相关：[[auth-session-security-invariants]]、[[imqi1-cms-db-imqi1-cms]]
