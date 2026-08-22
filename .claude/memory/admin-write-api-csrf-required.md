---
name: admin-write-api-csrf-required
description: 所有 /api/admin/* 写接口必须带 validateCsrfToken;POST/PUT 从 body、DELETE 从 header
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0be5d550-b196-4eed-a665-fd0ecdc9b610
---

所有 `/api/admin/*` 写接口(POST/PUT/DELETE)的 handler 必须调用 `validateCsrfToken(event, token)`。约定来源(token 由前端 caller 决定,后端按方法取):
- POST/PUT:从 body 解构 `csrfToken`,前端 `$fetch` body 里带 `csrfToken: csrfToken.value`
- DELETE:从 `getHeader(event, "x-csrf-token")` 取(避免 token 进 URL 被 referer/日志记录),前端带 `headers: { "x-csrf-token": csrfToken.value }`
- GET 不需要

前端页 `fetchXxx` 里先 `$fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" })` 取 token 存 ref(范式见 `app/pages/admin/categories.vue`、`tags.vue`)。`CsrfResponse` 类型在 `app/types/apis/admin/categories.d.ts`,跨页复用。

**Why:** `server/middleware/referer-check.ts` **不是 CSRF 替代品**——开发环境直接 `return` 跳过(本地裸奔),生产仅校验 Referer 域名(可被子域名/同源绕过),不是项目既定的 double-submit cookie token 模式。CSRF 是各 handler 显式调用,无全局 middleware。

**How to apply:** 新增任何 admin 写接口务必同时带 (1)`getUser` 登录鉴权(401) 和 (2)`validateCsrfToken`——两条独立检查,都易漏。`server/middleware` 仅 mini-auth(只拦 `/api/mini/*`)和 referer-check(开发环境跳过),**无全局 admin 鉴权**,所以每个 handler 必须显式 `getUser`。案例:`tags.post/put/delete` 整体漏 CSRF(2026-07-16 修);`comments/batch-delete.post.ts` 更严重——**连 `getUser` 都漏**,未登录可批量删评论(P0,2026-07-16 修,运行时实测 credentials:omit 200→修复后 401),另 `comments/[id].patch|delete` 漏 CSRF。这两批表明是**系统性遗漏**,建议定期 grep 所有 `server/api/admin/**/*.{post,put,delete,patch}.ts` 核对是否都有 getUser + CSRF。验证范式:devtools `fetch` `credentials:"omit"` 发写请求应 401;带 cookie 但无 token 应 403 "CSRF token 验证失败"。关联 [[public-api-explicit-field-whitelist]]。

**镜像坑——前端次级调用方漏发 token:** CSRF 批量给 handler 加校验后,handler 没变,但**共享同一 handler 的次级调用方**可能仍不发 token → 整功能 403。已知两例(都是 `/api/admin/contents` 共享):(1) `contents/edit.vue` 的 `setTravelContent` 调 `/api/admin/travels/:id` 漏 csrfToken;(2) `pages/edit.vue` 保存(创建+更新页面)调 `/api/admin/contents` body 完全没 csrfToken,onMounted 只 `await $fetch('/api/csrf/token')` 设 cookie 却不存 ref → 页面编辑整体 403 不可用(2026-07-18 修,实测 POST 不带 token→403、带→200)。审查剩余 admin 页(settings/users/index/其它调 contents 或别的 CSRF'd 端点的页)时必查:每个写 `$fetch` 是否都带了 csrfToken(body 或 x-csrf-token header)。另:`server/api/attachments/[id].delete.ts` 原从 `query.csrfToken` 读(token 进 URL/日志),2026-07-18 改 header,4 调用方(attachments index/[id]、contents/edit、pages/edit)同步改。catch-swallow 另见 [[admin-write-catch-swallow-pattern]]。

**2026-07-18 全量排查(grep 所有 admin 页的 DELETE / POST|PUT|PATCH):** 16 个 admin 页逐一核对,命中第 3、4 例,且都在**列表/索引页的删除按钮**——这类页面容易被漏:(3) `index.vue` 仪表盘 deleteContent/deleteComment(DELETE 无 header、整页不 fetch csrf);(4) `pages/index.vue` deletePage(DELETE 无 header)+ batchDelete(POST body 无 csrfToken)、整页不 fetch csrf。两处均按 #1 范式补 ref+fetch+header/body 修复。**经验:DELETE handler 批量改 header 读 token 后,所有 DELETE 调用方(尤其列表页删除/批量删除)都要同步,且页面须有 csrfToken ref 并 fetch /api/csrf/token;判据=页面有写 `$fetch` 但不在 `grep /api/csrf/token` 命中名单里 → 必坏。** Windows 下 grep 会把匹配内容里的 `/` 渲染成 `\`,URL 真伪要以 Read 原始字节为准。
