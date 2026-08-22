---
name: usefetch-route-param-spa-refetch-trap
description: "列表页(category/tag [slug])重挂载→apiSlug 只初始化、不 watch slug,并删 watch(route.params.slug);否则旧页存活期 watch 触发 useFetch 重请求清空 data→articles-grid(v-if contents>0)被移除→flex justify-center 根容器把孤立标题(menu/# 图标)居中到屏幕中央,且致文章页 404 误请求"
metadata: 
  node_type: memory
  type: project
  originSessionId: eff58d2c-4502-4129-94d1-12ab024e8c0b
---

`app/pages/category/[slug].vue` 与 `app/pages/tag/[slug].vue` 的 `slug = computed(() => route.params.slug)`,useFetch URL getter 写成 `() => /api/category/${slug.value}/contents`。Nuxt useFetch 会自动追踪 URL getter 里读到的响应式依赖(slug),`watch: [page, slug]` 更是显式声明。

陷阱:SPA 导航从列表页 `/category/note` → 文章页 `/content/note/1012` 时,route.params.slug 变成文章 slug(`1012`,Typecho 迁移文章常为纯数字 cid),而旧列表页组件在页面过渡卸载前仍存活,useFetch 自动用文章 slug 重新请求 `/api/category/1012/contents` → 后端找不到 type=category 的 meta → 404 噪音(线上表现就是控制台 `GET /api/category/1018/contents 404`)。标签页同理。

**Why:** useFetch 的响应式追踪不区分"我还在这个页面"和"路由已离开",只要被追踪的 route.params 变了就 refetch;列表页组件在 SPA 过渡期未卸载是触发窗口。

**How to apply(2026-07-24 改进,比 watch+守卫更彻底,且修了 menu 图标居中 bug):** category/tag 实为**重挂载**(见 [[nuxt-page-key-route-path]]),新实例 setup 自会用新 slug 初始化 apiSlug 并请求;故 `apiSlug` 改为**只 `ref(slug.value)` 初始化、删 `watch(slug)`**,并**删 `watch(() => route.params.slug)`**(原"切分类重触发动画"在重挂载下靠新实例 `onMounted→triggerEntryFadeIn`,无需旧实例响应)。useFetch 的 `watch:[page, apiSlug]` 可保留(apiSlug 永不变,等价 `[page]`)。

**旧 watch(slug) 在重挂载下是死代码且有害(本次根因):** 导航瞬间旧实例仍被 Suspense 挂住,watch 同步 apiSlug→新 slug 触发 useFetch 重请求→**data 被清空**→`contents=[]`→`articles-grid`(`v-if contents.length>0 && !showSkeleton`)与分页被**移除(不占位)**→根容器 `flex flex-col justify-center items-center` 把孤立的 `<header>`(含 `ri:menu-line`/`ri:hashtag` 图标)瞬间**居中到屏幕中央**,恰逢 mainOpacity 渐出→用户看到居中的 menu 图标淡出(chrome-devtools 8ms 采样:root.children.length 3→1、header.top 128→310 接近 vh/2=345)。`watch(route.params.slug)` 里 `page.value=1` 同样触发重请求,一并删。修复后采样:root 全程=3、header.top 全程 128-206 未跳中央、mainOpacity 1→0→1 正常。

**apiSlug 不 watch 后双重收益:** ①旧页不再 refetch、data 保留、grid 不移除、header 留顶部;②从根源断掉文章页 404 误请求(apiSlug 不再追 route,比旧"watch+route.path 守卫"更彻底)。排查 SPA 导航类问题用 `document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/category/x')` 触发**真 SPA 导航**(注:`history.pushState+dispatchEvent(popstate)` 不可靠——Vue Router 不响应、只换 URL 不换组件);8ms setInterval 采样 `#main` opacity / root.children / header rect。相关:[[page-transition-pjax-origin]]、[[frontend-soft404-setstatus]]、[[nuxt-page-key-route-path]]
