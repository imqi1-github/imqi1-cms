---
name: nuxt-page-key-route-path
description: 分类/标签 [slug].vue 顶层 await useFetch → 异步 setup → NuxtPage Suspense 每次导航重挂载（非复用）；勿加 :key；重挂载页里任何「同实例响应 route.params」的 watch 都该删，否则 data 清空致 menu 图标居中到屏幕中央 + 文章页 404 误请求
metadata:
  type: project
---

**`pages/category/[slug].vue` / `tag/[slug].vue` 切 `/category/A → /category/B` 是重挂载，不是 Vue Router 复用。** 原因：该页 setup 顶层有 `await useFetch(...)` → 异步 setup → `<NuxtPage>` 的 **Suspense 每次导航都重挂载该异步页**（重跑 setup + await）。证据：`onMounted` 每次切换都触发、旧 `.articles-grid` 元素 `isConnected=false`（被移除而非 patch）；`onBeforeRouteUpdate` 因此**不触发**（每次是新实例）。

**渐出/渐入机制（重挂载下）**：`router.beforeEach` 启动渐出（`mainOpacity=0`）→ 旧页被 Suspense 挂住、随 opacity 渐出 → 新页 `await useFetch` resolve → Suspense 换上新页 → `page:finish` 补满剩余时长 → `mainOpacity 0→1` 渐入（内容切换发生在 opacity≈0 处）。

**❌ 勿加 `<NuxtPage :key>` / `definePageMeta({key})`**：会破坏 Suspense 边界，旧页不再被挂住 → 无渐出。保持无 key。

**Option A 那套（pageDataReady provide/inject + viewData/stableData + onBeforeRouteUpdate/Leave）是冗余死代码**：因重挂载，`onBeforeRouteUpdate` 不触发 → `pageDataReady` 恒 true；`viewData` 在重挂载下就等于 `data`。未来若确认无复用路径可清掉，**勿据此再建类似等数据信号**。

## apiSlug 必须「只初始化、不 watch」

`category/[slug].vue` / `tag/[slug].vue` 里 `slug = computed(() => route.params.slug)`，useFetch 的 URL getter 读 `apiSlug`。

**陷阱**：Nuxt useFetch **自动追踪 URL getter 里读到的响应式依赖**。SPA 从列表页 `/category/note` → 文章页 `/content/note/1012` 时 `route.params.slug` 变成文章 slug，而**旧列表页组件在页面过渡卸载前仍存活** → useFetch 自动用文章 slug 重请求 `/api/category/1012/contents` → 后端找不到 type=category 的 meta → **404 噪音**（线上表现：`GET /api/category/1018/contents 404`）。标签页同理。

**修法**：`apiSlug` 改为**只 `ref(slug.value)` 初始化、删 `watch(slug)`**，并删 `watch(() => route.params.slug)`（原「切分类重触发动画」在重挂载下靠新实例 `onMounted→triggerEntryFadeIn`，无需旧实例响应）；useFetch 的 `watch:[page, apiSlug]` 可保留（apiSlug 永不变，等价 `[page]`）。

**旧 watch 在重挂载下是死代码且有害**：导航瞬间旧实例仍被 Suspense 挂住，watch 同步 apiSlug → useFetch 重请求 → **data 被清空** → `contents=[]` → `articles-grid`（`v-if contents.length>0 && !showSkeleton`）与分页被**移除（不占位）** → 根容器 `flex flex-col justify-center items-center` 把孤立的 `<header>`（含 `ri:menu-line`/`ri:hashtag` 图标）瞬间**居中到屏幕中央**，恰逢渐出 → 用户看到居中的 menu 图标淡出。`watch(route.params.slug)` 里 `page.value=1` 同样触发重请求，一并删。

**结论：重挂载页里任何「同实例响应 route.params 变化」的 watch 都该删，新实例 onMounted 自会处理。**

## 排查 SPA 导航类问题的方法

用 `document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/category/x')` 触发**真 SPA 导航**（`history.pushState + dispatchEvent(popstate)` **不可靠**——Vue Router 不响应，只换 URL 不换组件）；再用 8ms `setInterval` 采样 `#main` opacity / root.children / header rect。

## 文章列表「瞬间下跳」

每次重挂载，新实例 `hasPlayedEntryFade=false` → `onMounted→triggerEntryFadeIn` 重放 `translate-y-8→translate-y-0` 的 0.6s 上滑（`.fade-in-element,.entry-fade-element { transition: opacity .6s, transform .6s }` + `.translate-y-8{transform:translateY(2rem)}`）= 用户看到的下偏再滑回。

**当前状态：`hasPlayedEntryFade` 是实例级**（`category/[slug].vue`、`tag/[slug].vue` 各有一份 `ref(false)`），每次导航重挂载重置 ⇒ 切分类**仍会重播**上滑。「仅首播 + 后续原位」方案**未落地**（`useCategoryEntrySlide` / `revealFadeElementsInPlace` 在代码里不存在）。要去掉重播的改法：

- 模块级 `let entrySlidePlayedInSession = false`（模块只求值一次 → 跨重挂载留存，整页刷新才重置；仅客户端生命周期读写，无 SSR 泄漏）。
- `triggerEntryFadeIn`：`nextTick(() => { if (entrySlidePlayedInSession) revealFadeElementsInPlace(); else { entrySlidePlayedInSession = true; hideFadeElements(true); triggerFadeIn(true); } })` —— 首次播上滑，之后 SPA 到达走 `revealFadeElementsInPlace`（给元素加 `style.transition='none'` + 直接置 opacity-100/translate-y-0，下一帧 rAF 清掉 inline transition）→ 无 transform 动画 → 无下跳，外观渐入交给 `#main` opacity。
- **ClientOnly 时序坑**：内容包在 `<ClientOnly>` 内，SSR 水合后插槽要等下一帧才渲染进 DOM ⇒ `triggerEntryFadeIn` 必须包 `nextTick` 再查 `.fade-in-element`，否则首屏查不到 → 早返回 → 文章列表卡在 opacity-0 不显现。

相关：[[page-transition-pjax-origin]]、[[frontend-soft404-setstatus]]、[[hydration-mismatch-pending-immediate-watch]]
