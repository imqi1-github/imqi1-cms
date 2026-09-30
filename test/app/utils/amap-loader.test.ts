import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { _resetAmapLoaderStateForTest, loadAmap, resolveAmapClientConfig } from "~/utils/amap-loader";

let win: Window;
let origFetch: typeof globalThis.$fetch | undefined;

beforeEach(() => {
  win = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
  origFetch = (globalThis as { $fetch?: typeof globalThis.$fetch }).$fetch;
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
    if (url === "/api/amap/config") return { key: "k1", securityCode: "js1" };
    return undefined;
  }) as unknown as typeof globalThis.$fetch;
});

afterEach(() => {
  win.close();
  if (origFetch) {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch;
  }
});

describe("resolveAmapClientConfig", () => {
  test("bun:test 非 PROD → 走直连 /api/amap/config 分支,取 key/securityCode", async () => {
    const cfg = await resolveAmapClientConfig();
    expect(cfg.useProxy).toBe(false);
    expect(cfg.key).toBe("k1");
    expect(cfg.securityJsCode).toBe("js1");
  });

  test("/api/amap/config 缺 key/securityCode → 用空串兜底(避免 undefined 字符串)", async () => {
    const origFetch2 = (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch;
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => ({})) as unknown as typeof globalThis.$fetch;
    try {
      const cfg = await resolveAmapClientConfig();
      expect(cfg.key).toBe("");
      expect(cfg.securityJsCode).toBe("");
    } finally {
      (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch2;
    }
  });

  test("/api/amap/config key 为 null → 兜底为空串", async () => {
    const origFetch2 = (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch;
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => ({ key: null, securityCode: undefined })) as unknown as typeof globalThis.$fetch;
    try {
      const cfg = await resolveAmapClientConfig();
      expect(cfg.key).toBe("");
      expect(cfg.securityJsCode).toBe("");
    } finally {
      (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch2;
    }
  });
});

describe("loadAmap 入口守卫", () => {
  test("直连模式缺 key → 抛 'key and securityJsCode are required'", async () => {
    await expect(loadAmap({
      useProxy: false,
      key: "",
      securityJsCode: "",
    })).rejects.toThrow(/key and securityJsCode are required/);
  });

  test("直连模式缺 securityJsCode → 同样抛", async () => {
    await expect(loadAmap({
      useProxy: false,
      key: "k",
      securityJsCode: "",
    })).rejects.toThrow(/key and securityJsCode are required/);
  });

  test("SSR(无 window/document)→ 抛 'AMap can only be loaded in the browser'", async () => {
    const origWin = (globalThis as Record<string, unknown>).window;
    const origDoc = (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
    try {
      await expect(loadAmap()).rejects.toThrow(/only be loaded in the browser/);
    } finally {
      if (origWin !== undefined) (globalThis as Record<string, unknown>).window = origWin;
      if (origDoc !== undefined) (globalThis as Record<string, unknown>).document = origDoc;
    }
  });
});

// 注:loadAmap script 注入 + 回调触发 + 单例复用等行为依赖模块级单例状态
// (amapLoadPromise / loadedVersion / loadedMode / loadedPlugins),
// 每个边界 test 在 beforeEach 调用 _resetAmapLoaderStateForTest() 复位,
// 再用 happy-dom 模拟 script.onload/onerror 触发回调。
// 服务端视角的脚本 URL 拼接见 test/shared/amap-proxy.test.ts。

describe("loadAmap 单例与版本守卫", () => {
  beforeEach(() => {
    _resetAmapLoaderStateForTest();
    // 预设 win.AMap 让 loadAmap 走"复用"分支(line 86-90),无需触发 callback 即可同步 resolve。
    (win as unknown as { AMap: { plugin: (n: string[], cb: () => void) => void } }).AMap = {
      plugin: () => {},
    };
  });

  test("已加载 v2.0 后再加载 v1.5 → 抛版本冲突", async () => {
    await loadAmap({ version: "2.0", useProxy: true });
    await expect(loadAmap({ version: "1.5", useProxy: true })).rejects.toThrow(/Cannot mix version/);
  });

  test("已 proxy 加载后切直连模式 → 抛模式冲突", async () => {
    await loadAmap({ useProxy: true });
    await expect(loadAmap({ useProxy: false, key: "k", securityJsCode: "s" })).rejects.toThrow(/already loaded in proxy mode/);
  });

  test("已直连加载后切 proxy 模式 → 抛模式冲突", async () => {
    await loadAmap({ useProxy: false, key: "k", securityJsCode: "s" });
    await expect(loadAmap({ useProxy: true })).rejects.toThrow(/already loaded in direct mode/);
  });

  test("同版本同模式连续两次 → 复用单例,不重新注入 script", async () => {
    const sCountBefore = win.document.querySelectorAll("script").length;
    const first = await loadAmap({ useProxy: true });
    // 走复用分支:无 script 注入
    expect(win.document.querySelectorAll("script").length).toBe(sCountBefore);
    const second = await loadAmap({ useProxy: true });
    expect(second).toBe(first);
  });
});

describe("loadAmap script 回调边界(模拟 callback/error)", () => {
  beforeEach(() => {
    _resetAmapLoaderStateForTest();
    // 不预设 AMap,让 loadAmap 走 script 注入分支
  });

  test("callback 成功 → resolve win.AMap,清掉全局 callback key", async () => {
    const promise = loadAmap({ useProxy: true });
    await new Promise<void>(r => setTimeout(r, 0));
    // 模拟高德 script 加载完成:设 AMap 后触发 callback
    (win as unknown as { AMap: unknown }).AMap = { plugin: () => {} };
    (win as unknown as Record<string, () => void>)["__amapScriptLoaded"]?.();
    const result = await promise;
    expect(result).toBeDefined();
    // 成功后清掉 callback key(避免污染)
    expect((win as unknown as Record<string, unknown>)["__amapScriptLoaded"]).toBeUndefined();
  });

  test("callback 带 error 参数 → reject error(且清掉 script 节点+callback key)", async () => {
    const sCountBefore = win.document.querySelectorAll("script").length;
    const promise = loadAmap({ useProxy: true });
    await new Promise<void>(r => setTimeout(r, 0));
    const sAdded = win.document.querySelectorAll("script").length - sCountBefore;
    expect(sAdded).toBe(1);

    const error = new Error("CSP blocked");
    (win as unknown as Record<string, (e?: unknown) => void>)["__amapScriptLoaded"]?.(error);

    await expect(promise).rejects.toBe(error);
    expect(win.document.querySelectorAll("script").length).toBe(sCountBefore);
    expect((win as unknown as Record<string, unknown>)["__amapScriptLoaded"]).toBeUndefined();
    // 模块单例应被 reset,下次 loadAmap 可重新加载
    const promise2 = loadAmap({ useProxy: true });
    await new Promise<void>(r => setTimeout(r, 0));
    expect(win.document.querySelectorAll("script").length).toBe(sCountBefore + 1);
    (win as unknown as Record<string, () => void>)["__amapScriptLoaded"]?.();
    await promise2;
  });

  test("script.onerror → reject 'Failed to load the proxied AMap script.'", async () => {
    const promise = loadAmap({ useProxy: true });
    await new Promise<void>(r => setTimeout(r, 0));
    // 模拟 script 节点 onerror 触发
    const script = win.document.querySelectorAll("script")[win.document.querySelectorAll("script").length - 1] as unknown as HTMLScriptElement | undefined;
    if (script && typeof script.onerror === "function") {
      script.onerror(new Event("error"));
    }
    await expect(promise).rejects.toThrow(/Failed to load the proxied AMap script/);
  });
});

describe("loadAmap plugin 加载", () => {
  beforeEach(() => {
    _resetAmapLoaderStateForTest();
  });

  test("plugins=['Scale','ToolBar'] → 调 AMap.plugin 加载缺失插件", async () => {
    const pluginCalls: string[][] = [];
    (win as unknown as { AMap: { plugin: (names: string[], cb: () => void) => void } }).AMap = {
      plugin: (names: string[], cb: () => void) => {
        pluginCalls.push(names);
        cb();
      },
    };
    await loadAmap({ useProxy: true, plugins: ["Scale", "ToolBar"] });
    expect(pluginCalls).toEqual([["Scale", "ToolBar"]]);
  });

  test("plugins 含 falsy 项 → 过滤掉", async () => {
    const pluginCalls: string[][] = [];
    (win as unknown as { AMap: { plugin: (names: string[], cb: () => void) => void } }).AMap = {
      plugin: (names, cb) => {
        pluginCalls.push(names);
        cb();
      },
    };
    await loadAmap({
      useProxy: true,
      plugins: ["Scale", "", undefined as unknown as string, "ToolBar"],
    });
    expect(pluginCalls).toEqual([["Scale", "ToolBar"]]);
  });

  test("AMap.plugin 不存在 → 抛 'AMap.plugin is not available.'", async () => {
    (win as unknown as { AMap: Record<string, unknown> }).AMap = {};
    await expect(loadAmap({ useProxy: true, plugins: ["Scale"] })).rejects.toThrow(/AMap.plugin is not available/);
  });
});