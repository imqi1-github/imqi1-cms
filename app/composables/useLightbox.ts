import type { LightboxSlide, LightboxState } from "~/types/composables/lightbox";

/**
 * 图片灯箱状态（自研，替代商用许可的 Fancybox）
 *
 * 全局单例：`useState` 承载共享状态，`<Lightbox>` 在 app.vue 挂载一次，
 * 参照 useConfirm / ConfirmDialog 的既有范式。
 *
 * 画廊按 `data-fancybox` 属性值分组，且只在**显式注册过的容器**内收集幻灯片——
 * 与旧 Fancybox.bind(container, "[data-fancybox]") 的作用域一致：
 * 既避免劫持 admin 预览等无关图片，又能拾取 Markdown 渲染后才注入 DOM 的图片
 * （委派监听在点击时才查询，不依赖挂载时机）。
 */

/** 已注册的画廊容器（DOM 引用不进响应式，避免被 Vue 深度代理） */
const containers = new Set<HTMLElement>();
/** 打开灯箱的触发元素，用于关闭后归还焦点 */
let triggerEl: HTMLElement | null = null;
/** 当前画廊的触发元素，按幻灯片顺序排列：关闭要收敛回「当前这张」的原图，而非最初点开的那张 */
let triggerEls: HTMLElement[] = [];

/** LivePhoto 留在最外层 wrapper 上的实况标记与真实地址（见 LivePhoto.vue 的 triggerAttrs） */
const LIVE_ATTR = "data-live-photo";
const SRC_ATTR = "data-lb-src";

/** 取触发元素的干净地址。地址挂外层包装上，img 尚未懒加载出来时也拿得到。 */
const readSrc = (el: HTMLElement, img: HTMLImageElement | null): string =>
  el.getAttribute(SRC_ATTR) ?? img?.getAttribute(SRC_ATTR) ?? img?.getAttribute("src") ?? "";

const isLiveTrigger = (el: HTMLElement, img: HTMLImageElement | null): boolean =>
  el.hasAttribute(LIVE_ATTR) || (img?.hasAttribute(LIVE_ATTR) ?? false);

export const useLightbox = () => {
  const state = useState<LightboxState | null>("lightbox", () => null);

  /** 注册画廊容器（对应旧 Fancybox.bind 的位置） */
  const register = (container: HTMLElement | null | undefined) => {
    if (container) containers.add(container);
  };

  /** 注销并关闭：容器被卸载时调用，避免持有已分离 DOM */
  const unregister = (container: HTMLElement | null | undefined) => {
    if (container) containers.delete(container);
    if (triggerEl && container?.contains(triggerEl)) close();
  };

  /**
   * 找到最深的已注册容器。封面轮播自己也注册了容器且嵌在页面根内，
   * 取最深的一个才能让封面画廊只归到封面（不随 onMounted 先后次序变化）。
   * 顺手剔除已脱离文档的容器——即便某处漏了 unregister，也不会让它一直挂在 Set 里。
   */
  const findScope = (el: HTMLElement): HTMLElement | null => {
    let deepest: HTMLElement | null = null;
    for (const container of [...containers]) {
      if (!container.isConnected) {
        containers.delete(container);
        continue;
      }
      if (!container.contains(el)) continue;
      if (!deepest || deepest.contains(container)) deepest = container;
    }
    return deepest;
  };

  /**
   * 由点击目标解析出触发元素；不在已注册容器内则返回 null（不劫持无关图片）
   */
  const resolveTrigger = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof HTMLElement)) return null;
    const el = target.closest<HTMLElement>("[data-fancybox]");
    if (!el) return null;
    return findScope(el) ? el : null;
  };

  /** 把触发元素解析为幻灯片数据 */
  const toSlide = (el: HTMLElement): LightboxSlide => {
    const img = el instanceof HTMLImageElement ? el : el.querySelector<HTMLImageElement>("img");
    const live = isLiveTrigger(el, img);
    const cleanSrc = readSrc(el, img);
    const alt = img?.getAttribute("alt") ?? el.getAttribute("data-caption") ?? "";
    // naturalWidth 在该图已进入视口时总是可用的，比附件元数据覆盖得更全
    const width = img?.naturalWidth || null;
    const height = img?.naturalHeight || null;

    return {
      src: live ? `${cleanSrc}#live` : cleanSrc,
      cleanSrc,
      alt,
      caption: el.getAttribute("data-caption") ?? alt,
      isLive: live,
      width,
      height,
    };
  };

  const open = (trigger: HTMLElement) => {
    const scope = findScope(trigger);
    if (!scope) return;

    const group = trigger.getAttribute("data-fancybox") ?? "gallery";
    const groupTriggers = Array.from(scope.querySelectorAll<HTMLElement>(`[data-fancybox="${CSS.escape(group)}"]`));
    const index = groupTriggers.indexOf(trigger);
    if (index < 0) return;

    triggerEl = trigger;
    triggerEls = groupTriggers;
    // 覆盖式打开：同一时刻只允许一个画廊，旧状态直接丢弃（无挂起 Promise，无需 cancel）
    state.value = { slides: groupTriggers.map(toSlide), index };
  };

  // 焦点归还由组件在 <dialog> 真正关闭后做：dialog 打开期间焦点被顶层模态锁住，
  // 此时 focus() 无效。组件在打开时自行留存触发元素。
  const close = () => {
    state.value = null;
    triggerEl = null;
  };

  const goTo = (index: number) => {
    const current = state.value;
    if (!current) return;
    const total = current.slides.length;
    if (total === 0) return;
    // 循环切换，与旧灯箱的无限轮播一致
    state.value = { ...current, index: ((index % total) + total) % total };
  };

  const next = () => goTo((state.value?.index ?? 0) + 1);
  const prev = () => goTo((state.value?.index ?? 0) - 1);

  /** 第 index 张幻灯片对应的触发元素（那张原图） */
  const getTriggerAt = (index: number): HTMLElement | null => triggerEls[index] ?? null;

  /** 释放画廊 DOM 引用（关闭动画播完后调用，避免长期持有已卸载 DOM） */
  const release = () => {
    triggerEl = null;
    triggerEls = [];
  };

  return { state, register, unregister, resolveTrigger, open, close, goTo, next, prev, getTriggerAt, release };
};
