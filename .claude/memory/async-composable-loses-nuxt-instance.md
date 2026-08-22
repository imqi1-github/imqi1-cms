---
name: async-composable-loses-nuxt-instance
description: "async composable 内部 await 之后再调 useNuxtApp 依赖的 composable 会丢实例报错;返回 Promise 给页面顶层 await,或把同步 composable 调用挪到 await 之前"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6d511b35-e9ec-420e-9d46-386191215c0b
---

`useNotFoundPage` 曾是 `export async function`，体内 `await useFadeOutOnNavigate()` 之后再调 `usePageTitle()`/`usePageSeo()`，运行时报 "A composable that requires access to the Nuxt instance was called outside of a plugin.../setup function"。

**Why:** 顶层 await 之所以安全，是 Nuxt 对 `<script setup>` 的编译期 transform 跨 await 恢复 Nuxt 实例；普通 async composable 不享受这个 transform，内部 await 跨微任务边界后实例丢失（即便 await 的是 Promise.resolve()）。

**How to apply:** 把页面 async 逻辑抽进 composable 时，二选一：
1. composable 不自行 await——同步部分（所有 use*/set* 调用）在 setup 同步上下文执行，把挂起 Promise `return` 出去，由页面 `<script setup>` 顶层 `await useXxxPage()`（那里上下文恢复由 Nuxt 负责）。`useNotFoundPage` 即用此法。
2. 若必须 async，把所有 Nuxt composable 调用挪到 await **之前**，await 留最后一行（其后别再调 use*）。

抽 composable 后 lint/type-check/build 全过也查不出此错——必须运行时才暴露。相关：[[page-transition-pjax-origin]]、[[sfc-onmounted-await-gotcha]]、[[definepage-meta-page-as-component]]。
