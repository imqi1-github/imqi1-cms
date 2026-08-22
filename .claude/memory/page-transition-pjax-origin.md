---
name: page-transition-pjax-origin
description: "前台页面渐出可见性依赖新页顶层 await 挂起 Suspense、让旧页 DOM 保持挂载;page:start/page:finish 钩子+补满 fadeDuration 只控制时长,不保证旧页保持"
metadata: 
  node_type: memory
  type: project
  originSessionId: a2c1124b-8640-4681-903e-273297de511a
---

`app/app.vue` 的前台过渡:**2026-07-26 起渐出触发点已从 `page:start` 挪到 `router.beforeEach`**(见下方变体),`page:start` 现为 no-op;`page:finish`(`app.vue:124`)算 `remainingFadeOutTime = fadeDuration - 已耗时`(自点击时刻起),**补满 `fadeDuration`** 后置 `mainOpacity=1`、新内容淡入。`<main>` 挂 `transition: opacity ${fadeDuration}ms`。早期版本(2026-07 前)确是 `page:start` 置 `mainOpacity=0`,本条下文「钩子触发 ≠ 渐出可见 / Suspense 旧页保持」等深层机制仍成立。

**关键(曾被搞错过两次):钩子触发 ≠ 渐出可见。** `page:start`/`page:finish` 是路由级钩子,导航必触发、补足逻辑确实兜底"加载太快"。但**旧页能不能渐出,取决于新页 setup 有没有顶层 `await` 挂起 Suspense**——Suspense pending 期间旧页 DOM 保持挂载,`mainOpacity` 的淡出才作用于旧页;没有 `await`,新页瞬间替换旧页,旧页来不及渐出(`page:finish` 补满的只是"新页透明等待",旧页早已消失)。所以同步 setup 的页面(subscribes/sitemap 用 `onMounted + $fetch`)渐出会失效,跟补足逻辑无关。

**Why:** 区分"可见性靠 Suspense 旧页保持 / 时长靠钩子补足"这两层,才能正确处理"不发请求又要渐出"。2026-06 在 `search.vue` 栽过两次:① 以为删空查询不影响渐出 → 用户反馈无渐出;② 又以为"钩子保证渐出、不依赖 Suspense" → 还是无渐出。最终落地方案:无 q 时人为 `await new Promise(r => setTimeout(r, fadeDuration))` 复刻请求窗口(仅 `import.meta.client && !nuxtApp.isHydrating` 时,即客户端 SPA 导航),既不发空查询又保留旧页渐出。

**How to apply:** 要"不发请求又保留渐出",必须另造一个顶层 `await` 挂起 Suspense ≥ fadeDuration(等价于一次耗时 fadeDuration 的请求);SSR/首屏 hydration 跳过(首屏走 first-loading 遮罩)。顶层 `await useFetch`(带 `x-ssr-internal-request: true` 头,供 server/middleware/referer-check.ts 放行 SSR)同时承担两职:① 挂起 Suspense 让旧页渐出;② 让 `page:finish` 时数据就绪、淡入即带数据。各页(subscribes/sitemap/[...slug]/search)`onMounted` 内的 `setTimeout(fadeDuration)` 是协调页面内 `.animate-fade-in` 元素滚动淡入(IntersectionObserver)的时序,与页面渐出是否失效无关。长期更干净的方案是迁移到 Nuxt 标准 `pageTransition`(Vue Transition 的 leave/enter 不依赖 Suspense pending),但会动全局过渡机制,风险高。

**变体(2026-07-24,category/tag 切分类):有顶层 `await useFetch` 也照样渐出不可见——数据秒回致挂起不足 fadeDuration。** `category/[slug]`、`tag/[slug]` SPA 内切 slug 实测**重挂载**(setup/onMounted 每跳重跑,代码注释曾误标"复用 setup 不重跑"已修正),page:start/page:finish 都触发;但 useFetch 本地秒回致 Suspense 仅挂起 ~159ms(略超 150ms fadeDuration),`mainOpacity` 最低只到 0.08 就被 page:finish 拉回 1,渐出几乎不可见。修复:useFetch 前 `await useFadeOutOnNavigate()`(`composables/useFadeOutOnNavigate.ts`,封装 `import.meta.client && !isHydrating` 时 setTimeout(fadeDuration)),挂满 fadeDuration 让 mainOpacity 完全到 0(实测 min=0)。**新增"SPA 内切参数的动态路由列表页"务必在 useFetch 前 await useFadeOutOnNavigate**,别以为有 useFetch 就够。验证手段:evaluate MutationObserver 监听 `#main` style.opacity,看 min 是否到 0。

**变体(2026-07-24,加位移 mainTranslateY):** 在 mainOpacity 基础上新增 `mainTranslateY` ref,渐出 `0→+translateY`(下移)、渐入 `+translateY→0`(上移归位),与 mainOpacity 共用 fadeDuration 过渡、page:start/finish 同步进退。位移幅度 `siteConfig.pageTransition.translateY`(14px),fadeDuration 150→200。加载提示阈值 1000→500ms(app.vue page:start 内 setTimeout(showLoadingTimeout,500),page:finish clearTimeout;UI 加 z-40 pointer-events-none)。

**首页 hero fixed 与全局 transform 的致命冲突(本次核心坑):** CSS 规则——任何祖先 `transform`(含 `translateY(0)`)都为后代 `position:fixed` 创建包含块。index.vue hero(`fixed inset-0` + computeHero 滚动视差,依赖视口定位)被 main transform 包含后会相对 main(pt-20 px-5)定位→下移 80px、居中错位、长页飞出视口。解法三条缺一不可:
- **涉及「全屏固定页」的导航全程 opacity-only 不位移**:`const NO_TRANSLATE_PATHS = new Set(['/','/map']); router.beforeEach((to,from)=>{ navSkipsTranslate = NO_TRANSLATE_PATHS.has(from.path)||NO_TRANSLATE_PATHS.has(to.path) })` 在导航最早期预算,page:start 读它决定 mainTranslateY 设 14 还是 0。白名单含首页(hero fixed 视差)与 `/map`(`map.vue` `<section relative -mt-20 -mx-5 h-svh>` 全屏 + 内部 `absolute inset-0` 浮层,main transform 会让全屏地图整体上下错位,淡入期 14→0 可见)。**切勿**用 `computed(route.path)`——page:start 触发时 route.path 已是新页,离开这些页瞬间会把 transform 挂到仍渲染旧页的 main 上致闪烁。
- **稳态 transform 必须为 none**:main style 绑 `transform: mainTranslateY ? translateY(${y}px) : undefined`。位移为 0(稳态/涉及首页过渡)时不渲染 transform→无包含块→about 的 fixed z-0 装饰、map 的 absolute 浮层稳态全安全,**about/map 零改动**;过渡期的包含块偏移发生在 opacity→0 期间不可见,可接受。
- **Teleport hero to body 不可行**:hero 与 main 成兄弟后,main 的 bg-white 不透明会盖住 hero(若 hero 置于 main 下)或透明内容透出本该 display:none 的 hero(若 main 透明),层叠死结无干净解。故选"首页不位移"而非 Teleport。

验证(chrome-devtools evaluate 采样 `#main` getComputedStyle 的 opacity/transform 矩阵 ty):about↔map maxTy=14、minOp≈0、稳态 lastTr=none;about→/ transformFrames=0 且 hero getBoundingClientRect.top=0(未被 pt-20 破坏);Fast 3G 下首次加载 >500ms 时加载提示出现(loaderStartedAt~1268ms)、page:finish 后消失。相关:[[nuxt-page-key-route-path]]

**变体(2026-07-26,渐出触发点 page:start → router.beforeEach,本次根因修复):** 用户报"生产环境点导航栏肉眼可见等一下才渐出"。根因:`page:start` 绑在 `<Suspense>` 的 `onPending`(node_modules/nuxt/dist/pages/runtime/page.js:147),要等 Vue Router **下完新页 chunk + 跑到 async setup 挂起 Suspense** 才触发;首访每页都要现下 JS/CSS chunk,且 SiteNavMenu 用 `router.push`(无 `<NuxtLink>` 预取)→ 点击到渐出之间夹了整个 chunk 下载,生产可见。dev 因 Vite 内存直供无此延迟,故只生产复现。修复两件套:
- **A. 渐出挪到 `router.beforeEach`(同步、点击瞬间、pre-chunk)**:`beforeEach` 里 `if(import.meta.client && !nuxtApp.isHydrating && to.path !== from.path){ pendingFadePath = to.path; startFadeOut() }`,startFadeOut 立即置 `mainOpacity=0`/`mainTranslateY`。`page:start` 改 no-op(**勿在此重置 transitionStartTime**,否则抹掉「点击→挂起」间 chunk 下载耗时,破坏 page:finish 剩余时长计算)。`afterEach(to,_from,failure)` 里 `if(failure && pendingFadePath===to.path) cancelFadeOut()`——`pendingFadePath` token 防"旧导航失败"误伤"新导航过渡"(只有失败导航仍是最近一次渐出目标、且无更新导航接手才回滚)。hash/query-only 不触发(与原 page:start 一致)。**注意:此改动让"无顶层 await 的同步页"也能渐出**——因为渐出不再依赖 Suspense onPending,点击即开始;但旧页能否保持挂载渐出**仍依赖**新页顶层 await(同步页新页瞬间替换旧页,渐出作用对象消失),所以 useFadeOutOnNavigate 对同步页仍需要——只是触发时机提前了。
- **B. SiteNavMenu 的 `router.push` 按钮换 `<NuxtLink>`**(搜索/分类项/留言/友链/关于,PC+移动端):恢复 hover/可见性预取(`<a href>` 真链接,SEO 也更好)。保留 `group` hover 蓝底 span、v-tooltip、aria-label;点击 `@click="onNavClick"`(blur 失焦防 :focus-within 保持分类下拉)或移动端 `closeMobileMenu`。删了 navigate/navigateAndClose/router。
- 验证(chrome-devtools 16ms 采样 `#main` opacity/ty,真 SPA 导航走 `document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push`):`/`→`/about` 首降<0.95 在点击后 33ms、minOp=0@169ms、maxTy=0(首页在 NO_TRANSLATE_PATHS 正确跳过位移)、终态 op=1 ty=0;`/about`→`/links` 首降 33ms、minOp=0@193ms、maxTy=14(两侧都不在白名单位移正确启用)、终态 op=1 ty=0。eslint/vue-tsc 全绿。**生产延迟本身靠代码推理证明(beforeEach=pre-chunk vs page:start=onPending=post-chunk),dev 无法复现时序。**
