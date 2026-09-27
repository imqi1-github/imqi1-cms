/**
 * site-settings.server plugin:
 *  1) 服务端 useRuntimeConfig().buildHash 写入 useState("site:buildHash")
 *  2) miniQrEnabled = Boolean(WECHAT_MINI_APPID && WECHAT_MINI_SECRET)
 *  3) 调 getSiteSettings 写 useState("site:settings"); 已有值 → 早返
 *  4) getSiteSettings 抛错 → 静默 catch(console.error),不外抛
 */
import { readFileSync } from "node:fs";

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
  // 改写 import.meta.server → globalThis 可变量;只对 site-settings.server.ts 生效
  (Bun as unknown as { plugin: (p: unknown) => void }).plugin({
    name: "site-settings-meta-switcher",
    setup(build: { onLoad: (opts: { filter: RegExp }, fn: (a: { path: string }) => { contents: string; loader: string } | undefined) => void }) {
      build.onLoad({ filter: /site-settings\.server\.ts$/ }, (args) => {
        let src = readFileSync(args.path, "utf8");
        src = src.replace(/import\.meta\.server/g, "(__testAsServer)");
        return { contents: src, loader: "ts" };
      });
    },
  });
});

// stateMap 间接引用:plugin 顶部 import 时已调用 useState() 三次,
// 闭包已经拿到旧 stateMap 引用 → 用 globalThis 上的可变对象转发,
// 测试可清空内容而不丢失 plugin 的写入目标。
let stateMap: Map<string, { value: unknown }>;
let getSiteSettingsImpl: () => Promise<unknown>;
let configBuildHash: string | null;
let envAppid: string | undefined;
let envSecret: string | undefined;

function installStubs(): void {
  stateMap = new Map();
  getSiteSettingsImpl = async () => ({
    siteName: "default",
    siteUrl: "https://x",
    commentEnabled: true,
    homeCustomText: "",
  });
  configBuildHash = "abc123";
  envAppid = undefined;
  envSecret = undefined;
  g.__testAsServer = false;
  g.__testGetSiteSettingsImpl = getSiteSettingsImpl;
  g.__testStateMap = stateMap;

  // Nuxt 自动注入 globalThis(defineNuxtPlugin/useState/useRuntimeConfig),
  // plugin 文件直接全局引用 → stub globalThis。
  g.defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;
  g.useState = <T>(key: string, init?: () => T): { value: T } => {
    // 读最新 stateMap(可能已被 beforeEach 重置)
    const map = (g.__testStateMap as Map<string, { value: T }>) ?? new Map();
    let entry = map.get(key);
    if (!entry) {
      entry = { value: init ? init() : null } as { value: T };
      map.set(key, entry);
    }
    return entry as { value: T };
  };
  g.useRuntimeConfig = () => ({ buildHash: configBuildHash });

  // getSiteSettings 走 await import("#server/utils/siteSettings"),需要 mock.module
  mock.module("#server/utils/siteSettings", () => ({
    getSiteSettings: async () => g.__testGetSiteSettingsImpl(),
  }));
}

let plugin: (nuxtApp: unknown) => Promise<unknown>;

beforeAll(async () => {
  installStubs();
  const mod = await import("~/plugins/site-settings.server");
  plugin = mod.default;
});

beforeEach(() => {
  // 替换 stateMap(让 plugin useState 间接引用走新 map),其它全局变量同步刷新
  stateMap = new Map();
  g.__testStateMap = stateMap;
  g.__testAsServer = false;
  g.__testGetSiteSettingsImpl = async () => ({});
  g.useRuntimeConfig = () => ({ buildHash: configBuildHash });
  configBuildHash = "abc123";
  delete process.env.WECHAT_MINI_APPID;
  delete process.env.WECHAT_MINI_SECRET;
});

describe("site-settings.server plugin", () => {
  test("服务端:useRuntimeConfig().buildHash 写入 useState('site:buildHash')", async () => {
    g.__testAsServer = true;
    configBuildHash = "hash-xyz";
    await plugin({});
    expect(stateMap.get("site:buildHash")?.value).toBe("hash-xyz");
  });

  test("服务端:buildHash 为 null 时写入 null(不进 useState 默认 null)", async () => {
    g.__testAsServer = true;
    configBuildHash = null;
    await plugin({});
    expect(stateMap.get("site:buildHash")?.value).toBeNull();
  });

  test("客户端不进 plugin(.server.ts 仅服务端打包)— 此处只覆盖服务端路径", () => {
    // .server.ts 插件被 Nuxt 仅在 server 端打包,客户端不会执行。
    // 该测试只是占位说明,源码层面只有 server 分支。
    expect(true).toBe(true);
  });

  test("服务端 + APPID/SECRET 都在 → miniQrEnabled=true", async () => {
    g.__testAsServer = true;
    envAppid = "wx-appid";
    envSecret = "wx-secret";
    process.env.WECHAT_MINI_APPID = envAppid;
    process.env.WECHAT_MINI_SECRET = envSecret;
    try {
      await plugin({});
      expect(stateMap.get("site:miniQrEnabled")?.value).toBe(true);
    } finally {
      delete process.env.WECHAT_MINI_APPID;
      delete process.env.WECHAT_MINI_SECRET;
    }
  });

  test("服务端 + 缺一 env → miniQrEnabled=false", async () => {
    g.__testAsServer = true;
    process.env.WECHAT_MINI_APPID = "wx-appid";
    delete process.env.WECHAT_MINI_SECRET;
    await plugin({});
    expect(stateMap.get("site:miniQrEnabled")?.value).toBe(false);
  });

  test("服务端 + 两 env 都缺 → miniQrEnabled=false", async () => {
    g.__testAsServer = true;
    delete process.env.WECHAT_MINI_APPID;
    delete process.env.WECHAT_MINI_SECRET;
    await plugin({});
    expect(stateMap.get("site:miniQrEnabled")?.value).toBe(false);
  });

  test("服务端:siteSettings.value 已存在 → 早返,不调 getSiteSettings", async () => {
    g.__testAsServer = true;
    stateMap.set("site:settings", { value: { siteName: "preset" } });
    let called = 0;
    g.__testGetSiteSettingsImpl = async () => { called++; return {}; };
    await plugin({});
    expect(called).toBe(0);
    // 已存在的值不被覆盖
    expect(stateMap.get("site:settings")?.value).toEqual({ siteName: "preset" });
  });

  test("服务端:getSiteSettings 成功 → 写入 useState('site:settings')", async () => {
    g.__testAsServer = true;
    g.__testGetSiteSettingsImpl = async () => ({ siteName: "loaded" });
    await plugin({});
    expect(stateMap.get("site:settings")?.value).toEqual({ siteName: "loaded" });
  });

  test("服务端:getSiteSettings 抛错 → catch 兜底(console.error 调用一次),不外抛", async () => {
    g.__testAsServer = true;
    g.__testGetSiteSettingsImpl = async () => { throw new Error("db down"); };
    const origErr = console.error;
    const errs: unknown[] = [];
    console.error = (...args) => { errs.push(args); };
    try {
      await expect(plugin({})).resolves.toBeUndefined();
      expect(errs).toHaveLength(1);
      expect(stateMap.get("site:settings")?.value).toBeNull(); // 没写入
    } finally {
      console.error = origErr;
    }
  });
});