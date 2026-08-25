---
name: admin-pages-audit-gotchas
description: app/pages/admin 全量审计(2026-08-25)修掉的反复出现坑——csrfToken 空仍发写请求/双击重复提交/列表请求竞态/URL page 负数/useConfirm/type 判定等
metadata:
  type: project
---

`app/pages/admin/` 18 个 Vue 页全量审计（workflow 逐文件 + 对抗核验）后，反复出现的坑（属「症状不指向、lint/typecheck 抓不到」类），2026-08-25 已修：

1. **csrfToken 空仍发写请求**：`csrfToken=ref("")` 只在 onMounted 的 `/api/csrf/token` 成功后赋值；该请求失败则所有 POST/PUT/DELETE 发空 token → 服务端 `validateCsrfToken` 必然 403，用户只看到笼统「xx失败」。修复=各写函数入口 `if(!csrfToken.value){ toast.error('会话已失效，请刷新'); return }`（`contents/edit` 抽 `ensureCsrf()`；其余页内联）。服务端是硬防线，这层纯 UX。
2. **双击/并发重复提交**：add/edit/delete/toggle 无 `submitting/deleting` 守卫 + 按钮无 `:disabled` → 双击发两次 non-idempotent POST/DELETE（建重复友链/订阅/页面、或 delete 二次命中 P2025 报「删除失败」）。修复=`submitting/deleting` ref + `if(x) return` + `finally` 复位 + 按钮 `:disabled`。
3. **列表请求竞态**：fetchContents/fetchComments/fetchPages/loadSubscribes 并发触发（筛/翻页/onMounted）无序号守卫 → 慢旧响应覆盖新数据、loading 被旧请求置 false。修复=`const seq=++fetchSeq` + 写前 `if(seq!==fetchSeq) return` + `finally` 仅最新复位。
4. **URL page 负数/越界未钳制**：`parseInt(route.query.page)||1` 拦不住 `-1`（真值）→ 服务端 skip 为负 → Prisma 抛错/空列表/`第 -1 / X 页`。修复=入口 `page=Math.max(1,...)`。服务端同样要 clamp。
5. **数据关联污染**：`content-categories/[id].get.ts` 的 `contentrelations.findMany` where 缺 `metas:{type:'category'}`（content-tags 有 `type:'tag'`）→ 前端 `selectedCategoryIds` 混入标签 mid → 保存把标签写成 category 关联。修复=服务端对齐加 `metas:{type:'category'}`（根治）。**改 Prisma 关系键/类型过滤务必读 sibling 接口对齐**。
6. **status `||` 吞 0**：`content.status || '已发布'`——status=0(草稿) falsy→显示「已发布」，=1→渲染数字「1」。修复=`status===1?'已发布':'草稿'`。数值布尔别用 `||`。
7. **破坏性确认**：删除/重置/导入一律 `useConfirm()` + 全局 `<ConfirmDialog>`；唯一手写 Dialog 的 settings（reset/import）已换。`subscribes.deleteSubscribe` 曾无确认。
8. **页面/文章判定**：attachments/[id] 曾靠独立 `pages?pageSize=999` 的 pageCidSet 判 type（可失败/截断/吞错→误跳编辑器）。修复=detail GET select 加 `type`，前端读 `content.type===1`。
9. **其它**：`cache` 旅行地图 keyword `map`→`/map`（`*map*` 误伤 `/sitemap`）；`syncRelations` PATCH 用已持久化 `attachment.name` 防带未保存 name；`pages/edit` 命中非 type=1 记录(文章)则拦下跳文章编辑器（防保存把文章转页面）；`users.fetchUser` 失败要错误态+重试（勿固定 spinner）；`bar(set/get)`/`page` 等 NaN/越界钳制。

**验证**：`bunx eslint app/pages/admin` + `bunx nuxi typecheck` exit 0；浏览器登录 admin/123456，仪表盘/links/subscribes/settings/categories/contents/comments/`contents/edit?cid=1` 全 0 报错；`/api/admin/content-categories/1` 只返回 `["category"]`。参见 [[admin-write-catch-swallow-pattern]] [[admin-write-api-csrf-required]] [[audit-skill]]。
