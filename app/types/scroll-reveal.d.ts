/**
 * 滚动渐入指令 v-scroll-reveal 的类型定义
 * 统一 directives/scrollReveal.ts 与各使用方的配置类型
 */

/**
 * v-scroll-reveal 指令配置
 *
 * 用法示例：
 *   v-scroll-reveal                                 → 默认配置
 *   v-scroll-reveal="{ threshold: 0.01, translateY: 20 }"
 *   v-scroll-reveal.no-transform                     → 仅 opacity 不位移（canvas 等）
 *   v-scroll-reveal="{ onReveal: handleReveal }"     → 进入视口时回调
 */
export interface ScrollRevealOptions {
  /** 触发阈值，元素可见比例达到该值时显现，默认 0（一像素进入即触发） */
  threshold?: number;
  /** IntersectionObserver rootMargin，默认 "0px"（元素进入视口即触发） */
  rootMargin?: string;
  /** Y 轴位移像素，默认 30px（agreement 页用 20px） */
  translateY?: number;
  /** 过渡延迟毫秒，映射到 transition-delay */
  delay?: number;
  /** 仅 opacity 渐入、不位移（也可用 v-scroll-reveal.no-transform 修饰符） */
  noTransform?: boolean;
  /** 元素进入视口显现后的回调 */
  onReveal?: (el: HTMLElement) => void;
}
