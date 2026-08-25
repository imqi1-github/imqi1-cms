# 技术债 / 待办清单（邪门扫描 2026-08-25）

> 全项目「邪门」扫描（5 区域 grep 驱动）发现的、**暂不动、留给以后**的重大重构/加固。
> 每项附问题、为何滞后、建议改法、风险。执行前先跑 eslint + typecheck + 相关页面回归。
> 当前待办：**1 项**（[slug].vue 拆分）。另两项（#3 router 私有字段、#11 data-transfer）已处理，见文末。

---

## 1. `app/pages/content/[category]/[slug].vue` — 2891 行单文件微框架拆分

- **现象**：这一个 SFC 自成一个"markdown 扩展引擎"：`onMounted` 里 `createApp + h(MetingPlayer)` 起整个新 Vue 实例水合音乐块；`createVNode + render()` 手动挂 LivePhoto（扒 `useNuxtApp().vueApp._context`）；运行时拼 `<style>` 注入 head；清监听用 `button.replaceWith(cloneNode)` 把节点整个炸掉；还有 `.noneed` 碎英文类名。
- **为何滞后**：改动面大、每个 widget（音乐/实况照片/Fancybox/Swiper/代码复制/目录/仓库卡片）都要回归；且这些是跟 Nuxt/Vue 内部实现的既有 workaround，拆分成组件要重新设计挂载方式。
- **建议改法**：把 MetingPlayer / LivePhoto / Fancybox / Swiper / code-copy / TOC / repo-card 各自抽成 `components/markdown/*` Vue 组件；`createApp/h()` 改为组件内 `defineComponent` + `render`；运行时样式收进各自 SFC（scoped / `:deep`）。跨 bundle 的 markdown 渲染结构（同源三份的 markdownToPlainText）也要同步考虑。
- **风险**：高。需逐 widget 回归；建议单独一个任务、分批做（先音乐+照片+轮播）。

---

## 附：已处理（本批「邪门」修复纪实）
- #1 nuxt.config ISR 注释对齐秒值；#2 admin/[...slug].vue 补 setResponseStatus(404)；#3 useAudioPlayer 熔断改内存自复位（不写 localStorage）；#4 clear-redis.mjs docblock 修正；#5 upload-cos 并发默认统一 15；#6 scripts 纳入 eslint（已全绿）；#9 parseUserAgent 改具体档/通用档两阶匹配（去顺序炸弹）。
- #7/#8 按用户决定不改；信封统一另议。
- #3 `app/router.options.ts` 已修：抽 `_getPageTransitionPromise()` 兜底（try/catch + null 回退），过渡 promise 用 `.then(doScroll, doScroll)`（成功/失败都滚动，避免 reject 卡死），并注释标注"Nuxt 内部字段、升级需复核"。
- #11 `server/utils/data-transfer.ts` + `admin/data/import.post.ts` 已修：`getDelegate(model, client=prisma)` 统一收口字符串索引 double-as（导出用 prisma、导入事务内传 tx），去掉 import 内联 cast；`SET FOREIGN_KEY_CHECKS=0` 本就事务内 finally 强制恢复为 1，未变。
