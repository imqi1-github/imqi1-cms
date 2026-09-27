---
name: test-coverage-progress-2026-09
description: 单轮把 admin/公共/mimi 集成测试从 1835 推到 2064 条(229 新增),行覆盖率 ~88%
metadata:
  type: project
---

# 2026-09 单轮集成测试推进(2026-09-26 ~27)

起始: 1835 测试 / 6638 expects / 188 文件
结束: 2064 测试 / 6954 expects / 225 文件(+229 测试 / +316 expects / +37 文件)
整体行覆盖 ~88.21%(17085/19369 hit)

## 批次提交(每批 5-10 个新文件,用户强原则)
| 批次 | 新文件数 | 测试数 |
|------|---------|--------|
| ip-location 单元测试 | 1 | 11 |
| 公共/管理 10 文件 | 10 | 69 |
| 错误路径/边界 8 文件 | 8 | 50 |
| admin GET 5 文件 | 5 | 27 |
| admin 边界/审批 4 文件 | 4 | 32 |
| admin 写边界 2 文件 | 2 | 29 |
| admin 端点补测 4+1改 | 4+1 | 27 |
| comments delete 500 | 1 | 1 |

## 关键陷阱(避免反复踩)
- **h3Error.statusCode 是 getter**(非 enumerable): 直接 `throw error` 后 `rejects.toMatchObject({statusCode})` 会失败;用 `rejects.toThrow(/pattern/)`。源内 try/catch 重新抛出时仍失败,因 `error.statusCode` 是 getter 而非 own property。
- **跨文件 sharedFake.on 互相覆盖**: 后注册者胜。helper/auth-fakes.ts 内的 users/informations 注册可能被后跑文件覆盖。**关键**: 在 beforeEach 重新注册依赖项,或 use `sharedFake.on` 时刻意按调用顺序靠后。
- **loginSessionCookie session-store 内存泄漏**: setSession 走真实 MemorySessionStore,但 module 顶层 const 重 evaluate → 每个 test file 新 Map → 跨文件 setSession 写入后 getUser 读不到。**必须**用 `globalThis.__authFlowMemStore` 单例 + mock `#server/utils/session-store`(见 auth-flow.test.ts 模式)。
- **`callAdmin` 缺 CSRF token**: admin 写接口必须有 csrfToken 在 body(POST/PUT)或 header `x-csrf-token`(DELETE);CSRF_COOKIE 必须 cookie 头带上。
- **admin/comments/[id].patch 必填注册 `comments.findMany`** (在事务回调前): tx.comments.findMany 用于判断状态变化是否动计数;不注册会先抛"未设置"而根本走不到 update。
- **admin/contents.batch-delete 必填注册 `contentrelations/contentattachments/comments/contents.findMany+deleteMany`**: 数组形式 `$transaction` 在 admin.ts 注册为「逐 op 返回 count:0」,但 handler 先调 findMany 取附件 cid,**必须**预注册否则提前抛。
- **batch-delete 数组 $transaction 测试**: mock 抛 statusCode error 必须用 `createError({statusCode})`(H3Error) 而非 `Object.assign(new Error(), {statusCode})`,因为后者 `"statusCode" in error` 也为 true 但 h3 catch 链识别行为不同。
- **source 内容字段类型**: sharedFake 注入 metadata 字段必须是 **object**(Prisma Json 字段反序列化后),不能用 JSON string,否则 normalizeAttachmentMetadata 默认 size=0。
- **registerMetasFakes 默认 1 个 category**: 「至少保留一个分类」/「slug 已被其他分类占用」等守卫测必须传 seed 含 ≥2 categories。

## 已覆盖到 100% 的端点(代表性)
- admin/categories.get / admin/tags.get / admin/subscribes.get / admin/popular-contents.get / admin/recent-comments.get / admin/recent-contents.get
- admin/detailed-stats.get / admin/system-info.get / admin/stats.get / admin/settings.get
- admin/contents.get / admin/contents/[cid].get
- public/mini/archive / mini/categories / mini/changelogs / mini/latest-contents / mini/links / mini/messages-config / mini/repo / mini/travels / mini/category-contents / mini/content-detail
- public/comments.get / public/comments.post / public/random-content / public/sitemap / public/tag-contents / public/recent-comments / public/subscribes
- public/csrf.token、public/check-link、public/qr、public/qrcode、public/heatmap、public/captcha、public/meting、public/mini/cors、public/mini/music、public/mini/comments
- public/links.post / public/links/patch(友链修改)
- mini/utils (149 个)

## 仍偏低(主要是 function % 66.67%,分支/行已 100%)
- admin/categories.create.post / admin/tags.post / admin/changelogs.post / admin/links.post / admin/links/[id].delete / admin/links/[id].patch 等
- 原因: 源文件内部 helper 函数/守卫函数,不算独立端点函数,但 bun:test 按函数计 %。无法通过测试覆盖提升。