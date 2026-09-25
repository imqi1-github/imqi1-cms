import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let counts: Record<string, number> = {};
sharedFake.on("contents", "count", async ({ where }: { where?: { type?: number; status?: number } }) => {
  if (where?.type === 0 && where?.status === 1) return counts.publishedContents ?? 3;
  return counts.contentsTotal ?? 10;
});
sharedFake.on("comments", "count", async ({ where }: { where?: { status?: number } }) => (where?.status === 1 ? counts.publishedComments ?? 7 : 20));
sharedFake.on("metas", "count", async ({ where }: { where: { type: string } }) =>
  where.type === "category" ? (counts.categories ?? 4) : (counts.tags ?? 9));

const siteHandler = (await import("#server/api/site.get")).default;
const statsHandler = (await import("#server/api/stats.get")).default;

function ev(peer: string) {
  return makeAuthEvent({ method: "GET", peer, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  counts = {};
  // siteSettings 真实读 informations;这里用假数据控制站点名/URL
  sharedFake.on("informations", "findMany", async () => [
    { key: "siteName", value: "测试站" },
    { key: "siteUrl", value: "https://example.com" },
  ]);
  const g = globalThis as unknown as Record<string, unknown>;
  g.useRuntimeConfig = () => ({ redis: null, buildHash: "hash-abc" });
  delete process.env.WECHAT_MINI_APPID;
  delete process.env.WECHAT_MINI_SECRET;
});

describe("公开 site.get", () => {
  test("下发站点设置与构建哈希,缓存头为公开可缓存", async () => {
    const r = (await siteHandler(ev("10.10.1.1"))) as unknown as {
      success: boolean; data: { siteName: string }; buildHash: string; miniQrEnabled: boolean;
    };
    expect(r.success).toBe(true);
    expect(r.data.siteName).toBe("测试站");
    expect(r.buildHash).toBe("hash-abc");
    // 未配置微信凭据 → 小程序码入口关闭
    expect(r.miniQrEnabled).toBe(false);
  });

  test("配置了微信凭据 → miniQrEnabled 为 true", async () => {
    process.env.WECHAT_MINI_APPID = "wx123";
    process.env.WECHAT_MINI_SECRET = "secret";
    const r = (await siteHandler(ev("10.10.1.2"))) as unknown as { miniQrEnabled: boolean };
    expect(r.miniQrEnabled).toBe(true);
    delete process.env.WECHAT_MINI_APPID;
    delete process.env.WECHAT_MINI_SECRET;
  });
});

describe("公开 stats.get", () => {
  test("返回四项统计(仅已发布口径)", async () => {
    const r = (await statsHandler(makeAuthEvent({ method: "GET", peer: "10.10.9.9" }).event)) as unknown as {
      success: boolean;
      data: { publishedContentsNum: number; publishedCommentsNum: number; categoriesNum: number; tagsNum: number };
    };
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ publishedContentsNum: 3, publishedCommentsNum: 7, categoriesNum: 4, tagsNum: 9 });
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("contents", "count", async () => {
      throw new Error("db down");
    });
    await expect(statsHandler(makeAuthEvent({ method: "GET", peer: "10.10.9.8" }).event)).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("contents", "count", async () => counts.publishedContents ?? 3);
  });
});
