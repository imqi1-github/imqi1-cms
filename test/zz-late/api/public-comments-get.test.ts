import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/comments.get")).default;

describe("comments.get(评论列表)", () => {
  test("cid 缺省 → 400", async () => {
    await expect(callAdmin(handler, { method: "GET", url: "/api/comments" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 非正整数 → 400", async () => {
    await expect(callAdmin(handler, { method: "GET", url: "/api/comments?cid=-1" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", url: "/api/comments?cid=0" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", url: "/api/comments?cid=abc" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("空评论列表 → 返回空 data/pagination", async () => {
    sharedFake.on("comments", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", url: "/api/comments?cid=1" }) as { data: unknown[]; pagination: { total: number; hasMore: boolean } };
    expect(r.data).toEqual([]);
    expect(r.pagination.total).toBe(0);
    expect(r.pagination.hasMore).toBe(false);
  });

  test("根评论 + 子评论 → 树形结构 + children + parent_name", async () => {
    sharedFake.on("comments", "findMany", async () => [
      { coid: 1, cid: 1, name: "父", mail: null, link: null, content: "父评论", create_time: new Date(), status: 1, parent_id: null, agent: "Mozilla/5.0", ip: "1.1.1.1" },
      { coid: 2, cid: 1, name: "子", mail: null, link: null, content: "子评论", create_time: new Date(), status: 1, parent_id: 1, agent: null, ip: "2.2.2.2" },
    ]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/comments?cid=1" }) as { data: Array<{ coid: number; children: Array<{ parent_name: string }> }>; pagination: { totalAllComments: number } };
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.coid).toBe(1);
    expect(r.data[0]!.children).toHaveLength(1);
    expect(r.data[0]!.children[0]!.parent_name).toBe("父");
    expect(r.pagination.totalAllComments).toBe(2);
  });

  test("pageSize 边界 → 钳到合法范围", async () => {
    sharedFake.on("comments", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", url: "/api/comments?cid=1&pageSize=99999&page=0" }) as { pagination: { page: number; pageSize: number } };
    expect(r.pagination.page).toBe(1);
    expect(r.pagination.pageSize).toBeLessThanOrEqual(10000);
  });

  test("孤儿评论(parent_id 找不到)→ 归入根列表", async () => {
    sharedFake.on("comments", "findMany", async () => [
      { coid: 10, cid: 1, name: "x", mail: null, link: null, content: "y", create_time: new Date(), status: 1, parent_id: 999, agent: null, ip: null },
    ]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/comments?cid=1" }) as { data: Array<{ coid: number; parent_name: null }> };
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.coid).toBe(10);
    expect(r.data[0]!.parent_name).toBeNull();
  });
});