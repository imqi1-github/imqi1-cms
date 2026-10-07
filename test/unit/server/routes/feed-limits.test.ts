/**
 * Feed 扩展路由条数上限(回归:category/tag 曾全量拉文章含 content 大字段、
 * comments 全量吐 XML,订阅器轮询即全表扫描)。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let capturedContentFindMany: Array<Record<string, unknown>> = [];
let capturedCommentsFindMany: Array<Record<string, unknown>> = [];

sharedFake.on("informations", "findMany", () => [{ key: "siteUrl", value: "https://example.com" }]);
sharedFake.on("metas", "findFirst", async ({ where }: { where: { slug: string; type: string } }) =>
  where.type === "category"
    ? { mid: 7, name: "分类甲", slug: where.slug, desc: "" }
    : { mid: 8, name: "标签甲", slug: where.slug, desc: "" });
sharedFake.on("contents", "findMany", async (args: Record<string, unknown>) => {
  capturedContentFindMany.push(args);
  return [{
    cid: 1, slug: "hello", title: "你好", desc: "摘要", content: "正文",
    create_time: new Date("2026-01-01T00:00:00Z"), covers: null,
    user: { nickname: "阿棋", name: "admin" },
    contentrelations: [{ metas: { slug: "cat" } }],
  }];
});
sharedFake.on("contents", "findFirst", async () => ({
  cid: 1, slug: "hello", title: "你好",
  contentrelations: [{ metas: { slug: "cat" } }],
}));
sharedFake.on("comments", "findMany", async (args: Record<string, unknown>) => {
  capturedCommentsFindMany.push(args);
  return [{
    coid: 1, cid: 1, name: "访客", content: "留言", create_time: new Date("2026-01-02T00:00:00Z"),
  }];
});

beforeEach(() => {
  capturedContentFindMany = [];
  capturedCommentsFindMany = [];
});

function routeEvent(params: Record<string, string>) {
  return {
    context: { params },
    node: {
      req: { url: "/feed/x", headers: {} },
      res: { setHeader() {}, getHeaders: () => ({}) },
    },
  } as never;
}

describe("feed 扩展路由条数上限", () => {
  test("category feed:contents.findMany 带 take=50", async () => {
    const handler = (await import("#server/routes/feed/category/[slug].get")).default;
    const xml = (await handler(routeEvent({ slug: "cat" }))) as string;
    expect(xml).toContain("<rss");
    expect(capturedContentFindMany[0]!.take).toBe(50);
  });

  test("tag feed:contents.findMany 带 take=50", async () => {
    const handler = (await import("#server/routes/feed/tag/[slug].get")).default;
    const xml = (await handler(routeEvent({ slug: "tag" }))) as string;
    expect(xml).toContain("<rss");
    expect(capturedContentFindMany[0]!.take).toBe(50);
  });

  test("comments feed:comments.findMany 带 take=200", async () => {
    const handler = (await import("#server/routes/feed/comments/[cid].get")).default;
    const xml = (await handler(routeEvent({ cid: "1" }))) as string;
    expect(xml).toContain("<rss");
    expect(capturedCommentsFindMany[0]!.take).toBe(200);
  });
});
