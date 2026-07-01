import { siteConfig } from "~~/site.config";

/**
 * 前台 404 页面的统一脚本逻辑：SSR 状态码、页面标题、SEO，并返回 SPA 挂起 Promise。
 *
 * 供 catch-all `[...slug].vue` 与显式 `/404` 路由复用，避免两页重复。
 * `definePageMeta({ layout: false })` 仍各自留在页面文件里——它是编译期宏，不能放进 composable。
 *
 * 注意上下文陷阱：本 composable 不能自行 `await` 之后再调其它 Nuxt composable。
 * 顶层 await 之所以安全，是 Nuxt 对 `<script setup>` 的编译期 transform 负责跨 await 恢复实例；
 * 普通 async composable 不享受这个，内部 await 跨微任务后实例丢失，会报
 * "composable called outside of a plugin.../setup function"。
 * 故这里：同步部分（useRequestEvent/setPageTitle/usePageSeo）在 setup 同步上下文执行，
 * 仅把挂起 Promise 返回，由页面顶层 await（那里上下文恢复由 Nuxt 负责）。
 */
export function useNotFoundPage(): Promise<void> {
  if (import.meta.server) {
    const event = useRequestEvent();
    if (event) setResponseStatus(event, 404);
  }

  const { setPageTitle, clearPageTitle } = usePageTitle();
  clearPageTitle();
  setPageTitle("页面未找到", "ri:close-large-fill");

  usePageSeo({
    title: `页面未找到 - ${siteConfig.siteName}`,
    description: siteConfig.pageSeo.notFound.description,
    keywords: siteConfig.pageSeo.notFound.keywords,
  });

  // SPA 导航时挂起一个 fadeDuration，让 app.vue 旧页渐出完成后再挂载本页，
  // 避免 canvas（ClientOnly fallback）/前景文字在 mainOpacity 过渡期间提前露脸闪烁。
  // 返回 Promise 交由页面顶层 await，不要在此函数内 await（见上文上下文说明）。
  return useFadeOutOnNavigate();
}
