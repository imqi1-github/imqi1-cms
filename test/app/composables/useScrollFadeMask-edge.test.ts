/**
 * useScrollFadeMask 补测:覆盖更多边界(axis='x'/无容器/scroll/尺寸变化等)
 *  - 注意:测试环境 import.meta.client=false → onMounted 不挂监听,atStart/atEnd 默认 true
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { ref } from "vue";

import { useScrollFadeMask } from "~/composables/useScrollFadeMask";

let win: Window;
const origWarn = console.warn;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    ResizeObserver: win.ResizeObserver,
  });
  // 抑制 Vue dev 警告
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("[Vue warn]")) return;
    origWarn(...(args as Parameters<typeof origWarn>));
  };
});
afterEach(() => {
  win.close();
  console.warn = origWarn;
});

function setLayout(el: HTMLElement, layout: { clientHeight: number; scrollHeight: number; clientWidth: number; scrollWidth: number; scrollTop?: number; scrollLeft?: number }) {
  Object.defineProperty(el, "clientHeight", { configurable: true, value: layout.clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: layout.scrollHeight });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: layout.clientWidth });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: layout.scrollWidth });
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: layout.scrollTop ?? 0 });
  Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: layout.scrollLeft ?? 0 });
}

describe("useScrollFadeMask y 轴默认行为", () => {
  test("无容器 → atStart=true, atEnd=true(默认空状态)", () => {
    const el = ref<HTMLElement | null>(null);
    const { atStart, atEnd } = useScrollFadeMask(el);
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(true);
  });

  test("容器内容超出 + scrollTop=0 → atStart=true, atEnd=false", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "y");
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(false);
  });

  test("容器内容超出 + scrollTop=中间 → atStart=false, atEnd=false", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 100 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "y");
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(false);
  });

  test("容器内容超出 + scrollTop=底部 → atStart=false, atEnd=true", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 200 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "y");
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(true);
  });

  test("内容等于容器 → atStart=true, atEnd=true(无需滚动)", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 100 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "y");
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(true);
  });

  test("scrollTop=1(容差 ±1)→ atStart=true(顶部)", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 300, clientWidth: 100, scrollWidth: 100, scrollTop: 1 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart } = useScrollFadeMask(el, "y");
    expect(atStart.value).toBe(true);
  });
});

describe("useScrollFadeMask x 轴", () => {
  test("水平方向:scrollLeft=中间 → 走 x 轴", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 500, scrollLeft: 200 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "x");
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(false);
  });

  test("水平方向:scrollLeft=0 → atStart=true", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 500, scrollLeft: 0 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "x");
    expect(atStart.value).toBe(true);
    expect(atEnd.value).toBe(false);
  });

  test("水平方向:scrollLeft=最大 → atEnd=true", () => {
    const div = win.document.createElement("div");
    setLayout(div, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 500, scrollLeft: 400 });
    win.document.body.appendChild(div);
    const el = ref<HTMLElement | null>(div);
    const { atStart, atEnd } = useScrollFadeMask(el, "x");
    expect(atStart.value).toBe(false);
    expect(atEnd.value).toBe(true);
  });
});

describe("useScrollFadeMask tryOnScopeDispose 安全调用", () => {
  test("返回 { atStart, atEnd } 不含 cleanup(composable 设计为 useNuxtApp 作用域自动回收)", () => {
    const el = ref<HTMLElement | null>(null);
    const r = useScrollFadeMask(el);
    expect(Object.keys(r).sort()).toEqual(["atEnd", "atStart"]);
  });

  test("重复创建多个独立实例互不影响", () => {
    const el1 = ref<HTMLElement | null>(null);
    const el2 = ref<HTMLElement | null>(null);
    const r1 = useScrollFadeMask(el1, "y");
    const r2 = useScrollFadeMask(el2, "x");
    expect(r1.atStart).not.toBe(r2.atStart);
    expect(r1.atEnd).not.toBe(r2.atEnd);
  });
});