// 自定义路由 scrollBehavior：在 Nuxt 默认实现基础上，仅对「跨页 + 文章评论锚点」改写。
//
// 背景：评论由 CommentList 在 onMounted 内异步加载，而 Nuxt 默认 scrollBehavior 在跨页导航后
// 会返回 { el: "#comment-xxx" } 抢跑滚动；此刻评论尚未渲染，Vue Router 便会告警：
//   "Couldn't find element using selector "#comment-xxx" returned by scrollBehavior"
// 评论的最终定位本就由 [slug].vue 的 route.hash watcher（轮询到元素出现后 scrollToComment）负责，
// 因此这里对 #comment- 哈希只回顶部、不直接给 el，既消除告警，又保留同窗口 SPA 导航。
//
// 其余分支（同页 hash、scrollToTop meta、savedPosition、过渡完成后回顶/锚点）忠实沿用 Nuxt 默认实现。
import { START_LOCATION } from "vue-router";
import type { RouterConfig } from "@nuxt/schema";

import { useNuxtApp } from "#app/nuxt";
import { isChangingPage } from "#app/components/utils";
import { useRouter } from "#app/composables/router";

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    const nuxtApp = useNuxtApp();
    const hashScrollBehaviour = (useRouter().options as any)?.scrollBehaviorType ?? "auto";

    // 同页（仅 hash 变化）：评论等锚点元素通常已在 DOM，沿用默认即可，不告警。
    if (to.path.replace(/\/$/, "") === from.path.replace(/\/$/, "")) {
      if (from.hash && !to.hash) {
        return { left: 0, top: 0 };
      }
      if (to.hash) {
        return { el: to.hash, top: _getHashElementScrollMarginTop(to.hash), behavior: hashScrollBehaviour };
      }
      return false;
    }

    // 跨页 + 文章评论锚点：路由只回顶部（不带 el → 不触发告警），评论定位交给 [slug].vue 的 watcher。
    // 同步返回确保「先回顶」发生在 watcher「后滚到评论」之前，二者不抢占。
    if (to.hash?.startsWith("#comment-")) {
      return { left: 0, top: 0 };
    }

    // —— 以下忠实复刻 Nuxt 默认（跨页、非评论锚点）——
    const scrollToTopMeta = (to.meta as any).scrollToTop;
    const routeAllowsScrollToTop =
      typeof scrollToTopMeta === "function" ? scrollToTopMeta(to, from) : scrollToTopMeta;
    if (routeAllowsScrollToTop === false) {
      return false;
    }
    if (from === START_LOCATION) {
      return _calculatePosition(to, from, savedPosition, hashScrollBehaviour);
    }
    return new Promise(resolve => {
      const doScroll = () => {
        requestAnimationFrame(() => resolve(_calculatePosition(to, from, savedPosition, hashScrollBehaviour)));
      };
      nuxtApp.hooks.hookOnce("page:loading:end", () => {
        // ~transitionPromise 为 Nuxt 内部字段：等当前页面过渡完成后再滚动，避免滚动半过渡的页面。
        const transitionPromise = (nuxtApp as any)["~transitionPromise"];
        if (transitionPromise) {
          transitionPromise.then(doScroll);
        } else {
          doScroll();
        }
      });
    });
  },
};

/** 读取锚点元素的 scroll-margin-top + 根节点 scroll-padding-top，用于贴顶偏移（粘性头避让） */
function _getHashElementScrollMarginTop(selector: string): number {
  try {
    const elem = document.querySelector(selector);
    if (elem) {
      return (
        (Number.parseFloat(getComputedStyle(elem).scrollMarginTop) || 0) +
        (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
      );
    }
  } catch {
    /* noop */
  }
  return 0;
}

/** 计算目标滚动位置：savedPosition 优先；有 hash 滚到锚点；否则回顶部 */
function _calculatePosition(
  to: { hash?: string },
  from: { hash?: string },
  savedPosition: unknown,
  defaultHashScrollBehaviour: string,
) {
  if (savedPosition) {
    return savedPosition;
  }
  const isPageNavigation = isChangingPage(to as any, from as any);
  if (to.hash) {
    return {
      el: to.hash,
      top: _getHashElementScrollMarginTop(to.hash),
      behavior: isPageNavigation ? defaultHashScrollBehaviour : "instant",
    };
  }
  return { left: 0, top: 0 };
}
