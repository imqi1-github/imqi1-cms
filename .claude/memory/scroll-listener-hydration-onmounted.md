---
name: scroll-listener-hydration-onmounted
description: 客户端滚动监听读 window.scrollY 写响应式状态时，首次执行必须延后到 onMounted，否则 scroll restoration 下触发 hydration mismatch
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 130b0de3-5449-4c50-937e-fa5e6fe1627e
---

读 `window.scrollY` 并据此写响应式状态（如 `isScrolled`、滚动进度、hero 缩放）的滚动监听，其**首次同步执行**必须放在 `onMounted`（水合后），不能在 `setup` / composable 注册阶段同步执行。

**Why:** SSR 渲染时 `window` 不存在，这类状态恒为初始值（如 `isScrolled=false`）。若 composable 在 `setup` 阶段同步读 `window.scrollY` 并赋值，浏览器 scroll restoration 时首帧 `scrollY>0`，客户端首帧就渲染出 `isScrolled=true` 的 class（如 `bg-white/75 …`），与服务端渲染的初始变体不一致 → `Hydration class mismatch`。`onMounted` 在水合完成后才跑，赋值变成水合后的响应式更新，不构成不一致。

**How to apply:** 封装共享 scroll 调度 composable（如 [[useScrollRaf]] / index.vue 的 rAF tick）时，`addEventListener` 与订阅者注册可在 setup 同步做（不执行回调），但**首次回调**包进 `onMounted(() => cb(window.scrollY, innerHeight))`。`index.vue` 原代码已是此模式（`handleScroll()` 在 onMounted 里），迁移时勿破坏时机。等价于「客户端首帧用 ref 初始值与服务端对齐」的通用原则。
