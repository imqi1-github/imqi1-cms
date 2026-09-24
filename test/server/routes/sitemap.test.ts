import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { sharedFake } from "#test/helpers/fake-prisma";

const SITE_URL = "https://sitemap-test.example.com/";

// prisma 假件:文章(1 篇正常 + 1 篇无 slug)/页面(1 个自定义 + 1 个硬编码 slug)/分类/标签
const fake = sharedFake;
fake.on("contents", "findMany", (args: { where: { type: number } }) => {
  if (args.where.type === 0) {
    return [
      {
        slug: "post-a",
        update_time: new Date("2026-03-01T00:00:00Z"),
        contentrelations: [{ metas: { slug: "note" } }],
      },
      {
        slug: "",
        update_time: new Date("2026-03-02T00:00:00Z"),
        contentrelations: [],
      },
    ];
  }
  return [
    { slug: "custom-page", update_time: new Date("2026-04-01T00:00:00Z") },
    { slug: "messages", update_time: new Date("2026-04-02T00:00:00Z") },
  ];
});
fake.on("metas", "findMany", (args: { where: { type: string } }) => {
  if (args.where.type === "category") return [{ slug: "note" }, { slug: "" }];
  return [{ slug: "life" }];
});
mock.module("#server/utils/prisma", () => ({ prisma: fake.prisma }));
mock.module("#server/utils/siteSettings", () => ({
  getSiteSettings: async () => ({ siteUrl: SITE_URL }),
}));

const handler = (await import("#server/routes/sitemap.xml.get")).default as (e: unknown) => Promise<string>;

async function run() {
  const headers: Record<string, string> = {};
  const event = {
    node: {
      req: { url: "/sitemap.xml", headers: {} },
      res: {
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
        },
        getHeaders: () => headers,
      },
    },
  };
  const xml = (await handler(event)) as string;
  return { xml, headers };
}

describe("sitemap.xml.get(集成:prisma/siteSettings 假件 → sitemap 管线)", () => {
  let xml = "";
  let headers: Record<string, string> = {};

  test("准备:调用 handler", async () => {
    const r = await run();
    xml = r.xml;
    headers = r.headers;
    expect(xml).toContain("<urlset");
  });

  test("XML 骨架与 baseUrl 去尾斜杠", () => {
    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(xml).toContain("http://www.sitemaps.org/schemas/sitemap/0.9");
    expect(xml).toContain("<loc>https://sitemap-test.example.com/</loc>");
    expect(xml).not.toContain("example.com//");
  });

  test("静态页齐全:search/messages/links/map/about/agreement/changelogs/subscribes/feed/archiving", () => {
    for (const p of ["search", "messages", "links", "map", "about", "agreement", "changelogs", "subscribes", "feed", "archiving"]) {
      expect(xml).toContain(`<loc>https://sitemap-test.example.com/${p}</loc>`);
    }
  });

  test("文章:有 slug 的入表并取第一个分类,无 slug 的跳过", () => {
    expect(xml).toContain("<loc>https://sitemap-test.example.com/content/note/post-a</loc>");
    expect(xml).toContain("<lastmod>2026-03-01</lastmod>");
    // 无 slug 的第二篇不入表:全部 /content/ 条目只有 post-a 一条
    expect((xml.match(/<loc>[^<]*\/content\//g) ?? []).length).toBe(1);
  });

  test("页面:DB 自定义页入表,与硬编码重复的 messages 不重复生成", () => {
    expect((xml.match(/<loc>https:\/\/sitemap-test\.example\.com\/messages<\/loc>/g) ?? []).length).toBe(1);
    expect(xml).toContain("<loc>https://sitemap-test.example.com/custom-page</loc>");
  });

  test("空 slug 的分类/标签跳过,正常生成的带 /category /tag 前缀", () => {
    expect(xml).toContain("/category/note<");
    expect(xml).toContain("/tag/life<");
    expect(xml).not.toContain("/category/<");
    expect(xml).not.toContain("/tag/<");
  });

  test("响应头:application/xml + 缓存头", () => {
    expect(headers["content-type"]).toContain("application/xml");
    expect(headers["cache-control"]).toBeTruthy();
  });
});
