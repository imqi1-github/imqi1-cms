import { siteConfig } from "~~/site.config";

/**
 * SPA 导航时挂起一个 fadeDuration，让 app.vue 的 mainOpacity 完成旧页渐出。
 *
 * 旧页渐出可见性依赖新页顶层 await 挂起 Suspense：page:start 把 mainOpacity 置 0，
 * 只要 setup 的 await 不 resolve，旧页 DOM 就保持挂载、淡出看得到。
 * 若新页 setup 同步（如 404）或 useFetch 命中 payload 缓存秒 resolve，Suspense 不实质挂起，
 * 新页会在 mainOpacity 还没渐到 0 时就挂载——无 opacity:0 初始态的元素
 * （装饰 fixed/absolute 浮层、ClientOnly fallback、常驻 UI）会在旧页渐出期间提前露脸，
 * 表现为「出现 → 渐出 → 再渐入」的闪烁。
 *
 * 仅客户端 SPA 导航需要挂起：SSR 与首屏 hydration 走 first-loading 遮罩，无上一页可渐出。
 *
 * 用法：在页面 <script setup> 顶层 await 调用，建议置于 useFetch 之前（先让旧页渐出再拉数据）。
 */
export function useFadeOutOnNavigate(): Promise<void> {
  const nuxtApp = useNuxtApp();
  if (import.meta.client && !nuxtApp.isHydrating) {
    return new Promise(resolve => setTimeout(resolve, siteConfig.pageTransition.fadeDuration));
  }
  return Promise.resolve();
}
