---
name: single-user-site-invariant
description: 站点始终单人运营：唯一 admin 账号(db:init 种 admin/123456)，users 表无 role 列——因此「任意已登录用户」事实=站主本人，附件删除/归属/预览等权限语义按单用户判定，勿当多用户泄露
metadata: 
  node_type: memory
  type: project
  originSessionId: 3516d828-7163-41ba-9923-6fe96175c5f6
  modified: 2026-08-25T07:54:41.161Z
---

站点是**单人博客**：`db:init` 幂等种子只建 `admin/123456` 一个账号，`prisma.users` **没有 role 列**。所以服务端前端接口里写了 `if (!user) throw 401`（只鉴登录）的地方，其「任意已登录用户」**在事实上等于站主本人**，不是多用户授权漏洞。

**Why**：审计时对几个端点报过「注释说仅管理员删除、代码却只查登录」或「未校验文章归属/已发布」，实际是单用户下语义被摊平——作者预览自己草稿附件/评论区是合法用例，强加 `status:1` 或归属校验反而破坏预览。

**How to apply**：
- 判定权限类问题时先确认是不是单用户端点；单人站下「任意已登录==站主」可接受，**别**为「无 role 作者校验/无 publish 校验」报高危。
- **例外/将来**：若计划加多用户/role 列，须回头重审——附件全局删除权限（`contentattachments.some(owned)`）、订阅/友链公开面、评论归属这些都是真正的授权点。
- 相关：[[imqi1-cms-db]]、[[auth-session-security-invariants]]。

补充决定（2026-08-25 批改）：`server/api/mini/links.get.ts` 公开返回 owner 订阅列表(subscribes) —— **用户已明确确认"公开"，属有意设计**，后续审计勿再当隐私问题上报。`mini/` 是**空 git 子模块**(.gitmodules → gitee imqi1-mini，本机未 checkout)。若日后改主意要收口：删掉该文件的 `subscribes.findMany` 分支(约 32-34/52-62 行)即可。
