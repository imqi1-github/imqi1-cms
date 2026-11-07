---
name: auth-session-security-invariants
description: auth.ts 会话安全不变式：randomBytes(base64url) 生成会话标识、登录响应字段白名单、登录限流 Redis 优先+内存兜底、hasUser 并入 /api/auth/verify、redirectTo 正则白名单
metadata:
  type: project
---

`server/lib/auth.ts` 与登录链路的不可回退不变式：

1. **`generateSessionId` / `generateAuthCode` 必须用 `crypto.randomBytes(32).toString("base64url")`**，绝不能用 `Math.random()` + `Date.now()`（可预测 → 会话预测/劫持）。参考 `server/utils/csrf.ts` 的 `generateCsrfToken`。base64url 字符集 `[A-Za-z0-9_-]` 对 cookie 值、文件名（FileSessionStore 的 `${sessionId}.json`）、DB 主键都安全（旧的 base64 含 `+/` 对文件名是隐患）。

2. **登录响应必须字段白名单**：`setSession` 返回值带 `authCode`（单端登录内部标记），`login.post.ts` 不能直接 `return { user: sessionUser }`，要显式挑 `{uid,name,nickname,mail,avatar}`。同原则见 [[public-api-explicit-field-whitelist]]、`verify.get.ts`/`me.get.ts`。

3. **`server/utils/login-rate-limit.ts` 是按 IP 的限流器，Redis 优先、内存兜底**（窗口 5 次/15 分，锁 15 分）。有 Redis 时用 `INCR`+`EXPIRE` 持久计数（跨重启、多实例共享）；Redis 未配置或抛异常才回落进程内存 Map（重启清零、单实例），异常被 try/catch 兜住**不阻断登录**。`login.post.ts` 在 CSRF 之前调 `checkLoginRateLimit`（洪水请求最早被拒），失败调 `recordLoginFailure`，成功调 `resetLoginAttempts`；判定是否要「自适应验证码」用 `hasRecentFailures`。新增鉴权端点（2FA、改密、找回）复用此 util。

4. **`login.post.ts` 有占位 bcrypt（dummy hash）**：用户不存在分支也跑一次 `verifyPassword` 拉平时延，避免基于响应快慢的用户名枚举；dummy hash 懒加载只算一次。

5. **「系统是否已初始化可登录用户」（hasUser）在 `/api/auth/verify` 的响应里**（无独立探针接口）。`verify.get.ts` 未登录分支查 `users.count()` 返回 `hasUser`，已登录分支字面量 `hasUser:true`（免查询、统一 shape）；`login.vue` 的 `onMounted` 从 verify 响应取 `hasUser`。权衡：hasUser 随这个公开接口暴露，但「管理员存在」本就是公开事实，换少一个常驻探测端点更值得。前端类型 `AuthVerifyResponse` 在 `app/types/apis/auth.d.ts`。

6. **登录页 `redirectTo` 只允许站内绝对路径**（`login.vue`）：条件为**正则白名单** `/^\/[a-zA-Z0-9/?#&=_%.\-:@~]+$/` **且** `!to.startsWith('//')` **且** `!to.includes('\\')`，否则回落 `/admin`。白名单为拒控制字符（`%00` 等）、空白、反斜杠这类**浏览器规范化差异绕过**（`/\evil.com`、含 `\n\t` 的 payload）；`//` 与 `\` 两条是双保险。Nuxt 的 navigateTo 本已挡外链，这是防御性二次清洗。

相关：[[admin-write-api-csrf-required]]、[[admin-write-catch-swallow-pattern]]（login.post.ts 的 try/catch 同范式：带 statusCode 的业务错误原样抛）、[[redis-build-baked-docker-ondemand]]
