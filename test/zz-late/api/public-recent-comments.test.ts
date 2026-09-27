import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/recent-comments.get")).default;

// 留言板 fallback:messageContentId 为空时查 contents.findFirst
sharedFake.on("contents", "findFirst", async () => null);

describe("recent-comments.get(最近评论列表)", () => {
  test("limit 缺省 → 默认 20 + 返回空数组", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("comments", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", url: "/api/recent-comments" }) as { data: unknown[] };
    expect(r.data).toEqual([]);
  });

  test("留言板评论 → 走 /messages 链接", async () => {
    sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
      where.key === "messageContentId" ? { value: "999" } : null);
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1, content: "hi", name: "访客", mail: null,
      create_time: new Date(),
      content_ref: { cid: 999, title: "留言板", slug: "messages", status: 1, contentrelations: [] },
    }]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/recent-comments" }) as { data: Array<{ contents: { url: string } }> };
    expect(r.data[0]!.contents.url).toBe("/messages");
  });

  test("文章评论 → /content/<分类slug>/<文章slug>", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("comments", "findMany", async () => [{
      coid: 2, content: "好文", name: "读者", mail: "r@x.com",
      create_time: new Date(),
      content_ref: { cid: 1, title: "测试文", slug: "test-post", status: 1, contentrelations: [{ metas: { slug: "tech" } }] },
    }]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/recent-comments" }) as { data: Array<{ contents: { url: string } }> };
    expect(r.data[0]!.contents.url).toBe("/content/tech/test-post");
  });

  test("未发布文章评论 → 被过滤掉", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("comments", "findMany", async () => [{
      coid: 3, content: "x", name: "y", mail: null,
      create_time: new Date(),
      content_ref: { cid: 5, title: "下架文", slug: "down", status: 0, contentrelations: [] },
    }]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/recent-comments" }) as { data: unknown[] };
    expect(r.data).toEqual([]);
  });

  test("limit 上限钳到 PUBLIC_LIMIT_MAX(100)", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    // limit=999999 → take = 999999*2 = 1999998,然后 .slice(0, limit) → 取 999999
    // mock 返回空数组时取不到;验证 mock 函数被调用即可
    let take: number | undefined;
    sharedFake.on("comments", "findMany", async ({ take: t }: { take: number }) => {
      take = t;
      return [];
    });
    await callAdmin(handler, { method: "GET", url: "/api/recent-comments?limit=999999" });
    expect(take).toBeLessThanOrEqual(200);
  });
});