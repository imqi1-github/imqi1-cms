import { onMounted } from "vue";
import { tryOnScopeDispose } from "@vueuse/core";

/**
 * 全应用共享的单一 scroll 监听 + 单一 rAF 调度器。
 *
 * 各组件原本各自 `addEventListener("scroll", …)` 且零节流，scroll 事件每秒可触发数十次，
 * 每次同步跑 handler。本 composable 把所有订阅者合流到一条链上：
 * scroll 事件只置 dirty flag，每帧最多跑一次 tick，集中读一次 scrollY/innerHeight 再分发给所有订阅者，
 * 避免读写交错导致的 layout thrashing，也避免每组件各开一个 requestAnimationFrame。
 *
 * 行为：订阅时只注册 + 挂监听，**不立即执行回调**；首次执行延后到 onMounted（水合后），
 * 避免在 setup 同步读 window.scrollY 赋值导致 SSR/客户端首帧不一致（scroll restoration 下 isScrolled 等会水合 class mismatch）。
 * 作用域销毁时自动反注册，最后一个订阅者退出时摘除 scroll 监听（懒挂载/卸载）。
 * 仅客户端生效（SSR 无滚动）。
 *
 * 用法：在 <script setup> 顶层调用 `useScrollRaf((scrollY, innerHeight) => { … })`。
 */
const subscribers = new Set<(scrollY: number, innerHeight: number) => void>();
let listening = false;
let rafPending = false;

const runFrame = () => {
  rafPending = false;
  if (subscribers.size === 0) return;
  const scrollY = window.scrollY;
  const innerHeight = window.innerHeight;
  subscribers.forEach(cb => cb(scrollY, innerHeight));
};

const onScroll = () => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(runFrame);
};

const attach = () => {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", onScroll, { passive: true });
};

const detach = () => {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", onScroll);
};

export function useScrollRaf(cb: (scrollY: number, innerHeight: number) => void): void {
  if (import.meta.client) {
    subscribers.add(cb);
    attach();
    // 首次执行延后到 onMounted（水合后）：setup 同步赋值会在 scroll restoration 下
    // 让客户端首帧 isScrolled 等与服务端不一致，触发 hydration class mismatch
    onMounted(() => {
      cb(window.scrollY, window.innerHeight);
    });
  }
  tryOnScopeDispose(() => {
    subscribers.delete(cb);
    if (subscribers.size === 0) detach();
  });
}
