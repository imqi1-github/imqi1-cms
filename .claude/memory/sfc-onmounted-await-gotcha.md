---
name: sfc-onmounted-await-gotcha
description: "[slug].vue 里 onMounted 内的裸 await 会被 Vue SFC macro 编译器拒绝，需用 async IIFE/async 回调包裹"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6b7f1ee9-6697-46c3-8989-987fe49e84fe
---

在 `app/pages/content/[category]/[slug].vue` 这类 SFC 里，即便 `onMounted(async () => {...})`，**直接在 onMounted 体内写裸 `await`**（如 `const r = await fetch(...)`）会让 `nuxt build` 报错：`[vue/compiler-sfc] Unexpected reserved word 'await'`（来自 `?macro=true` 编译趟）。但 `repoWrappers.forEach(async wrapper => { await ... })` 这种把 await 关进 async 回调的写法却能过。

**Why:** Vue SFC 的 macro 提取趟对 onMounted 这层嵌套里的裸 await 识别有缺陷；await 必须落在"一眼可见的 async 函数体"内（async 箭头/async IIFE）。

**How to apply:** 在这类文件 onMounted 里做异步 DOM 重建时，要么 `arr.forEach(async w => {...})`（照搬 repo/music/waterfall 重建范式），要么用 `(async () => { try { const r = await fetch(...) } catch {} })()` IIFE 包住整段。不要直接在 onMounted 体写裸 await。

另：用 Write 新建 .vue 文件后务必 Grep 检查是否误写了 `</content>`/`</invoke>` 这类工具标签进文件（会让 `nuxt build` 报 `Invalid end tag`）。与 [[page-transition-pjax-origin]] 无关，是构建期独立的坑。
