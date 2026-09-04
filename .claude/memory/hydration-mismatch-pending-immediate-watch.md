---
name: hydration-mismatch-pending-immediate-watch
description: 文章详情页 hydration node mismatch 首帧 comment↔div，根因是 related-contents 的 watch immediate + import.meta.client 守卫致 SSR/CSR 首帧 loading 态不一致
metadata:
  type: project
---

# 文章详情页 hydration mismatch（首帧 comment↔div）

## 症状
- dev console：`[Vue warn]: Hydration node mismatch: - rendered on server: #comment - expected on client: div`，组件栈锚点 `<[slug] ...>`（文章详情页）。
- **生产 prod 构建只报一句** `console.error Hydration completed but contains mismatches.`，不报具体节点（prod 把 per-node 详情 tree-shake 掉）。所以线上只在控制台看到总览，无法直接看出是哪块。

## 根因（2026-09-02 `cdb045b8` 引入）
`app/pages/content/[category]/[slug].vue` 的 related-contents 区：
```js
watch(() => content.value?.cid, async contentId => {
  if (!import.meta.client || !contentId || !relatedActive) return; // 守卫
  relatedContentsPending.value = true;
  ...
}, { immediate: true });
```
- immediate 在 SSR/CSR setup 各触发一次。**改动前**（无 `import.meta.client` 守卫）SSR 也会置 `relatedContentsPending=true` → SSR 也渲染「加载相关文章...」div → SSR/CSR 首帧**一致**（无 mismatch，只是服务端双发）。
- **改动后**：SSR 被守卫挡回（保持 false → 相关文章区渲染成 `#comment`）；客户端 immediate 仍同步置 true → 首帧渲染该 `<div v-if="relatedContentsPending">`。**SSR comment ↔ CSR div → node mismatch**。
- 修复=让相关文章区首帧 SSR/CSR 都不渲染加载态：watch 去掉 `immediate`，把加载抽成 `loadRelatedContents(contentId)`，在 `onMounted`（仅客户端）触发；首帧相关文章区为 `#comment`/无内容、SSR 一致，onMounted 后 loading→列表动画照旧。

## 排查方法
- **要揪出具体 mismatch 节点必须跑 dev**：`bunx nuxi dev --port <非冲突端口>`，dev 会打印每个 mismatch 的 SSR/CSR 值 + 组件栈；prod 抓不到细节。
- 无 chrome-devtools MCP 时，可用系统 Chrome + 写个小 node 脚本走 **CDP**（Node≥21 原生 `WebSocket`）：`--remote-debugging-port` + `Runtime.enable` + 监听 `Runtime.consoleAPICalled`（`args` 里 `.value`/`.description`）即可抓 Vue warn/error。
- 定位回归用 `git show <commit> -- <file>`，重点看近期是否新增了「`import.meta.client` 守卫」「`immediate: true` 的 watch」这类会让 SSR/CSR 首帧条件分叉的改动。
- 验证通过后 `bunx eslint <file>` + `bunx nuxi typecheck`（根跑；详见 [[lint-typecheck-no-root-script]]）。

## 关联 / 注意
- 与 [[usefetch-route-param-spa-refetch-trap]]（category/tag 页 apiSlug watch）同类：**watch + immediate + import.meta.client 守卫** 是 hydration 首帧不一致的高发点；审计「SSR/CSR 首帧条件是否一致」应优先盯这类。
- 本文（note/1020）二维码/小程序码区（`mobileQr||miniQrShown` 外层 div、hoverQr 弹层）**并非**本 mismatch 根因——该区 SSR/CSR 都按 `hoverQr=null`/`mobileQr 恒 true` 渲染，首帧一致。怀疑方向别只看最近改的组件，要对照 dev 的具体 stack。
