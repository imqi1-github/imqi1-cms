/**
 * server/routes/sitemap.xml.get.ts 集成测:
 *  - 必含 9 个静态页面 + 文章/分类/标签的 <url>
 *  - 跳过空 slug 与硬编码 slug 重复(DB 页 slug='messages' 不出第二条)
 *  - Cache-Control 短缓存
 *  - DB 异常 → 500
 *  - 已带 statusCode 错误原样上抛
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const sitemapHandler = (await import("#server/routes/sitemap.xml.get")).default;

function ev() {
  return makeAuthEvent({ method: "GET", peer: "10.30.2.1", url: "/sitemap.xml" }).event;
}

function seedSite(siteUrl: string) {
  // getSiteSettings 走 informations.findMany(批量取 settings),不是 findUnique。
  // --isolate 下本文件独立 mock prisma,findMany handler 不会被其它测试继承,必须自己注册。
  const allRows = [{ key: "siteUrl", value: siteUrl }];
  sharedFake.on("informations", "findMany", async () => allRows);
  sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) => {
    if (where.key === "siteUrl") return { value: siteUrl };
    return null;
  });
  // getSiteSettings 还查其它 key,默认全 null
}

describe("routes/sitemap.xml.get:结构", () => {
  test("基础静态页面全在(首页/搜索/留言/友链/地图/关于/协议/更新日志/订阅/RSS/归档)", async () => {
    seedSite("https://example.com");
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("metas", "findMany", async () => []);
    const xml = (await sitemapHandler(ev())) as unknown as string;
    expect(xml).toMatch(/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
    for (const path of ["/", "/search", "/messages", "/links", "/map", "/about", "/agreement", "/changelogs", "/subscribes", "/feed", "/archiving"]) {
      expect(xml).toContain(`<loc>https://example.com${path}</loc>`);
    }
  });

  test("文章 → /content/<分类 slug>/<文章 slug>(无分类兜底 uncategorized)", async () => {
    seedSite("https://example.com");
    sharedFake.on("metas", "findMany", async () => []);
    sharedFake.on("contents", "findMany", async ({ where }: { where: { type?: number } }) => {
      if (where.type === 0) return [
        { slug: "with-cat", update_time: new Date("2026-04-01"), contentrelations: [{ metas: { slug: "note" } }] },
        { slug: "no-cat", update_time: new Date("2026-04-02"), contentrelations: [] },
        { slug: "", update_time: new Date(), contentrelations: [] }, // 跳过空 slug
      ];
      return [];
    });
    const xml = (await sitemapHandler(ev())) as unknown as string;
    expect(xml).toContain("<loc>https://example.com/content/note/with-cat</loc>");
    expect(xml).toContain("<loc>https://example.com/content/uncategorized/no-cat</loc>");
    expect(xml).not.toContain("/content/uncategorized/\">"); // 空 slug 不应出现
  });

  test("页面 slug 与硬编码静态路由冲突 → 跳过(避免重复 <loc>)", async () => {
    seedSite("https://example.com");
    sharedFake.on("metas", "findMany", async () => []);
    sharedFake.on("contents", "findMany", async ({ where }: { where: { type?: number } }) => {
      if (where.type === 1) return [
        { slug: "messages", update_time: new Date() }, // 与硬编码冲突 → 跳
        { slug: "my-page", update_time: new Date() }, // 不冲突 → 出
      ];
      return [];
    });
    const xml = (await sitemapHandler(ev())) as unknown as string;
    // messages 仅硬编码一条(已是 /messages),不应再出 my-page 等
    expect((xml.match(/<loc>https:\/\/example\.com\/messages<\/loc>/g) ?? []).length).toBe(1);
    expect(xml).toContain("<loc>https://example.com/my-page</loc>");
  });

  test("分类 + 标签各自走 /category/<slug> 与 /tag/<slug>", async () => {
    seedSite("https://example.com");
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("metas", "findMany", async ({ where }: { where: { type: string } }) => {
      if (where.type === "category") return [{ slug: "cat-a" }];
      if (where.type === "tag") return [{ slug: "tag-x" }];
      return [];
    });
    const xml = (await sitemapHandler(ev())) as unknown as string;
    expect(xml).toContain("<loc>https://example.com/category/cat-a</loc>");
    expect(xml).toContain("<loc>https://example.com/tag/tag-x</loc>");
  });
});

describe("routes/sitemap.xml.get:响应头与异常", () => {
  test("Content-Type=application/xml + Cache-Control 短缓存", async () => {
    seedSite("https://example.com");
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("metas", "findMany", async () => []);
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.30.2.2", url: "/sitemap.xml" });
    await sitemapHandler(event);
    expect(headers["content-type"]).toMatch(/application\/xml/);
    expect(headers["cache-control"]).toBeTruthy();
  });

  test("DB 异常 → 500", async () => {
    seedSite("https://example.com");
    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    await expect(sitemapHandler(ev())).rejects.toMatchObject({ statusCode: 500 });
  });

  test("已带 statusCode 的错误原样上抛(非通用 500 盖掉)", async () => {
    // getSiteSettings 内置 try/catch 会吞错,这里改从 contents.findMany 抛,触发外层 catch
    sharedFake.on("contents", "findMany", async () => { throw Object.assign(new Error("teapot"), { statusCode: 418 }); });
    await expect(sitemapHandler(ev())).rejects.toMatchObject({ statusCode: 418 });
  });
});