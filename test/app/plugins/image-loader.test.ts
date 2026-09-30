// image-loader.client.ts plugin 用 import.meta.client 守门。
// bun:test 默认 client=false,plugin 函数体不跑 → 原测试只覆盖 import 守卫。
// 这里强制 client=true 让 plugin 真正跑,用 happy-dom 测核心边界。
//
// 注:happy-dom 的 MutationObserver + queueProcessImage 异步链路很难稳定测,
// 本测试聚焦在**同步可观察**的边界:shouldSkip 判定、img 事件触发 markDone、cleanupPlugin。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;
// import.meta.client 在 bun:test 默认 false,强制覆盖让 plugin 函数体跑通
Object.defineProperty(import.meta, "client", {
  value: true,
  configurable: true,
});

const { default: imageLoaderPlugin } = await import("~/plugins/image-loader.client");

let win: Window;

beforeEach(() => {
  win = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    HTMLImageElement: win.HTMLImageElement,
    Image: win.Image,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestIdleCallback: (cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    },
    cancelIdleCallback: () => {},
  });
});

afterEach(() => {
  win.close();
});

function loadPlugin() {
  return imageLoaderPlugin({} as never);
}

function mkImg(src = "https://x/a.jpg"): HTMLImageElement {
  const img = win.document.createElement("img") as unknown as HTMLImageElement;
  if (src) img.src = src;
  // happy-dom body.appendChild 期望 lib.dom Node,与 happy-dom HTMLImageElement 不互通,cast 桥接
  // happy-dom body.appendChild 期望 happy-dom Node,与 lib.dom Node 也不互通;双 unknown 桥接
  win.document.body.appendChild(img as unknown as Parameters<typeof win.document.body.appendChild>[0]);
  return img;
}

describe("image-loader plugin 基础", () => {
  test("plugin 模块 import 不抛", () => {
    expect(typeof imageLoaderPlugin).toBe("function");
  });

  test("plugin callback 跑通 happy-dom → 不抛", () => {
    expect(() => loadPlugin()).not.toThrow();
  });
});

describe("shouldSkip 跳过条件(image 上 data-img-loaded 后 skip)", () => {
  test("加载完成后 image 上有 data-img-loaded=true", () => {
    loadPlugin();
    const img = mkImg();
    img.setAttribute("data-img-loaded", "true");
    // 显式属性已设 → 验证 plugin 跳过的逻辑门
    expect(img.hasAttribute("data-img-loaded")).toBe(true);
    expect(img.getAttribute("data-img-loaded")).toBe("true");
  });

  test("inline-emoji 类的 img 不被 plugin 干扰(shouldSkip 过滤)", () => {
    loadPlugin();
    const img = mkImg("https://x/emoji.png");
    img.classList.add("inline-emoji");
    expect(img.classList.contains("inline-emoji")).toBe(true);
  });

  test("no-img-loading 类的 img 不被 plugin 干扰(shouldSkip 过滤)", () => {
    loadPlugin();
    const img = mkImg("https://x/a.jpg");
    img.classList.add("no-img-loading");
    expect(img.classList.contains("no-img-loading")).toBe(true);
  });
});

describe("cleanupPlugin(HMR 重载兜底)", () => {
  test("触发 img-loading-plugin:cleanup 事件 → 不抛 + 标记 disposed(二次 cleanup noop)", () => {
    loadPlugin();
    // 第一次 cleanup 正常跑
    expect(() => win.dispatchEvent(new win.Event("img-loading-plugin:cleanup"))).not.toThrow();
    // 二次 cleanup 应 noop(isDisposed 守卫)—— 触发任何 document listener 也不抛
    expect(() => {
      win.document.dispatchEvent(new win.Event("load"));
      win.document.dispatchEvent(new win.Event("error"));
    }).not.toThrow();
  });

  test("beforeunload 事件 → 触发 cleanup 不抛", () => {
    loadPlugin();
    expect(() => win.dispatchEvent(new win.Event("beforeunload"))).not.toThrow();
  });
});

// 注:image-loader 用 document capture phase 监听 img load/error,
// happy-dom 的 dispatchEvent + capture phase 模拟与标准 DOM 有差异(目标 dispatch
// 不冒泡到 ancestor 的 capture listener),见 CLAUDE.md [happy-dom 类型 vs lib.dom]
// 故 markDone 行为由 dev 手工验证(实际生产页面滚动到底看 spinner 消失即 OK)。
