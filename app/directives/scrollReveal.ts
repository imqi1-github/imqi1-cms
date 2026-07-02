/**
 * 滚动渐入自定义指令
 * 使用方式：v-scroll-reveal 或 v-scroll-reveal="options" 或 v-scroll-reveal.no-transform
 *
 * 元素进入视口时从 opacity:0 + translateY 渐入到可见。
 * - 共享 IntersectionObserver（按 threshold|rootMargin 签名缓存），避免每元素一个 observer。
 * - SSR 由 getSSRProps 注入 data-scroll-reveal 属性，保证首屏即隐藏、无 FOUC。
 * - 进入视口后加 data-revealed 触发 CSS 过渡，取消观察，并调用可选 onReveal 回调。
 *
 * 配置项见 ~/types/scroll-reveal 的 ScrollRevealOptions。
 */

import type { Directive } from "vue";

import type { ScrollRevealOptions } from "~/types/scroll-reveal";

const DATA_ATTR = "data-scroll-reveal";
const REVEALED_ATTR = "data-revealed";
const NO_TRANSFORM_ATTR = "data-no-transform";
const CSS_VAR_Y = "--scroll-reveal-y";

// 默认配置：元素一进入视口即显现（threshold 0 + 无底部收窄），
// 避免元素已位于屏幕内但因靠近视口底部而不显示。
const DEFAULT_THRESHOLD = 0;
const DEFAULT_ROOT_MARGIN = "0px";

// 按 threshold|rootMargin 签名复用 observer
const observerCache = new Map<string, IntersectionObserver>();
// per-element 的 onReveal 回调
const revealCallbacks = new WeakMap<HTMLElement, ((el: HTMLElement) => void) | undefined>();
// per-element 所属 observer（卸载时反观察）
const elementObserver = new WeakMap<HTMLElement, IntersectionObserver>();

function getObserver(threshold: number, rootMargin: string): IntersectionObserver {
  const key = `${threshold}|${rootMargin}`;
  const cached = observerCache.get(key);
  if (cached) return cached;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.setAttribute(REVEALED_ATTR, "");
        observer.unobserve(el);
        const cb = revealCallbacks.get(el);
        if (cb) {
          revealCallbacks.delete(el);
          cb(el);
        }
      }
    },
    { threshold, rootMargin },
  );
  observerCache.set(key, observer);
  return observer;
}

const scrollRevealDirective: Directive<HTMLElement, ScrollRevealOptions | undefined> = {
  // SSR：注入 data-scroll-reveal 属性，CSS 在首屏即应用 opacity:0，避免 hydration 闪烁
  getSSRProps() {
    return { [DATA_ATTR]: "" };
  },

  mounted(el, binding) {
    const opts = binding.value ?? {};
    el.setAttribute(DATA_ATTR, "");

    const noTransform = binding.modifiers.noTransform === true || opts.noTransform === true;
    if (noTransform) el.setAttribute(NO_TRANSFORM_ATTR, "");

    if (opts.translateY != null) {
      el.style.setProperty(CSS_VAR_Y, `${opts.translateY}px`);
    }
    if (opts.delay != null) {
      el.style.transitionDelay = `${opts.delay}ms`;
    }

    revealCallbacks.set(el, opts.onReveal);

    const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    const rootMargin = opts.rootMargin ?? DEFAULT_ROOT_MARGIN;
    const observer = getObserver(threshold, rootMargin);
    elementObserver.set(el, observer);
    observer.observe(el);
  },

  unmounted(el) {
    elementObserver.get(el)?.unobserve(el);
    elementObserver.delete(el);
    revealCallbacks.delete(el);
  },
};

export default scrollRevealDirective;
