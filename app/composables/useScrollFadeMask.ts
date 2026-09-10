import { onMounted, ref, watch, type Ref } from "vue";
import { tryOnScopeDispose } from "@vueuse/core";

/**
 * 为可滚动的容器计算"是否已到起端/末端"，用于给两端加羽化(mask)边缘。
 *
 * 约定：
 * - 起端还有内容被藏起来 → atStart=false（该加起端羽化）；
 * - 末端还有内容没露出 → atEnd=false（该加末端羽化）；
 * - 内容不足、无需滚动 → 两端都为 true（不羽化，完整显示）。
 *
 * axis 决定量测轴向：'y' 走 scrollTop/scrollHeight（侧栏），'x' 走 scrollLeft/scrollWidth（横向条）。
 *
 * 监听容器自身 scroll（sticky 侧栏不随 window 滚动，不能复用 window 的 useScrollRaf），
 * scroll 只置 dirty，每帧最多算一次；ResizeObserver 覆盖内容/视口尺寸变化（含从 display:none 恢复）。
 * 首次计算延后到 onMounted（水合后），避免 SSR 首帧 class 不一致。仅客户端生效。
 *
 * 关键：不能只在 onMounted 一次性观察——若容器被 v-if 门控、晚于挂载才出现（如初始 fetch 失败、
 * 点「重试」成功后才渲染侧栏），onMounted 时 el 还是 null 会直接 return，此后永不注册监听。
 * 故改用 watch(el.value)：元素真正可用时再 attach，变回 null 时断开。
 */
export function useScrollFadeMask(el: Readonly<Ref<HTMLElement | null>>, axis: "x" | "y" = "y") {
  const atStart = ref(true);
  const atEnd = ref(true);

  let rafPending = false;
  let resizeObserver: ResizeObserver | null = null;
  let cleanupCurrent: (() => void) | null = null;

  const compute = () => {
    rafPending = false;
    const node = el.value;
    if (!node) return;
    const pos = axis === "y" ? node.scrollTop : node.scrollLeft;
    const size = axis === "y" ? node.clientHeight : node.clientWidth;
    const total = axis === "y" ? node.scrollHeight : node.scrollWidth;
    if (total <= size + 1) {
      atStart.value = true;
      atEnd.value = true;
      return;
    }
    atStart.value = pos <= 1;
    atEnd.value = pos + size >= total - 1;
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
    { flush: "post", immediate: true },
  );

  onMounted(() => {
    // 首次计算延后到水合后；watch(flush:'post') 已在元素挂载后触发，这里仅兜底无元素时的初值
    compute();
  });

  tryOnScopeDispose(() => {
    cleanupCurrent?.();
    cleanupCurrent = null;
  });

  return { atStart, atEnd };
}
