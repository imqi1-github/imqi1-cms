/**
 * 真实 DB 集成测 —— 评论树(server/api/comments.get)
 *
 * 覆盖多层级 parent_id 嵌套下的树组装 + 孤立 parent_id 兜底 +
 * 状态过滤(只取 status=1 已通过)。
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import type { CommentNode } from "#server/types/apis/comment-node";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb, seedContent } = await import("./_helpers");
const handler = (await import("#server/api/comments.get")).default;

function event(opts: { cid?: number; page?: number; pageSize?: number } = {}) {
  const q = new URLSearchParams();
  if (opts.cid) q.set("cid", String(opts.cid));
  if (opts.page) q.set("page", String(opts.page));
  if (opts.pageSize) q.set("pageSize", String(opts.pageSize));
  const url = `/api/comments${q.toString() ? "?" + q : ""}`;
  return {
    method: "GET",
    context: {},
    path: url,
    node: {
      req: { method: "GET", url, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

describe("server/api/comments.get 评论树(真实 DB)", () => {
  test("单层评论(无 parent_id)→ 全是 root", async () => {
    await resetDb();
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    await db.comments.create({ data: { cid: post.cid, name: "A", content: "A1", status: 1 } });
    await db.comments.create({ data: { cid: post.cid, name: "B", content: "B1", status: 1 } });
    const r = (await handler(event({ cid: post.cid }))) as { data: CommentNode[]; pagination: { total: number } };
    expect(r.data.length).toBe(2);
    expect(r.data.every(c => c.parent_id === null)).toBe(true);
    expect(r.pagination.total).toBe(2);
  });

  test("三层嵌套 → root 1 个 + children 链", async () => {
    await resetDb();
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    const root = await db.comments.create({ data: { cid: post.cid, name: "R", content: "R1", status: 1 } });
    const child = await db.comments.create({ data: { cid: post.cid, name: "C1", content: "C1", status: 1, parent_id: root.coid } });
    await db.comments.create({ data: { cid: post.cid, name: "C2", content: "C2", status: 1, parent_id: child.coid } });
    const r = (await handler(event({ cid: post.cid }))) as { data: CommentNode[] };
    expect(r.data.length).toBe(1);
    expect(r.data[0]!.coid).toBe(root.coid);
    expect(r.data[0]!.children.length).toBe(1);
    expect(r.data[0]!.children[0]!.coid).toBe(child.coid);
    expect(r.data[0]!.children[0]!.children[0]!.coid).toBeGreaterThan(child.coid);
  });

  test("待审核评论(status=0)不返回", async () => {
    await resetDb();
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    await db.comments.create({ data: { cid: post.cid, name: "P", content: "已通过", status: 1 } });
    await db.comments.create({ data: { cid: post.cid, name: "Q", content: "待审", status: 0 } });
    const r = (await handler(event({ cid: post.cid }))) as { data: CommentNode[]; pagination: { total: number } };
    expect(r.data.length).toBe(1);
    expect(r.data[0]!.name).toBe("P");
    expect(r.pagination.total).toBe(1);
  });

  test("孤儿 parent_id(parent 不存在)→ fallback 到 root", async () => {
    await resetDb();
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    // parent_id=9999 不存在,应 fallback 到 rootComments
    await db.comments.create({ data: { cid: post.cid, name: "Orphan", content: "x", status: 1, parent_id: 9999 } });
    const r = (await handler(event({ cid: post.cid }))) as { data: CommentNode[] };
    expect(r.data.length).toBe(1);
    expect(r.data[0]!.parent_id).toBe(9999);
    expect(r.data[0]!.parent_name).toBeNull(); // 找不到 parent
  });

  test("分页:pageSize 限制根评论返回数", async () => {
    await resetDb();
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    for (let i = 0; i < 15; i++) {
      await db.comments.create({ data: { cid: post.cid, name: `N${i}`, content: `c${i}`, status: 1 } });
    }
    const r1 = (await handler(event({ cid: post.cid, page: 1, pageSize: 5 }))) as { data: CommentNode[]; pagination: { total: number; page: number; pageSize: number } };
    expect(r1.data.length).toBe(5);
    expect(r1.pagination.total).toBe(15);
    const r2 = (await handler(event({ cid: post.cid, page: 2, pageSize: 5 }))) as { data: CommentNode[] };
    expect(r2.data.length).toBe(5);
    const r3 = (await handler(event({ cid: post.cid, page: 3, pageSize: 5 }))) as { data: CommentNode[] };
    expect(r3.data.length).toBe(5);
  });

  test("cid 缺省/非法 → 400", async () => {
    await expect(handler(event({}))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(event({ cid: 0 }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(event({ cid: -1 }))).rejects.toMatchObject({ statusCode: 400 });
  });
});
