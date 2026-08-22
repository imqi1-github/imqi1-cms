---
name: definepage-meta-page-as-component
description: "definePageMeta 运行时警告 = 页面被当组件 import;要复用 UI/逻辑就抽组件或 composable,不要页面互引"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6d511b35-e9ec-420e-9d46-386191215c0b
---

`404.vue` 曾 `import NotFound from "./[...slug].vue"` 把**页面**当组件用,触发 Nuxt 警告:`definePageMeta() is a compiler-hint helper... passing it at runtime has no effect`。根因:页面被 import 为组件时,definePageMeta 宏不被编译期提取、退化为运行时 no-op。

**修法:** 把 404 UI 抽进 `app/components/NotFound.vue`(黑洞背景+前景文字,`title` prop),页面脚本逻辑抽进 `app/composables/useNotFoundPage.ts`(setResponseStatus+useFadeOutOnNavigate+setPageTitle+usePageSeo)。两页(`404.vue` / `[...slug].vue`)各自保留 `definePageMeta({layout:false})` + `await useNotFoundPage()` + `<NotFound />`,不再页面互引。tag/category/content 的内联 404 态也复用 `<NotFound>`。

**Why:** 页面互引看似 DRY,实则在组件上下文丢失页面宏语义(definePageMeta 仅页面编译期有效)。

**How to apply:** 想在多个页面复用 UI/逻辑,抽 `app/components/*.vue` 或 `app/composables/*.ts`,不要 import 页面当组件。相关:[[sfc-onmounted-await-gotcha]]、[[page-transition-pjax-origin]]。
