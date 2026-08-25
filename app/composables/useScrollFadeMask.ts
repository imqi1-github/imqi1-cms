import { onMounted, ref, watch, type Ref } from "vue";
import { tryOnScopeDispose } from "@vueuse/core";

/**
 * 为可纵向滚动的容器计算"是否已到顶/到底"，用于给两端加羽化(mask)边缘。
 *
 * 约定：
 * - 顶部还有内容被滚上去 → atTop=false（该加上端羽化）；
 * - 底部还有内容没露出 → atBottom=false（该加下端羽化）；
 * - 内容高度不足、无需滚动(scrollHeight<=clientHeight) → 两端都为 true（不羽化，完整显示）。
 *
 * 监听容器自身 scroll（sticky 侧栏不随 window 滚动，不能复用 window 的 useScrollRaf），
 * scroll 只置 dirty，每帧最多算一次；ResizeObserver 覆盖内容/视口高度变化。
 * 首次计算延后到 onMounted（水合后），避免 SSR 首帧 class 不一致。仅客户端生效。
 *
 * 关键：不能只在 onMounted 一次性观察——若容器被 v-if 门控、晚于挂载才出现（如初始 fetch 失败、
 * 点「重试」成功后才渲染侧栏），onMounted 时 el 还是 null 会直接 return，此后永不注册监听。
 * 故改用 watch(el.value)：元素真正可用时再 attach，变回 null 时断开。
 */
export function useScrollFadeMask(el: Ref<HTMLElement | null>) {
  const atTop = ref(true);
  const atBottom = ref(true);

  let rafPending = false;
  let resizeObserver: ResizeObserver | null = null;
  let cleanupCurrent: (() => void) | null = null;

  const compute = () => {
    rafPending = false;
    const node = el.value;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    if (scrollHeight <= clientHeight + 1) {
      atTop.value = true;
      atBottom.value = true;
      return;
    }
    atTop.value = scrollTop <= 1;
    atBottom.value = scrollTop + clientHeight >= scrollHeight - 1;
  };

  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(compute);
  };

  // 在元素可用时才注册监听；元素切换/变 null 时断开，避免对旧节点残留监听
  watch(
    el,
    node => {
      cleanupCurrent?.();
      cleanupCurrent = null;
      if (!node) return;
      node.addEventListener("scroll", schedule, { passive: true });
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(node);
      compute();
      cleanupCurrent = () => {
        node.removeEventListener("scroll", schedule);
        resizeObserver?.disconnect();
        resizeObserver = null;
      };
    },
    { flush: "post" },
  );

  onMounted(() => {
    // 首次计算延后到水合后；watch(flush:'post') 已在元素挂载后触发，这里仅兜底无元素时的初值
    compute();
  });

  tryOnScopeDispose(() => {
    cleanupCurrent?.();
    cleanupCurrent = null;
  });

  return { atTop, atBottom };
}
