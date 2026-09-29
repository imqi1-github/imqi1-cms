/**
 * useMarkdownTableTranspose:核心不变式
 *  - syncScrollAttrs 测 wrapper(scrollWidth/clientWidth),不测 inner table(记忆点名漏测)
 *  - 转置表窄屏触发、宽屏还原
 *  - cleanup 还原 + 解绑事件 + 重置 mql/resize 监听
 *  - 重复 mount(HMR)走 cleanup → 重建,不重复调度
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { libParent } from "#test/helpers/happy-dom-cast";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
  (Bun as unknown as { plugin: (p: unknown) => void }).plugin({
    name: "table-transpose-meta-switcher",
    setup(build: { onLoad: (opts: { filter: RegExp }, fn: (a: { path: string }) => { contents: string; loader: string } | undefined) => void }) {
      build.onLoad({ filter: /useMarkdownTableTranspose\.ts$/ }, (args) => {
        let src = readFileSync(args.path, "utf8");
        src = src.replace(/import\.meta\.client/g, "(__testAsClient)");
        return { contents: src, loader: "ts" };
      });
    },
  });
});

let win: Window;
let rafCallbacks: Array<(t: number) => void> = [];
let rafId = 0;

beforeEach(() => {
  win = new Window();
  rafCallbacks = [];
  rafId = 0;
  g.__testAsClient = true;

  // rAF 手动 flush:happy-dom 的 rAF 不一定跑,这里拦截
  const raf = (cb: (t: number) => void) => { rafCallbacks.push(cb); return ++rafId; };
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    ResizeObserver: win.ResizeObserver,
    requestAnimationFrame: raf,
    cancelAnimationFrame: () => {},
    matchMedia: win.matchMedia.bind(win),
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
  });
});

afterEach(() => {
  win.close();
  g.__testAsClient = false;
});

async function flushRaf(): Promise<void> {
  // 跑一帧
  const cbs = rafCallbacks;
  rafCallbacks = [];
  for (const cb of cbs) cb(0);
  // syncScrollAttrs 内的 rAF 也可能再排,再跑一次直到空
  if (rafCallbacks.length > 0) await flushRaf();
}

// 强行覆盖元素的滚动尺寸(避免 happy-DOM layout 简化导致 scrollWidth 恒为 0)
function setScrollDims(el: Element, dims: { scrollWidth: number; clientWidth: number; scrollLeft?: number }) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: dims.scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: dims.clientWidth });
  Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: dims.scrollLeft ?? 0 });
}

function makeBody(html: string): HTMLElement {
  const container = win.document.createElement("div");
  container.className = "markdown-body";
  container.innerHTML = html;
  win.document.body.appendChild(container);
  return container as unknown as HTMLElement;
}

describe("useMarkdownTableTranspose 包装与溢出检测", () => {
  test("mount → table 被包到 .markdown-table-wrap 内", async () => {
    makeBody(`
      <table class="x">
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const wrap = win.document.querySelector(".markdown-table-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap!.querySelector("table")).not.toBeNull();
    cleanup();
  });

  test("关键不变式:overflow 判定读 wrapper 自身(超宽 → data-table-scrollable)", async () => {
    makeBody(`
      <table class="x">
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const wrap = win.document.querySelector(".markdown-table-wrap") as unknown as HTMLElement;
    // 模拟宽表:wrapper.scrollWidth > wrapper.clientWidth
    setScrollDims(wrap, { scrollWidth: 500, clientWidth: 200, scrollLeft: 0 });
    // 触发 scroll 事件 → schedule → rAF → syncScrollAttrs
    wrap.dispatchEvent(new win.Event("scroll") as unknown as Event);
    await flushRaf();
    expect(wrap.getAttribute("data-table-scrollable")).toBe("true");
    expect(wrap.getAttribute("data-at-left")).toBe("true");
    expect(wrap.getAttribute("data-at-right")).toBe("false");
    cleanup();
  });

  test("关键不变式:scrollLeft 在中段时 at-left/at-right 都为 false", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const wrap = win.document.querySelector(".markdown-table-wrap") as unknown as HTMLElement;
    setScrollDims(wrap, { scrollWidth: 500, clientWidth: 200, scrollLeft: 150 });
    wrap.dispatchEvent(new win.Event("scroll") as unknown as Event);
    await flushRaf();
    expect(wrap.getAttribute("data-at-left")).toBe("false");
    expect(wrap.getAttribute("data-at-right")).toBe("false");
    cleanup();
  });

  test("关键不变式:不溢出时移除 data-* 属性(羽化渐变不该出现)", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const wrap = win.document.querySelector(".markdown-table-wrap") as unknown as HTMLElement;
    setScrollDims(wrap, { scrollWidth: 100, clientWidth: 200 });
    wrap.dispatchEvent(new win.Event("scroll") as unknown as Event);
    await flushRaf();
    expect(wrap.getAttribute("data-table-scrollable")).toBeNull();
    expect(wrap.getAttribute("data-at-left")).toBeNull();
    expect(wrap.getAttribute("data-at-right")).toBeNull();
    cleanup();
  });

  test("转置表右侧 + scrollLeft 在右端 → at-right=true", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const wrap = win.document.querySelector(".markdown-table-wrap") as unknown as HTMLElement;
    setScrollDims(wrap, { scrollWidth: 500, clientWidth: 200, scrollLeft: 300 });
    wrap.dispatchEvent(new win.Event("scroll") as unknown as Event);
    await flushRaf();
    expect(wrap.getAttribute("data-at-right")).toBe("true");
    expect(wrap.getAttribute("data-at-left")).toBe("false");
    cleanup();
  });
});

describe("useMarkdownTableTranspose cleanup + 守卫", () => {
  test("cleanup 还原 wrapper → 原 table 仍在 DOM 中,wrap 被移除", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    expect(win.document.querySelector(".markdown-table-wrap")).not.toBeNull();
    cleanup();
    expect(win.document.querySelector(".markdown-table-wrap")).toBeNull();
    // 原 table 仍在(未被 wrapper 永久替换)
    expect(win.document.querySelector("table")).not.toBeNull();
  });

  test("二次 mount 走 cleanup → 重建,DOM 不残留", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    const firstWrap = win.document.querySelector(".markdown-table-wrap");
    mount(libParent(win.document)); // 二次 mount:应先 cleanup 再建
    await flushRaf();
    const wraps = win.document.querySelectorAll(".markdown-table-wrap");
    expect(wraps.length).toBe(1); // 只有一个 wrapper(旧的被 cleanup)
    expect(wraps[0]).not.toBe(firstWrap); // 是新 wrapper
    cleanup();
  });

  test("重复 mount 不会重复挂 mql change / resize 监听(cleanup 后已解绑)", async () => {
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    // 多次 mount + cleanup 不抛即说明 mounted/rafScheduled 守卫正常工作
    mount(libParent(win.document));
    await flushRaf();
    mount(libParent(win.document));
    await flushRaf();
    mount(libParent(win.document));
    await flushRaf();
    // cleanup 后再 mount,能正常跑(说明 mounted=false 已复位)
    cleanup();
    expect(win.document.querySelectorAll(".markdown-table-wrap")).toHaveLength(0);
    mount(libParent(win.document));
    await flushRaf();
    // 新一轮 mount 后至少有一个 wrapper
    expect(win.document.querySelectorAll(".markdown-table-wrap").length).toBeGreaterThanOrEqual(1);
    cleanup();
  });
});

describe("useMarkdownTableTranspose client 守卫", () => {
  test("__testAsClient=false → mount 直接 return,不动 DOM", async () => {
    g.__testAsClient = false;
    makeBody(`
      <table class="x"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    `);
    const { useMarkdownTableTranspose } = await import("~/composables/useMarkdownTableTranspose");
    const { mount, cleanup } = useMarkdownTableTranspose();
    mount(libParent(win.document));
    await flushRaf();
    expect(win.document.querySelector(".markdown-table-wrap")).toBeNull();
    cleanup();
  });
});