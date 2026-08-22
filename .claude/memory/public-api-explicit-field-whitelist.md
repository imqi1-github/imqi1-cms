---
name: public-api-explicit-field-whitelist
description: "公开接口必须显式白名单下发字段,禁止整条记录/内部字段外泄(用户强原则:前台不漏任何非必要字段)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2eb21d14-ef03-4a8a-bdae-5712db9b693b
---

用户强原则:**前台(公开非鉴权接口)不下发任何非必要字段**——不只是隐私字段(mail/ip/agent/password),连内部状态字段(enabled/isModification/modificationStatus/originalLinkId 等审核标志)也算"泄露",必须去掉。

**Why:** 隐私合规 + 攻击面最小化;整条 Prisma 记录 `...record` 或无 `select` 的 findMany 会把内部字段一起铺出去。

**How to apply:**
- 每个公开接口的 `prisma.*.findMany/findUnique` 都要带 `select` 白名单;或响应节点逐字段显式构造,禁止 `...row` 展开。
- 已修案例:`server/api/comments.get.ts`(mail/ip/agent → 服务端算 avatar+预解析 device 下发)、`server/api/links.get.ts`(整表 → `select {id,name,desc,link,avatar}`)。
- 参考正确范式:`server/api/mini/*.get.ts` 全部显式 select;`server/api/footprint.get.ts`(select 了 ip/mail 但仅内部去重/算头像,输出不含)。
- 头像:服务端 `createHash("md5")` 按 mail 算好 URL 下发,前端不碰邮箱;UA 用服务端 `parseUserAgent` 预解析成 browser/os 图标。
- 校验:build 绿不够,必须启 dev + `curl <接口> | grep` 确认敏感/内部键不在响应里(同 [[prisma-relation-key-rename-trap]] 的运行时验证纪律)。
