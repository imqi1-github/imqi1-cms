# 第三方服务测试分层:常规测试拦截、冒烟真探活

## 策略(2026-10-01 与用户定稿)
- 单测守**协议面**(请求构造/响应解析/错误映射/降级)——纯 mock,已有 cos-signature/urlGuard/amap-proxy/baidu-audit 覆盖
- 常规 E2E **一律不真调第三方**(不稳定+计费+无法断言+数据污染);上传走 local 存储模式、审核靠降级逻辑、地图断言容器
- 冒烟层 `bun run test:e2e:smoke`(test/e2e/smoke/,E2E_SMOKE=1 才收集):真凭证轻量只读探活,验「配置还活着」——单人站生产挂掉多是欠费/key 过期/配额超,单测和 E2E 都测不出
- config 切换:`playwright.config.ts` 的 E2E_SMOKE → testMatch 只收 smoke/ 或 testIgnore 排除

## 冒烟清单与凭证来源
- COS:GET 桶域名(私有 403=存在;404=配置错),凭证读根 .env COS_BUCKET/COS_REGION
- 高德:GET `/_AMapService/v3/ip` 断言非 503/INVALID_USER_KEY——**代理挂站点根(server/routes 无 /api 前缀)**,写成 /api/_AMapService 必 404;404 分支按 body 含 "disabled" 判 proxy 未启用 skip
- 百度审核:凭证在 **DB informations 表**(baiduApiKey/baiduSecretKey,moderationApiType==="2" 启用),测试进程只能 admin 登录→GET /api/admin/settings 取;登录流程 GET /api/csrf/token→POST /api/auth/login{username,password,csrfToken}(抄 scripts/audit-shared-session.sh)
- SMTP:settings 取 smtpHost/smtpPort → net.connect 读 220 banner(不验密码)
- GitHub:api.github.com/rate_limit(必带 User-Agent)
- 微信小程序:默认 skip(token 受 IP 白名单约束,本机直调误报;E2E_SMOKE_WECHAT=1 才跑)
- 未纳入:meting(用户配置内容源,挂了自动降级 disablePlayer)、头像 CDN(被动拼 URL 无主动调用)、Redis(dev 未配)

## 代价提醒
冒烟会 admin 登录 → **单端登录踢掉现有后台会话**;低频手动跑(发版前)可接受
