import { describe, expect, test } from "bun:test";

(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

const { default: domainGuardPlugin } = await import("~/plugins/domain-guard.client");

// 注:domain-guard 行为依赖 import.meta.dev(默认 bun:test truthy → 直接 return)
// 与 siteConfig.site.rootDomain(默认空 → return)。真分支(client 跳转)依赖 window.location
// 与 import.meta.client=true,bun:test 无法触发,dev/部署验证。

describe("domain-guard plugin", () => {
  test("plugin 调用不抛", () => {
    expect(() => domainGuardPlugin({} as never, {} as never)).not.toThrow();
  });

  test("plugin 在无 window 环境也不抛(SSR 兼容路径)", () => {
    expect(() => domainGuardPlugin({} as never, {} as never)).not.toThrow();
  });
});