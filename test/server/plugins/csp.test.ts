import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

import { siteConfig } from "~~/site.config";

// CSP_ENABLED 在插件模块顶层按 NODE_ENV 求值:必须在 import 前切到 production
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

const plugin = (await import("#server/plugins/csp")).default as (app: unknown) => unknown;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

// 假 nitroApp:捕获注册的 render:response 钩子
let hooked: { name: string; fn: (response: { body: unknown }, ctx: { event: unknown }) => void } | null = null;
const nitroApp = {
  hooks: {
    hook(name: string, fn: (response: { body: unknown }, ctx: { event: unknown }) => void) {
      hooked = { name, fn };
    },
  },
};

describe("csp 插件(生产环境)", () => {
  test.skipIf(!siteConfig.security.enableCsp)("站点开启 CSP 时注册 render:response 钩子并对 SSR HTML 投递头", () => {
    plugin(nitroApp);
    expect(hooked?.name).toBe("render:response");

    const headers: Record<string, string> = {};
    const event = { node: { req: { headers: {} }, res: { setHeader(n: string, v: string) { headers[n.toLowerCase()] = v; } } } };
    hooked!.fn({ body: "<html></html>" }, { event });
    const csp = headers["content-security-policy"];
    expect(typeof csp).toBe("string");
    expect(csp!.length).toBeGreaterThan(0);
    expect(csp).toContain("default-src");
  });

  test("响应体非字符串(如二进制)时不投递 CSP 头", () => {
    const headers: Record<string, string> = {};
    const event = { node: { req: { headers: {} }, res: { setHeader(n: string, v: string) { headers[n.toLowerCase()] = v; } } } };
    hooked!.fn({ body: new Uint8Array([1, 2, 3]) }, { event });
    expect(headers["content-security-policy"]).toBeUndefined();
  });
});
