---
name: page-transition-pjax-origin
description: 前台页面过渡的最终实现——渐出由 router.beforeEach 启动、page:start 为 no-op；旧页能否渐出取决于新页顶层 await 挂起 Suspense；位移 mainTranslateY 与全屏固定页的 transform 冲突规则
metadata:
  type: project
---

# 前台页面过渡（最终实现）

`app/app.vue`。配置：`siteConfig.pages.transition.fadeDuration`（当前 150ms）、`translateY`（14px）。

## 触发链

- **渐出在 `router.beforeEach` 启动**（`startFadeOut()`：置 `mainOpacity=0`、`mainTranslateY`），同步执行、点击瞬间即生效，**不等新页 chunk 下载**。
- `page:start` 是 **no-op**（它绑在 Suspense `onPending`，要等 chunk 下完 + async setup 挂起才触发 → 生产首访点导航会「先等一下才渐出」）。⚠️ 不要在 `page:start` 里重置 `transitionStartTime`，否则抹掉「点击→挂起」的下载耗时，破坏剩余时长计算。
- `page:finish` 算 `remainingFadeOutTime = max(0, fadeDuration - 已耗时)`（从点击时刻起算），补满 fadeDuration 后置 `mainOpacity=1` → 新内容淡入。`<main>` 挂 `transition: opacity ${fadeDuration}ms`。
- `router.afterEach` 里 `if (failure && pendingFadePath === to.path) cancelFadeOut()` —— `pendingFadePath` token 防「旧导航失败」误伤「新导航过渡」；hash/query-only 导航不触发渐出。

## 关键不变式：钩子触发 ≠ 渐出可见

**旧页能不能渐出，取决于新页 setup 有没有顶层 `await` 挂起 Suspense** —— Suspense pending 期间旧页 DOM 保持挂载，`mainOpacity` 的淡出才作用在旧页上；没有 `await`，新页瞬间替换旧页，`page:finish` 补满的只是「新页透明等待」，旧页早已消失。

⇒ 要「不发请求又保留渐出」，必须另造一次顶层 `await`（等价于一次耗时 fadeDuration 的请求）。**做法：`await useFadeOutOnNavigate()`**（`app/composables/useFadeOutOnNavigate.ts`，仅客户端 SPA 导航生效，SSR/首屏跳过）。

⚠️ **光有 `useFetch` 不够**：本地数据秒回时 Suspense 只挂起十几毫秒，`mainOpacity` 最低到不了 0，渐出几乎不可见。⇒ **新增「SPA 内切参数的动态路由列表页」务必在 useFetch 前 `await useFadeOutOnNavigate()`**（当前 9 个页面在用）。

验证手段：MutationObserver 采样 `#main` 的 `style.opacity`，看 min 是否到 0。

## 位移与 transform 包含块冲突（首页/地图）

渐出时 `mainOpacity 0→1` 并叠加 `mainTranslateY 0→14px`（下移，渐入时上移归位）。

CSS 规则：**任何祖先 `transform`（含 `translateY(0)`）都会为后代 `position:fixed` 创建包含块** ⇒ index.vue 的 hero（`fixed inset-0` + 视差）被 main transform 包含后相对 main 定位 → 下移 80px、居中错位、长页飞出视口。

三条解法缺一不可：

- **涉及「全屏固定页」的导航全程 opacity-only 不位移**：`NO_TRANSLATE_PATHS = new Set(["/", "/map"])`，在 `router.beforeEach` 最早期预算 `navSkipsTranslate`（from/to 任一命中即跳过）。白名单含首页（hero fixed 视差）与 `/map`（全屏 section + absolute 浮层）。**切勿**用 `computed(route.path)` —— 离开这些页的瞬间 route.path 已是新页，会把 transform 挂到仍渲染旧页的 main 上致闪烁。
- **稳态 transform 必须为 none**：main style 绑 `transform: mainTranslateY ? translateY(${y}px) : undefined` —— 位移为 0 时不渲染 transform ⇒ 无包含块 ⇒ about 的 fixed 装饰、map 的 absolute 浮层稳态安全。
- **Teleport hero 到 body 不可行**：hero 与 main 成兄弟后，main 的不透明背景会盖住 hero，或透明 main 透出本该 `display:none` 的 hero，层叠死结无干净解 ⇒ 选「首页不位移」。

相关：[[nuxt-page-key-route-path]]、[[single-user-site-invariant]]
