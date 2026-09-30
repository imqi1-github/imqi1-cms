import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

import { siteConfig } from "~~/site.config";

const handler = (await import("#server/middleware/referer-check")).default as (e: unknown) => unknown;

// 造最小 event:setResponseStatus 写 node.res.statusCode,headers 直接放 node.req.headers
function makeEvent(url: string, headers: Record<string, string> = {}) {
  const res: Record<string, unknown> = {};
  const event = {
    node: {
      req: { url, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) },
      res,
    },
  };
  return { event, res };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SECRET = process.env.SSR_INTERNAL_REQUEST_SECRET;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_SECRET === undefined) delete process.env.SSR_INTERNAL_REQUEST_SECRET;
  else process.env.SSR_INTERNAL_REQUEST_SECRET = ORIGINAL_SECRET;
});

// bun test 下 NODE_ENV=test,handler 会走完整校验;须排除环境恰为 development 的可能
if (ORIGINAL_NODE_ENV === "development") {
  process.env.NODE_ENV = "test";
}

const domain = siteConfig.security.allowedRefererDomains[0]!;

describe("referer-check:放行分支", () => {
  test("开发环境整体跳过(即便无 referer)", () => {
    process.env.NODE_ENV = "development";
    const { event, res } = makeEvent("/api/links");
    expect(handler(event)).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV === "development" ? "development" : "test";
  });

  test.each(["/", "/content/note/1", "/feed", "/sitemap.xml"])("非 /api 路径 %s 跳过", url => {
    const { event, res } = makeEvent(url);
    expect(handler(event)).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test("/api/mini 及子路径跳过(带查询串也命中)", () => {
    for (const url of ["/api/mini", "/api/mini/contents", "/api/mini/content/1?x=1"]) {
      const { event, res } = makeEvent(url);
      expect(handler(event)).toBeUndefined();
      expect(res.statusCode).toBeUndefined();
    }
  });

  test("/api/_nuxt_icon 跳过(图标端点无敏感数据)", () => {
    const { event, res } = makeEvent("/api/_nuxt_icon/lucide:check.svg");
    expect(handler(event)).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test("SSR 内部头与密钥一致时放行(无 referer 也行)", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "s3cret";
    const { event, res } = makeEvent("/api/links", { "x-ssr-internal-request": "s3cret" });
    expect(handler(event)).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test("白名单域名与子域名的 referer 放行", () => {
    for (const referer of [`https://${domain}/page`, `https://sub.${domain}/page`]) {
      const { event, res } = makeEvent("/api/links", { referer });
      expect(handler(event)).toBeUndefined();
      expect(res.statusCode).toBeUndefined();
    }
  });
});

describe("referer-check:拦截分支(均 403 + 空串)", () => {
  test("无 referer", () => {
    const { event, res } = makeEvent("/api/links");
    expect(handler(event)).toBe("");
    expect(res.statusCode).toBe(403);
  });

  test("外域 referer", () => {
    const { event, res } = makeEvent("/api/links", { referer: "https://evil.example.com/x" });
    expect(handler(event)).toBe("");
    expect(res.statusCode).toBe(403);
  });

  test("SSR 头与密钥不一致时回落 referer 校验(缺 referer 即 403)", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "s3cret";
    const { event, res } = makeEvent("/api/links", { "x-ssr-internal-request": "wrong" });
    expect(handler(event)).toBe("");
    expect(res.statusCode).toBe(403);
  });

  test("SSR 头正确但未配置密钥时不放行(fail-closed)", () => {
    delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    const { event, res } = makeEvent("/api/links", { "x-ssr-internal-request": "whatever" });
    expect(handler(event)).toBe("");
    expect(res.statusCode).toBe(403);
  });
});
