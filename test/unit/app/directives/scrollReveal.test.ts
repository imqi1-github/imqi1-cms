// scrollReveal directive 边界:
//   getSSRProps(noTransform modifier) → 同时返回 data-scroll-reveal 和 data-no-transform
//   mounted:数据属性 + CSS var + transition-delay + IntersectionObserver observe
//   unmounted:unobserve + 清理回调
//
// 注:真实 IntersectionObserver 跨阈值复用、回调触发由 dev 手工验证(需要真视口)。
// happy-dom 不实现 IntersectionObserver,测试用最小 stub。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import scrollRevealDirective from "~/directives/scrollReveal";

// scrollRevealDirective 的 vue 类型是 FunctionDirective(无 getSSRProps/mounted/unmounted 字段),
// 通过 unknown 桥接绕过 Function vs Object directive 类型窄化,真实方法存在运行时调用即可
const dir = scrollRevealDirective as unknown as {
  getSSRProps: (binding: { modifiers?: Record<string, boolean>; value?: { noTransform?: boolean } }) => Record<string, string>;
  mounted: (el: HTMLElement, binding: { value?: Record<string, unknown>; modifiers?: Record<string, boolean> }) => void;
  unmounted: (el: HTMLElement) => void;
};

let win: Window;

// happy-dom 不实现 IntersectionObserver,装最小 stub 收集 observe 调用
// 注:scrollReveal 模块内部 observerCache 是模块级 Map,跨 test 累积;
// 如果每个 beforeEach 换 class reference 会导致 cache miss。stub 提到模块顶层复用同一 class。
class StubIntersectionObserver {
  static instances: StubIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit;
  observed: Array<Element> = [];
  constructor(cb: IntersectionObserverCallback, opts: IntersectionObserverInit = {}) {
    this.callback = cb;
    this.options = opts;
    StubIntersectionObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(target: Element): void {
    this.observed = this.observed.filter(t => t !== target);
  }
  disconnect(): void {
    this.observed = [];
  }
  fireIntersect(target: Element): void {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  win = new Window({ url: "http://localhost/" });
  StubIntersectionObserver.instances = [];
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    IntersectionObserver: StubIntersectionObserver as unknown as typeof IntersectionObserver,
  });
});

afterEach(() => {
  win.close();
});

function makeEl(): HTMLElement {
  // happy-dom 的 HTMLElement 与 lib.dom 不互通,cast 兼容
  return win.document.createElement("div") as unknown as HTMLElement;
}

function mountBinding(value: Record<string, unknown> | undefined, modifiers: Record<string, boolean> = {}) {
  return { value, modifiers, instance: null, oldValue: null, arg: null, dir: null } as never;
}

describe("scrollReveal.getSSRProps — SSR 降级属性", () => {
  test("无 noTransform modifier → 仅返回 { data-scroll-reveal: '' }", () => {
    const r = dir.getSSRProps({ modifiers: {}, value: undefined });
    expect(r).toEqual({ "data-scroll-reveal": "" });
  });

  test("noTransform modifier → 同时返回 data-no-transform", () => {
    const r = dir.getSSRProps({ modifiers: { noTransform: true }, value: undefined });
    expect(r).toEqual({ "data-scroll-reveal": "", "data-no-transform": "" });
  });

  test("value.noTransform=true 也触发 data-no-transform(modifier 优先级低于 value)", () => {
    const r = dir.getSSRProps({ modifiers: {}, value: { noTransform: true } });
    expect(r).toEqual({ "data-scroll-reveal": "", "data-no-transform": "" });
  });

  test("modifiers.noTransform=true 优先于 value.noTransform=false → 仍加 data-no-transform", () => {
    const r = dir.getSSRProps({ modifiers: { noTransform: true }, value: { noTransform: false } });
    expect(r).toEqual({ "data-scroll-reveal": "", "data-no-transform": "" });
  });
});

describe("scrollReveal.mounted — DOM 属性 + CSS 变量", () => {
  function mountBinding(value: Record<string, unknown> | undefined, modifiers: Record<string, boolean> = {}) {
    return { value, modifiers, instance: null, oldValue: null, arg: null, dir: null } as never;
  }

  test("基础 mount → 设 data-scroll-reveal", () => {
    const el = makeEl();
    dir.mounted(el, mountBinding(undefined));
    expect(el.getAttribute("data-scroll-reveal")).toBe("");
  });

  test("noTransform → 同时设 data-no-transform", () => {
    const el = makeEl();
    dir.mounted(el, mountBinding(undefined, { noTransform: true }));
    expect(el.getAttribute("data-no-transform")).toBe("");
  });

  test("translateY 选项 → 设 CSS var --scroll-reveal-y", () => {
    const el = makeEl();
    dir.mounted(el, mountBinding({ translateY: 30 }));
    expect(el.style.getPropertyValue("--scroll-reveal-y")).toBe("30px");
  });

  test("delay 选项 → 设 transition-delay", () => {
    const el = makeEl();
    dir.mounted(el, mountBinding({ delay: 200 }));
    expect(el.style.transitionDelay).toBe("200ms");
  });

  test("threshold + rootMargin 选项 → 创建对应 IntersectionObserver", () => {
    const observers: Array<{ opts: IntersectionObserverInit }> = [];
    class CollectObserver {
      opts: IntersectionObserverInit;
      observed: Element[] = [];
      constructor(_cb: IntersectionObserverCallback, opts: IntersectionObserverInit = {}) {
        this.opts = opts;
        observers.push({ opts });
      }
      observe(_t: Element): void {}
      unobserve(_t: Element): void {}
      disconnect(): void {}
    }
    (globalThis as Record<string, unknown>).IntersectionObserver = CollectObserver as never;

    const el = makeEl();
    dir.mounted(el, mountBinding({ threshold: 0.5, rootMargin: "100px" }));
    expect(observers.length).toBeGreaterThanOrEqual(1); // 模块级 cache 可能复用
    expect(observers[observers.length - 1]!.opts.threshold).toBe(0.5);
    expect(observers[observers.length - 1]!.opts.rootMargin).toBe("100px");
  });

  test("重复 mount 不抛(observer cache 跨 test 累积是模块级设计,行为由 e2e 验证)", () => {
    class TrackingObserver {
      observed: Element[] = [];
      observe(t: Element): void { this.observed.push(t); }
      unobserve(_t: Element): void {}
      disconnect(): void {}
    }
    (globalThis as Record<string, unknown>).IntersectionObserver = TrackingObserver as never;

    const el1 = makeEl();
    const el2 = makeEl();
    expect(() => dir.mounted(el1, mountBinding({ threshold: 0.3 }))).not.toThrow();
    expect(() => dir.mounted(el2, mountBinding({ threshold: 0.3 }))).not.toThrow();
  });
});

describe("scrollReveal.unmounted — 清理", () => {
  test("unmount → 从 observer unobserve + 清理回调(不抛)", () => {
    class TrackingObserver {
      cb: IntersectionObserverCallback;
      opts: IntersectionObserverInit;
      observed: Element[] = [];
      constructor(cb: IntersectionObserverCallback, opts: IntersectionObserverInit = {}) {
        this.cb = cb;
        this.opts = opts;
      }
      observe(t: Element): void { this.observed.push(t); }
      unobserve(_t: Element): void {}
      disconnect(): void {}
    }
    (globalThis as Record<string, unknown>).IntersectionObserver = TrackingObserver as never;

    const el = makeEl();
    dir.mounted(el, mountBinding({}));
    expect(() => dir.unmounted(el)).not.toThrow();
  });
});
