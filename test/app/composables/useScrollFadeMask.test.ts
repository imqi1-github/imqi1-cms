import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { effectScope, nextTick, ref } from "vue";

import { useScrollFadeMask } from "~/composables/useScrollFadeMask";

// happy-dom 提供 DOM API 但每实例隔离;每个 test 起新 Window、挂到 globalThis。
// (一次性 Window 跨测试会被 ResizeObserver/scroll listener 残留污染,难以复位)
let win: Window;

// 用 effectScope 包跑 useScrollFadeMask 可消除 Vue 的 onMounted/onUnmounted
// "no active component instance" dev 警告(setup 外的生命周期钩子触发);
// Vue lifecycle 的真实调用还是 dev 模式,console.warn 会刷屏 → 过滤仅 [Vue warn] 前缀。
const origWarn = console.warn;
beforeEach(() => {
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("[Vue warn]")) return;
    origWarn(...(args as Parameters<typeof origWarn>));
  };
});
afterEach(() => {
  console.warn = origWarn;
});

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    ResizeObserver: win.ResizeObserver,
    requestAnimationFrame: (cb: (time: number) => void) => win.requestAnimationFrame(cb),
    cancelAnimationFrame: (handle: number) => win.cancelAnimationFrame(handle as unknown as never),
    matchMedia: win.matchMedia.bind(win),
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    getComputedStyle: win.getComputedStyle.bind(win),
  });
});

afterEach(() => {
  win.close();
});

// 给一个 element 强行覆盖布局相关尺寸(避免 happy-dom 默认 0/相等的不可触发条件)
function setLayout(
  el: { __brand?: never } & object,
  layout: { clientHeight: number; scrollHeight: number; clientWidth: number; scrollWidth: number; scrollTop?: number; scrollLeft?: number },
): void {
  Object.defineProperty(el, "clientHeight", { configurable: true, value: layout.clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: layout.scrollHeight });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: layout.clientWidth });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: layout.scrollWidth });
  Object.defineProperty(el, "scrollTop", { configurable: true, value: layout.scrollTop ?? 0, writable: true });
  Object.defineProperty(el, "scrollLeft", { configurable: true, value: layout.scrollLeft ?? 0, writable: true });
}

// 等待 rAF 链(compute 由 requestAnimationFrame 调度)解析完
async function flushRaf(): Promise<void> {
  await new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => resolve());
  });
}

describe("useScrollFadeMask", () => {
  // 用 effectScope 包一层,让 onMounted/onUnmounted 有当前 scope,
  // 避免 Vue dev 模式 "no active component instance" 警告刷屏。
  // 返回 scope,让需要后续触发响应(改 ref)的测试自己在 finally 里 stop。
  const startScope = (): { run: <T,>(fn: () => T) => T | undefined; stop: () => void } => {
    const scope = effectScope();
    return { run: <T,>(fn: () => T) => scope.run(fn), stop: () => scope.stop() };
  };

  test("el=null 时 atStart/atEnd 默认为 true(无需滚动)", () => {
    type HE = InstanceType<typeof win.HTMLElement>;
    const elRef = ref<HE | null>(null);
    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(elRef as unknown as Parameters<typeof useScrollFadeMask>[0]))!;
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(true);
    s.stop();
  });

  test("y 轴:内容超出且 scrollTop=0 时 atStart=true, atEnd=false", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "y"))!;
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(false);
    s.stop();
  });

  test("y 轴:滚到中部时 atStart=false, atEnd=false", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 80 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "y"))!;
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(false);
    s.stop();
  });

  test("y 轴:滚到底部时 atStart=false, atEnd=true", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 200 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "y"))!;
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(true);
    s.stop();
  });

  test("内容不足(scrollHeight ≤ clientHeight + 1)时 atStart=true, atEnd=true(无需滚动)", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 100 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "y"))!;
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(true);
    s.stop();
  });

  test("x 轴:走 scrollLeft/scrollWidth 测横向滚动", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 500, scrollLeft: 400 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "x"))!;
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(true);
    s.stop();
  });

  test("scroll 事件触发 schedule → rAF → compute,更新 atEnd 状态", async () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 0 });
    win.document.body.appendChild(div);

    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(ref(div), "y"))!;
    expect(atEnd.value).toBe(false);

    div.scrollTop = 200;
    div.dispatchEvent(new win.Event("scroll"));
    await flushRaf();
    expect(atEnd.value).toBe(true);
    expect(atStart.value).toBe(false);
    s.stop();
  });

  test("el 由 null 变 div 时 watch 触发 attach + compute", async () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100 });
    win.document.body.appendChild(div);

    type HE = InstanceType<typeof win.HTMLElement>;
    const elRef = ref<HE | null>(null);
    const s = startScope();
    const { atStart, atEnd } = s.run(() => useScrollFadeMask(elRef as unknown as Parameters<typeof useScrollFadeMask>[0], "y"))!;
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(true);

    elRef.value = div;
    await nextTick();
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(false);
    s.stop();
  });
});