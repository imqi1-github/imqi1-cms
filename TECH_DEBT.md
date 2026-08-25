# 技术债 / 待办清单（邪门扫描 2026-08-25）

> 全项目「邪门」扫描（5 区域 grep 驱动）发现的重大重构/加固。
> 每项附问题、为何滞后、建议改法、风险。执行前先跑 eslint + typecheck + 相关页面回归。
> **进行中**：[slug].vue markdown 引擎组件化（B 方案，组件+引擎+重接已完成、静态全绿，待全语法文章运行时验证）。#3/#11 已处理（见文末）；#7/#8 按用户决定不改。

---

## 1. `app/pages/content/[category]/[slug].vue` — markdown 扩展引擎组件化（B 方案，进行中）

**状态：组件 + 引擎 + [slug].vue 重接已完成并静态校验全绿；运行时待「全语法」测试文章逐 widget 验证。**

**已完成：**
- `app/components/markdown/*`（9 组件）：`MarkdownDetails` / `MarkdownVideo` / `MarkdownCallout` / `MarkdownCard` / `MarkdownSimpleCard` / `MarkdownSwiper`（自管 Swiper 实例 + destroy）/ `MarkdownRepo`（自管 fetch + 加载/错误态）/ `MarkdownWaterfall` / `MarkdownMusic`（去掉 createApp 子实例，直接渲染 `MetingPlayer`）。
- `app/composables/useMarkdownWidgets.ts`：扫描占位符（`.markdown-*-wrapper` / `.markdown-live-photo-*`）→ `createVNode + render` 挂载对应组件（用 `useNuxtApp().vueApp._context` 作 appContext），返回 `{ cleanup() }`（onUnmounted 调用卸载全部）。含 LivePhoto 双向挂载：独立 `.markdown-live-photo-wrapper` + swiper/waterfall 内 `.markdown-live-photo-mount`（须在 widget 挂载后统一 hydrate）。
- `app/utils/markdownWidgets.ts`：`escapeHtmlAttr` / `safeDecodeURIComponent` / `parseImageLine`。
- `[slug].vue`：切除 **-869 行**（`metingApps`/`markdownLivePhotoContainers`/`markdownSwipers`/`isUnmounted` + `unmountMarkdownLivePhotos`/`mountLivePhoto`/`parseImageLine`/`mountMarkdownLivePhotos`/`mountMarkdownGalleryLivePhotos` + 相关 import），`onMounted` 里调 `useMarkdownWidgets(document.body, { findImageDimensions })`，`onUnmounted` 调 `cleanupWidgets()`；**保留** Fancybox / code-copy（`pre.shiki`）/ TOC（extractToc/handleTocScroll/scrollToHeading/scrollToComment）/ 评论滚动 / 运行时 `<style>` 注入（大段 CSS）/ 正文 `v-html` / `:deep()` / 内容数据与 useFetch。
- 校验：`eslint .` 0 错误 0 warning（`--fix` 已清新组件 7 条）、`nuxi typecheck` 0 `error TS`、`/content/default/hello-world` 200 且浏览器 console 0 error（2 warning）。

**剩余 / 注意：**
- **运行时逐 widget 回归**（最重点）：写一篇含全部语法的文章（details / video / callout / card / simple-card / swiper / repo / waterfall / music / 实况照片 / gallery），逐个验：折叠开关、轮播切换 + 拖拽、仓库 fetch 渲染、音乐播放、实况照片点击播放、Fancybox 灯箱。
- `useMarkdownWidgets` 用 `document.body` 作 root（正文元素无 template ref），内部全局 `document.querySelectorAll`；若将来正文作用域要收窄需加 ref。
- `swiper/css` 副作用 import 保留在 `[slug].vue`（给 `MarkdownSwiper` 供样式）；若再抽走需一并迁移。
- `MarkdownMusic` 的 `idPresent` ref 目前恒 true；`id` 为空时 `v-else` 已兜底显示"无法识别的音乐链接"（与原来一致）。
- 跨 bundle 的 markdown 渲染结构（`server/utils/markdown.ts` / `markdownToPlainText.ts` / `app/utils/markdownSplit.ts` 三处同源）**未动**，与本拆分无关。

---

## 附：已处理（本批「邪门」修复纪实）
- #1 nuxt.config ISR 注释对齐秒值；#2 admin/[...slug].vue 补 setResponseStatus(404)；#3 useAudioPlayer 熔断改内存自复位（不写 localStorage）；#4 clear-redis.mjs docblock 修正；#5 upload-cos 并发默认统一 15；#6 scripts 纳入 eslint（已全绿）；#9 parseUserAgent 改具体档/通用档两阶匹配（去顺序炸弹）。
- #7/#8 按用户决定不改；信封统一另议。
- #3 `app/router.options.ts` 已修：抽 `_getPageTransitionPromise()` 兜底（try/catch + null 回退），过渡 promise 用 `.then(doScroll, doScroll)`（成功/失败都滚动，避免 reject 卡死），并注释标注"Nuxt 内部字段、升级需复核"。
- #11 `server/utils/data-transfer.ts` + `admin/data/import.post.ts` 已修：`getDelegate(model, client=prisma)` 统一收口字符串索引 double-as（导出用 prisma、导入事务内传 tx），去掉 import 内联 cast；`SET FOREIGN_KEY_CHECKS=0` 本就事务内 finally 强制恢复为 1，未变。
