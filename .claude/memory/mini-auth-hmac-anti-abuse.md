---
name: mini-auth-hmac-anti-abuse
description: /api/mini/* 的 HMAC 签名是防滥用抬门槛而非强认证(密钥可被反编译提取,有意取舍);生产未配 MINI_API_SECRET 时 fail-closed 401;nonce 防重放是单实例内存
metadata:
  type: security
---

`/api/mini/*` 由 `server/middleware/mini-auth.ts` 做 HMAC-SHA256 签名校验(`server/utils/mini-auth.ts`):`stringToSign = METHOD\nPATH含查询串\ntimestamp\nnonce`,`X-Mini-Timestamp/Nonce/Sign` 三头,时间偏差 ±300s。

**定位(审计勿误报)**:mini 客户端可被反编译、`VITE_MINI_API_SECRET` 理论可提取——**这是抬高调用门槛的防滥用措施,不是不可破解的强认证**(用户有意取舍)。别把「密钥硬编码可提取」当高危漏洞报;同 [[single-user-site-invariant]] 的「语义被摊平是有意的」。

**行为链**:开发环境整段跳过 → CORS 预检(OPTIONS)放行(由 `[...].options.ts` 处理) → **生产未配置 `MINI_API_SECRET` 时 fail-closed 全部 401**(防裸奔,故生产必须配置;.env.example 默认空串)。

**nonce 防重放是模块级内存 Map**(按时间戳 TTL 修剪)——单实例约定,**多副本部署需迁 Redis**(参照 login-rate-limit 的 Redis 优先+内存兜底)。mini 客户端须与主站密钥一致(`VITE_MINI_API_SECRET` = `MINI_API_SECRET`)。

相关:[[auth-session-security-invariants]](同套 randomBytes/常量时间比较纪律)。
