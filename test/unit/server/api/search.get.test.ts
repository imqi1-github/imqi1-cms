import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// redis 用 null(搜索缓存的 false 分支);搜索设置返回空 → cacheEnabled false
mockSharedPrisma();
mock.module("#server/utils/redis", () => ({ redis: null }));
sharedFake.on("informations", "findMany", () => []);
sharedFake.on("informations", "findUnique", () => null);
sharedFake.on("contents", "findFirst", () => null);
sharedFake.on("contents", "findMany", () => [
  {
    cid: 100,
    title: "Bun 测试指南",
    slug: "bun-guide",
    desc: "关于 bun 的文章",
    content: "<p>这是一篇讲 bun 的长文,关键词出现在这里</p>",
    create_time: new Date("2026-05-01T00:00:00Z"),
    contentrelations: [{ metas: { name: "笔记", slug: "note" } }],
  },
]);
sharedFake.on("subscribes", "findMany", () => []);
sharedFake.on("links", "findMany", () => [
  { id: 9, name: "bun 官方", link: "javascript:alert(1)", desc: "恶意链接", avatar: null },
]);
sharedFake.on("comments", "findMany", () => []);
sharedFake.on("subscribeposts", "findMany", () => []);

const handler = (await import("#server/api/search.get")).default as unknown as (
  e: unknown,
) => Promise<{ code: number; message: string; data: { results: Array<Record<string, unknown>>; total: number; query: string; type: string } }>;

function call(url: string) {
  return handler({ path: url, node: { req: { url, headers: {} } } });
}

describe("search.get:typedApi zod 校验", () => {
  test("缺 q 抛 400(查询参数验证失败)", async () => {
    await expect(call("/api/search?type=content")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("q 超 100 字符抛 400", async () => {
    await expect(call(`/api/search?q=${"a".repeat(101)}`)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("search.get:净化与空结果短路", () => {
  test("纯空白 q 净化为空后短路返回空结果", async () => {
    const r = await call("/api/search?q=%20%20");
    expect(r.code).toBe(200);
    expect(r.data.results).toEqual([]);
    expect(r.data.query).toBe("");
  });

  test("危险字符被剥除,保留中英文数字", async () => {
    const r = await call("/api/search?q=" + encodeURIComponent("bun';drop--"));
    expect(r.data.query).not.toContain("'");
    expect(r.data.query).not.toContain(";");
    expect(r.data.query).toContain("bun");
    expect(r.data.query).toContain("drop");
  });
});

describe("search.get:文章分支(content)", () => {
  const callContent = () => call("/api/search?q=" + encodeURIComponent("bun"));

  test("命中文章:分类来自第一个 category 关系,highlight 带 <mark>", async () => {
    const r = await callContent();
    expect(r.data.type).toBe("content");
    const item = r.data.results[0]!;
    expect(item.cid).toBe(100);
    expect(item.categorySlug).toBe("note");
    expect(String(item.highlight)).toContain("<mark>");
  });

  test("highlight 对正文 HTML 先剥标签再转义", async () => {
    const r = await callContent();
    const item = r.data.results[0]!;
    expect(String(item.highlight)).not.toContain("<p>");
  });
});

describe("search.get:友链分支(subscribe)与外链净化", () => {
  test("kind=link 且 javascript: 链接被净化(防 RSS 投毒)", async () => {
    const r = await call("/api/search?q=" + encodeURIComponent("官方") + "&type=subscribe");
    const item = r.data.results.find(x => x.kind === "link");
    expect(item).toBeTruthy();
    expect(String(item?.url)).not.toContain("javascript:");
  });
});
