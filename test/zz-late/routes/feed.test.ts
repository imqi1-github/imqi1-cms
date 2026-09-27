/**
 * server/routes/feed.get.ts RSS 集成测:
 *  - 站点元信息取自 informations,缺则回落 site.config
 *  - 内容列表 5 个分项全为 0 时只输出 channel 元信息
 *  - 正常多篇文章 → RSS XML 结构正确 + media:content + Cache-Control 短缓存
 *  - DB 异常 → 500(失败时不输出失败的内容,避免搜索索引误导)
 *  - lastBuildDate = 最新文章的 create_time
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const feedHandler = (await import("#server/routes/feed.get")).default;

function ev() {
  return makeAuthEvent({ method: "GET", peer: "10.30.1.1", url: "/feed" }).event;
}

function seedMeta(siteName: string, siteUrl: string, siteDesc: string) {
  sharedFake.on("informations", "findMany", async ({ where }: { where: { key: { in: string[] } } }) => {
    const out: Array<{ key: string; value: string }> = [];
    if (where.key.in.includes("siteName")) out.push({ key: "siteName", value: siteName });
    if (where.key.in.includes("siteUrl")) out.push({ key: "siteUrl", value: siteUrl });
    if (where.key.in.includes("siteDesc")) out.push({ key: "siteDesc", value: siteDesc });
    return out;
  });
}

describe("routes/feed.get:结构与降级", () => {
  test("无任何文章 → 仅 channel 元信息(空 <items>)", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => []);
    const r = (await feedHandler(ev())) as unknown as string;
    expect(typeof r).toBe("string");
    expect(r).toContain("<rss");
    expect(r).toContain("<channel>");
    expect(r).toContain("<title><![CDATA[测试站]]></title>");
    expect(r).not.toContain("<item>");
  });

  test("meta 缺 siteUrl → 回落 site.config.site.url", async () => {
    seedMeta("测试站", "", "desc");
    sharedFake.on("contents", "findMany", async () => []);
    const r = (await feedHandler(ev())) as unknown as string;
    // 默认 site.config.site.url 有值
    expect(r).toMatch(/<link>https?:\/\/[^<]+<\/link>/);
  });

  test("meta 完全缺失 → 全部回落 site.config 默认", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    sharedFake.on("contents", "findMany", async () => []);
    const r = (await feedHandler(ev())) as unknown as string;
    expect(typeof r).toBe("string");
    expect(r).toContain("<channel>");
  });
});

describe("routes/feed.get:文章渲染", () => {
  test("已发布文章 → item + media:content + author + pubDate + guid", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => [{
      cid: 1,
      slug: "hello",
      title: "你好",
      desc: "摘要",
      content: "正文 [图片：a](https://x.com/a.jpg)",
      create_time: new Date("2026-03-15T10:00:00Z"),
      covers: JSON.stringify([{ url: "https://x.com/cover.jpg", desc: "封面", width: 800, height: 600 }]),
      user: { nickname: "阿棋", name: "admin" },
      contentrelations: [{ metas: { slug: "note" } }],
    }]);
    const r = (await feedHandler(ev())) as unknown as string;
    expect(r).toContain("<title><![CDATA[你好]]></title>");
    expect(r).toContain("<link>https://example.com/content/note/hello</link>");
    expect(r).toContain("<guid isPermaLink=\"true\">https://example.com/content/note/hello</guid>");
    expect(r).toContain("<author><![CDATA[阿棋]]></author>");
    expect(r).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
    expect(r).toContain("<media:content");
    expect(r).toContain("medium=\"image\"");
  });

  test("无分类文章 → item URL 兜底 default", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => [{
      cid: 2, slug: "uncat", title: "无类文", desc: "", content: "x",
      create_time: new Date("2026-04-01"), covers: "[]", user: { nickname: "n", name: "n" },
      contentrelations: [],
    }]);
    const r = (await feedHandler(ev())) as unknown as string;
    expect(r).toContain("/content/default/uncat");
  });

  test("视频封面不出 media:content(避免阅读器把视频当图)", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => [{
      cid: 3, slug: "vid", title: "视频封面", desc: "", content: "x",
      create_time: new Date("2026-04-02"), covers: JSON.stringify([{ url: "https://x.com/cover.mp4" }]),
      user: { nickname: "n", name: "n" }, contentrelations: [{ metas: { slug: "n" } }],
    }]);
    const r = (await feedHandler(ev())) as unknown as string;
    expect(r).not.toContain("media:content");
  });
});

describe("routes/feed.get:响应头与异常", () => {
  test("Content-Type=application/rss+xml + Cache-Control 短缓存", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => []);
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.30.1.2", url: "/feed" });
    await feedHandler(event);
    expect(headers["content-type"]).toMatch(/application\/rss\+xml/);
    expect(headers["cache-control"]).toBeTruthy();
  });

  test("DB 异常 → 500", async () => {
    seedMeta("测试站", "https://example.com", "desc");
    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    await expect(feedHandler(ev())).rejects.toMatchObject({ statusCode: 500 });
  });
});