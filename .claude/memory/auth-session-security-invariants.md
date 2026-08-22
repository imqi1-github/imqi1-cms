---
name: auth-session-security-invariants
description: auth.ts sessionId/authCode 必须用 crypto.randomBytes(非 Math.random);登录响应白名单;login-rate-limit 是内存单实例限流
metadata: 
  node_type: memory
  type: project
  originSessionId: 0be5d550-b196-4eed-a665-fd0ecdc9b610
---

`server/lib/auth.ts` 是会话安全的核心,有几条不能回退的不变式(2026-07-19 登录页审查时统一加固):

1. **`generateSessionId` / `generateAuthCode` 必须用 `crypto.randomBytes(32).toString("base64url")`**,绝不能用 `Math.random()` + `Date.now()`(可预测 → 会话预测/劫持)。参考写法见 `server/utils/csrf.ts` 的 `generateCsrfToken`。base64url 字符集 `[A-Za-z0-9_-]` 对 cookie 值、文件名(FileSessionStore 的 `${sessionId}.json`)、DB 主键都安全(旧的 base64 含 `+/` 对文件名其实是隐患)。

2. **登录响应必须字段白名单**:`setSession` 返回值带 `authCode`(单端登录内部标记),`login.post.ts` 不能直接 `return { user: sessionUser }`,要显式挑 `{uid,name,nickname,mail,avatar}`。同原则见 [[public-api-explicit-field-whitelist]] 和 `verify.get.ts`/`me.get.ts`。

3. **`server/utils/login-rate-limit.ts` 是按 IP 的内存限流器**(窗口 5 次/15 分,锁 15 分)。`login.post.ts` 在 CSRF 之前调 `checkLoginRateLimit`(洪水请求最早被拒),失败调 `recordLoginFailure`,成功调 `resetLoginAttempts`。**局限:进程内存 Map,重启清零,多实例/集群下各实例计数独立**——单用户博客单实例可接受;若将来多实例需改造为复用 `session-store` 后端。新增类似鉴权端点(2FA、改密、找回)应复用此 util。

4. **`login.post.ts` 有占位 bcrypt(dummy hash)**:用户不存在分支也跑一次 `verifyPassword` 拉平时延,避免基于响应快慢的用户名枚举。dummy hash 懒加载只算一次。

5. **「系统是否已初始化可登录用户」(hasUser) 已并入 `/api/auth/verify`**(2026-07-20):原独立的 `server/api/auth/status.get.ts` 探针接口已删除。`verify.get.ts` 未登录分支查 `users.count()` 返回 `hasUser`,已登录分支字面量 `hasUser:true`(免查询、统一 shape);`login.vue` 的 `onMounted` 从 verify 响应取 `hasUser`,不再单独请求。**权衡:hasUser 随这个公开接口暴露给任何调用方**,但公网上线站点"管理员存在"本就是公开事实,换取少一个常驻探测端点更值得。前端类型 `AuthVerifyResponse` 在 `app/types/apis/auth.d.ts`。

6. **登录页 `redirectTo` 只允许站内绝对路径**(`login.vue`):必须 `startsWith('/')` 且不以 `//` 或 `/\` 开头,否则回落 `/admin`,防开放重定向(Nuxt navigateTo 本已挡外链,这是防御性二次清洗)。

相关:[[admin-write-api-csrf-required]]、[[admin-write-catch-swallow-pattern]](login.post.ts 的 try/catch 也用同范式:带 statusCode 的业务错误原样抛)。
