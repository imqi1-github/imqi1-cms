import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { createFakePrisma } from "#test/helpers/fake-prisma";

const SITE_URL = "https://example.com";

// prisma 用假件:精确控制文章/设置数据,断言 RSS 输出的确定性形状
const fake = createFakePrisma();
fake.on("informations", "findMany", () => [
  { key: "siteName", value: "测试站" },
  { key: "siteUrl", value: SITE_URL },
]);
fake.on("contents", "findMany", () => [
  {
    cid: 1,
    slug: "hello",
    title: "你好 ]]> 世界",
    desc: "摘要",
    content: "# 标题\n\n正文**加粗**",
    create_time: new Date("2026-01-01T00:00:00Z"),
    covers: JSON.stringify([{ url: "/uploads/a.jpg", title: "封面一", width: 100, height: 50 }]),
    user: { nickname: "阿棋", name: "admin" },
    contentrelations: [{ metas: { slug: "note" } }],
  },
  {
    cid: 2,
    slug: "live",
    title: "实况文",
    desc: "",
    content: "",
    create_time: new Date("2026-02-01T00:00:00Z"),
    covers: JSON.stringify([{ url: "/uploads/v.mp4" }]),
    user: { nickname: null, name: "admin" },
    contentrelations: [],
  },
]);
mock.module("#server/utils/prisma", () => ({ prisma: fake.prisma }));

const handler = (await import("#server/routes/feed.get")).default as unknown as (e: unknown) => Promise<string>;

async function run() {
  const headers: Record<string, string> = {};
  const event = {
    node: {
      req: { url: "/feed", headers: {} },
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

describe("feed.get(集成:prisma 假件 → RSS 管线)", () => {
  let xml = "";
  let headers: Record<string, string> = {};

  test("准备:调用 handler", async () => {
    const r = await run();
    xml = r.xml;
    headers = r.headers;
    expect(xml).toContain("<rss");
  });

  test("channel 头来自 DB 设置,XML 骨架完整", () => {
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<![CDATA[测试站]]>");
    expect(xml).toContain(`<link>${SITE_URL}</link>`);
    expect(xml).toContain("zh-CN");
  });

  test("文章链接取第一个分类 slug,author 取 nickname 回落 name", () => {
    expect(xml).toContain(`<link>${SITE_URL}/content/note/hello</link>`);
    expect(xml).toContain("<![CDATA[阿棋]]>");
  });

  test("CDATA 内容里的 ]]> 被安全拆分", () => {
    expect(xml).toContain("你好 ]]]]><![CDATA[> 世界");
  });

  test("正文经 markdownToPlainText 转纯文本(无 markdown 标记)", () => {
    expect(xml).not.toContain("# 标题");
    expect(xml).not.toContain("**加粗**");
  });

  test("图片封面出 media:content(含宽高与 title),视频封面不出", () => {
    expect(xml).toContain("media:content url=\"/uploads/a.jpg\"");
    expect(xml).toContain("type=\"image/jpeg\"");
    expect(xml).toContain("width=\"100\"");
    expect(xml).toContain("title=\"封面一\"");
    expect(xml).not.toContain("media:content url=\"/uploads/v.mp4\"");
  });

  test("无关联分类回落 default slug", () => {
    expect(xml).toContain(`${SITE_URL}/content/default/live`);
  });

  test("响应头:rss+xml + 短缓存", () => {
    expect(headers["content-type"]).toContain("application/rss+xml");
    expect(headers["cache-control"]).toBeTruthy();
  });
});
