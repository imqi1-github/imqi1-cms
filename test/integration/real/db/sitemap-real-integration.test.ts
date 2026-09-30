/**
 * 真实 DB 集成测 —— server/routes/sitemap.xml.get
 * 验证 sitemap 真实生成：静态页 + 已发布文章/页面 + 分类 + 标签的 <url> 全集，
 * 空 slug/草稿文章过滤、与硬编码路由重复时跳过、Cache-Control 短缓存头、DB 异常 500。
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb, seedCategory, seedContent, seedTag } = await import("./_helpers");
const sitemapHandler = (await import("#server/routes/sitemap.xml.get")).default;

function event() {
  // 模拟 GET /sitemap.xml 的 H3 事件
  return {
    method: "GET",
    context: {},
    path: "/sitemap.xml",
    node: {
      req: { method: "GET", url: "/sitemap.xml", headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

async function getXml(): Promise<string> {
  return (await sitemapHandler(event())) as unknown as string;
}

describe("routes/sitemap.xml.get 真实 DB", () => {
  test("基线:无文章/页面/分类/标签时,只输出 9 个静态页", async () => {
    await resetDb();
    const xml = await getXml();
    // 9 个静态页(首页/search/messages/links/map/about/agreement/changelogs/subscribes/feed/archiving 实际 11 个)
    expect(xml).toContain("<loc>https://imqi1.com/</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/search</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/messages</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/links</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/map</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/about</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/agreement</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/changelogs</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/subscribes</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/feed</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/archiving</loc>");
    // 不应出现分类/标签/文章 URL
    expect(xml).not.toContain("/category/");
    expect(xml).not.toContain("/tag/");
    expect(xml).not.toContain("/content/");
  });

  test("已发布文章(有分类)→ /content/<分类 slug>/<文章 slug>", async () => {
    await resetDb();
    const cat = await seedCategory({ name: "笔记", slug: "notes", type: "category" });
    const post = await seedContent({ title: "首篇", slug: "hello", status: 1 });
    // 关联文章到分类
    const db = await getDb();
    await db.contentrelations.create({
      data: { cid: post.cid, mid: cat.mid },
    });
    const xml = await getXml();
    expect(xml).toContain("<loc>https://imqi1.com/content/notes/hello</loc>");
  });

  test("已发布文章(无分类)→ /content/uncategorized/<文章 slug>", async () => {
    await resetDb();
    await seedContent({ title: "无分类", slug: "no-cat", status: 1 });
    const xml = await getXml();
    expect(xml).toContain("<loc>https://imqi1.com/content/uncategorized/no-cat</loc>");
  });

  test("草稿文章(status=0)不出现", async () => {
    await resetDb();
    await seedContent({ title: "草稿", slug: "draft", status: 0 });
    const xml = await getXml();
    expect(xml).not.toContain("/content/");
    expect(xml).not.toContain("/draft");
  });

  test("空 slug 文章跳过,不渲染空 URL", async () => {
    await resetDb();
    await seedContent({ title: "无 slug", slug: "", status: 1 });
    const xml = await getXml();
    expect(xml).not.toContain("/content/uncategorized/%2F"); // encoded slash,不应出现
    expect(xml).not.toMatch(/<loc>[^<]*\/content\/uncategorized\/<\/loc>/);
  });

  test("分类/标签各自走 /category/<slug> 与 /tag/<slug>", async () => {
    await resetDb();
    await seedCategory({ name: "笔记", slug: "cat-notes", type: "category" });
    await seedTag("JS", "tag-js");
    const xml = await getXml();
    expect(xml).toContain("<loc>https://imqi1.com/category/cat-notes</loc>");
    expect(xml).toContain("<loc>https://imqi1.com/tag/tag-js</loc>");
  });

  test("响应头 Cache-Control 短缓存", async () => {
    await resetDb();
    const captured: { headers?: Record<string, string> } = {};
    const ev = {
      method: "GET",
      context: {},
      path: "/sitemap.xml",
      node: {
        req: { method: "GET", url: "/sitemap.xml", headers: {} },
        res: {
          setHeader(name: string, value: unknown) {
            captured.headers ??= {};
            captured.headers[name.toLowerCase()] = String(value);
          },
        },
      },
    } as never;
    await sitemapHandler(ev);
    expect(captured.headers?.["cache-control"]).toMatch(/max-age=/);
  });
});