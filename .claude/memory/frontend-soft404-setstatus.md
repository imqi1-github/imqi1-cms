---
name: frontend-soft404-setstatus
description: "前台动态路由页(category/tag/content)not-found 必须 setResponseStatus(404),否则 SSR 返 200 soft-404"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0be5d550-b196-4eed-a665-fd0ecdc9b610
---

前台 `category/[slug]`、`tag/[slug]`、`content/[category]/[slug]` 这些动态路由页,数据用 `useFetch` 拉,后端 API 对不存在资源已正确抛 404。但 `useFetch` 收到 404 只把 `error` ref 置位、`data` 留 null,**不会**让页面 setup 抛错;页面靠 `isNotFound = !pending && (!data || error)` 计算属性渲染内联 `<NotFound>` 组件——页面组件照常渲染成功,SSR 就返 **HTTP 200**,形成 soft-404(搜索引擎当有效页索引、GSC/死链工具看不到 404)。

**修法:** 在每页 `isNotFound` 计算属性之后加:
```ts
if (import.meta.server) {
  const event = useRequestEvent();
  if (isNotFound.value) setResponseStatus(event, 404);
}
```
保留友好内联 UI(分类/标签有具体文案),只把状态码改对。`useRequestEvent`/`setResponseStatus` 都是 Nuxt 自动导入,无需手写 import。2026-07-19 已修这 3 页。

**Why:** 这是 useFetch + 内联 NotFound 模式的固有缺口,任何新增动态路由页(如 travels/[id]、links 详情)若沿用此模式都会重蹈。
**How to apply:** 新增/审查前台动态路由页时,必查 not-found 分支是否设了 404 状态;curl 看 HTTP 状态而非只看 UI。

**附带坑(仅 content 页):** `seoMeta` computed 若在 `!content.value` 时 `return {}`,文档 `<title>` 会缺失(not-found 时整页无标题)。应 `return { title: pageTitle.value }`,pageTitle 由 watch 维护成"页面未找到 - 站名"。相关:[[public-api-explicit-field-whitelist]]。
