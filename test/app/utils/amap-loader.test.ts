import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { loadAmap, resolveAmapClientConfig } from "~/utils/amap-loader";

let win: Window;
let origFetch: typeof globalThis.$fetch | undefined;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
  origFetch = (globalThis as { $fetch?: typeof globalThis.$fetch }).$fetch;
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
    if (url === "/api/amap/config") return { key: "k1", securityCode: "js1" };
    return undefined;
  }) as typeof globalThis.$fetch;
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
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => ({})) as typeof globalThis.$fetch;
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
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => ({ key: null, securityCode: undefined })) as typeof globalThis.$fetch;
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
// (amapLoadPromise / loadedVersion / loadedMode / loadedPlugins),bun:test + happy-dom
// 跨 test 难以稳定复位,极易产生状态泄漏。详细 DOM 行为由 dev 手工验证。
// 服务端视角的脚本 URL 拼接见 test/shared/amap-proxy.test.ts。