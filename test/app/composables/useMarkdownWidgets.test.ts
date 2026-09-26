import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

// 注:同 useMarkdownImages — Vue runtime-dom doc 是模块级 const,真组件 render 失败。
// 本测试只覆盖「无 wrapper fixture 时 mount/cleanup 不抛」,具体 widget 解析由 dev 验证。

import { useMarkdownWidgets } from "~/composables/useMarkdownWidgets";

let win: Window;
let origUseNuxtApp: unknown;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
  origUseNuxtApp = (globalThis as Record<string, unknown>).useNuxtApp;
  (globalThis as Record<string, unknown>).useNuxtApp = () => ({
    isHydrating: false,
    payload: {},
    vueApp: { _context: { provides: {}, config: {} } },
  });
});

afterEach(() => {
  win.close();
  if (origUseNuxtApp !== undefined) {
    (globalThis as Record<string, unknown>).useNuxtApp = origUseNuxtApp;
  }
});

describe("useMarkdownWidgets", () => {
  test("空 root → 返回 { cleanup } 函数", () => {
    const root = win.document.createElement("div");
    win.document.body.appendChild(root);

    const result = useMarkdownWidgets(root, {
      findImageDimensions: () => ({ width: 0, height: 0 }),
    });
    expect(typeof result.cleanup).toBe("function");
  });

  test("cleanup 多次调用不抛", () => {
    const root = win.document.createElement("div");
    win.document.body.appendChild(root);

    const { cleanup } = useMarkdownWidgets(root, {
      findImageDimensions: () => ({ width: 0, height: 0 }),
    });
    cleanup();
    expect(() => cleanup()).not.toThrow();
    expect(() => cleanup()).not.toThrow();
  });

  test("opts.findImageDimensions 类型契约 → 接受函数返回 { width, height }", () => {
    // 测参数契约:findImageDimensions 被调用时不会因类型不匹配抛
    const root = win.document.createElement("div");
    win.document.body.appendChild(root);

    let called = false;
    const { cleanup } = useMarkdownWidgets(root, {
      findImageDimensions: () => {
        called = true;
        return { width: 100, height: 50 };
      },
    });
    // 无 wrapper fixture 时不会被调,但函数契约应允许这种签名
    expect(typeof cleanup).toBe("function");
    expect(called).toBe(false); // 没 wrapper → 没调用
  });
});