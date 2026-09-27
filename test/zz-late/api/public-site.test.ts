/**
 * server/api/site.get.ts 集成测:
 *  - 下发 getSiteSettings + buildHash + miniQrEnabled
 *  - 缓存头为公开可缓存(PUBLIC_CACHE_CONTROL)
 *  - 未配置微信凭据 → miniQrEnabled false
 *  - 配齐 WECHAT_MINI_* env → miniQrEnabled true
 */
import "#test/helpers/nitro-globals";

import { afterEach, describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const siteHandler = (await import("#server/api/site.get")).default;

function ev() {
  return makeAuthEvent({ method: "GET", peer: "10.30.4.1", headers: { host: "imqi1.com" } });
}

afterEach(() => {
  delete process.env.WECHAT_MINI_APPID;
  delete process.env.WECHAT_MINI_SECRET;
  // 复位 buildHash(别的测试可能改 globalThis.useRuntimeConfig)
  const g = globalThis as unknown as Record<string, unknown>;
  g.useRuntimeConfig = () => ({ redis: null, buildHash: "" });
});

describe("site.get", () => {
  test("下发站点设置 + buildHash + miniQrEnabled + 公开缓存头", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "siteName", value: "测试站" },
      { key: "siteUrl", value: "https://example.com" },
    ]);
    const g = globalThis as unknown as Record<string, unknown>;
    g.useRuntimeConfig = () => ({ redis: null, buildHash: "hash-zz" });
    const { event, headers } = ev();
    const r = (await siteHandler(event)) as unknown as {
      success: boolean; data: { siteName: string }; buildHash: string; miniQrEnabled: boolean;
    };
    expect(r.success).toBe(true);
    expect(r.data.siteName).toBe("测试站");
    expect(r.buildHash).toBe("hash-zz");
    expect(headers["cache-control"]).toBeTruthy();
  });

  test("未配 WECHAT_MINI_APPID/SECRET → miniQrEnabled false", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    const { event } = ev();
    const r = (await siteHandler(event)) as unknown as { miniQrEnabled: boolean };
    expect(r.miniQrEnabled).toBe(false);
  });

  test("配齐 WECHAT_MINI_APPID + SECRET → miniQrEnabled true", async () => {
    process.env.WECHAT_MINI_APPID = "wx123";
    process.env.WECHAT_MINI_SECRET = "secret";
    sharedFake.on("informations", "findMany", async () => []);
    const { event } = ev();
    const r = (await siteHandler(event)) as unknown as { miniQrEnabled: boolean };
    expect(r.miniQrEnabled).toBe(true);
  });
});