---
name: hydration-mismatch-pending-immediate-watch
description: hydration 首帧不一致的高发点＝客户端 setup 同步切渲染分支（watch immediate + import.meta.client 守卫）；文章页 related-contents 已改用 useFetch 修掉
metadata:
  type: project
---

# hydration 首帧不一致：SSR/CSR 首帧渲染分支必须一致

## 症状
- dev console：`[Vue warn]: Hydration node mismatch: - rendered on server: #comment - expected on client: div`，组件栈锚点 `<[slug] ...>`（文章详情页 `app/pages/content/[category]/[slug].vue`）。
- **生产 prod 构建只报一句** `console.error Hydration completed but contains mismatches.`，per-node 详情被 tree-shake 掉 ⇒ 线上只能看到总览，看不出是哪块。

## 成因模型（仍是最常见的模式）
「SSR 被 `import.meta.client` 守卫挡回（分支 A）+ 客户端 setup 同步切到分支 B（watch `immediate: true`）」⇒ 首帧 SSR/CSR 渲染的是不同节点 → node mismatch。
文章页曾因此在 related-contents 区报 `comment↔div`（旧实现是 `watch(() => content.value?.cid, ..., { immediate: true })` + `import.meta.client` 守卫）。**当前代码已改为 `useFetch` 拿到 `pending`**（SSR 阶段会 await，pending 值 SSR/CSR 首帧一致）⇒ 该处问题已消除。

⇒ **通用不变式**：SSR 阶段要么 `await` 该数据（让两侧都渲染同一分支），要么让守卫在两侧结果一致；**不要让客户端 setup 同步把渲染分支切掉**。`watch` + `immediate` + `import.meta.client` 守卫 = 首帧不一致的高发点，审计 SSR/CSR 首帧条件时优先盯这类。

## 排查方法
- **要揪出具体 mismatch 节点必须跑 dev**（dev 打印每个节点的 SSR/CSR 值 + 组件栈）；prod 抓不到细节。
- 无 chrome-devtools MCP 时可用系统 Chrome + node 脚本走 CDP（Node≥21 原生 `WebSocket`）：`--remote-debugging-port` + `Runtime.enable` + 监听 `Runtime.consoleAPICalled`。
- 定位回归：`git show <commit> -- <file>`，看近期是否新增「`import.meta.client` 守卫」「`immediate: true` 的 watch」这类让 SSR/CSR 首帧条件分叉的改动。
- 验证：`bunx eslint <file>` + `bunx nuxi typecheck`（根跑，见 [[post-change-lint-chain]]）。

## 注意
- 文章页二维码/小程序码区**不是**这类 mismatch 的根因（该区 SSR/CSR 都按 `hoverQr=null`/`mobileQr 恒 true` 渲染，首帧一致）——怀疑方向别只看最近改的组件，要对照 dev 报的具体 stack。

相关：[[nuxt-page-key-route-path]]
