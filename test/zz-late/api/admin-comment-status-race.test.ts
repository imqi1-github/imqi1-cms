/**
 * 并发覆盖：admin/comments/[id].patch status 变更时 comment_num 不变量
 *
 * 测试的是 handler 的 **事务内 read-status-then-update-count 流程**
 * 是否按 status 变化方向正确增减 comment_num。mock prisma 下事务是同步顺序
 * 的（不暴露真正的并发 race），所以这里只验证「顺序两次调用累计」与
 * 「混合方向（0→1 + 1→0）净变动 0」两条不变量；真实并发的 race 须用
 * test/real/db/ 跑 PostgreSQL 才能暴露（详见 memory）。
 */
import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/comments/[id].patch")).default;

// 让 $transaction(fn) 直接调用回调拿 tx
sharedFake.on("$transaction", async (opsOrFn: unknown) => {
  if (typeof opsOrFn === "function") {
    return await (opsOrFn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
  }
  return opsOrFn;
});

async function callPatch(id: string, body: Record<string, unknown>) {
  const cookie = await loginSessionCookie();
  return callAdmin(handler, {
    method: "PATCH",
    cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
    params: { id },
    body: { csrfToken: CSRF_TOKEN, ...body },
  });
}

async function setupComments(records: Array<{ coid: number; cid: number; status: number }>) {
  const map = new Map(records.map(r => [r.coid, { ...r }]));
  sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) => {
    const r = map.get(where.coid);
    return r ? { coid: r.coid, cid: r.cid, status: r.status } : null;
  });
  sharedFake.on("comments", "update", async ({ where, data }: { where: { coid: number }; data: { status?: number } }) => {
    const r = map.get(where.coid);
    if (!r) {
      const e = new Error("not found") as Error & { code: string };
      e.code = "P2025";
      throw e;
    }
    if (data.status !== undefined) r.status = data.status;
    return {
      coid: r.coid, cid: r.cid, name: "x", mail: null, link: null, content: "c",
      create_time: new Date(), status: r.status, parent_id: null,
      content_ref: { cid: r.cid, title: "t", slug: "s" },
    };
  });
  return map;
}

describe("admin/comments/[id].patch status 变更时 comment_num 累计方向", () => {
  test("0→1 然后 1→0(同 cid)→ 净变动 0(一次 +1,一次 -1)", async () => {
    const map = await setupComments([{ coid: 1, cid: 10, status: 0 }]);
    let incs = 0;
    let decs = 0;
    sharedFake.on("contents", "update", async (args: { data?: { comment_num?: { increment?: number; decrement?: number } } } = { data: {} }) => {
      if (args?.data?.comment_num?.increment) incs++;
      if (args?.data?.comment_num?.decrement) decs++;
      return {};
    });
    await callPatch("1", { status: 1 });
    expect(incs).toBe(1);
    expect(decs).toBe(0);
    await callPatch("1", { status: 0 });
    expect(incs).toBe(1);
    expect(decs).toBe(1);
    expect(incs - decs).toBe(0);
  });

  test("0→1→1→1(同 cid)→ 后续两次都不应再触发计数", async () => {
    await setupComments([{ coid: 1, cid: 10, status: 0 }]);
    let incs = 0;
    sharedFake.on("contents", "update", async () => { incs++; return {}; });
    await callPatch("1", { status: 1 });
    expect(incs).toBe(1);
    // 再次 PATCH,status 不变(已是 1),不应再调用 contents.update
    await callPatch("1", { content: "再编辑" });
    expect(incs).toBe(1);
    await callPatch("1", { status: 1 });
    expect(incs).toBe(1);
  });

  test("1→2(spam)→ decrement 1(从已发布迁到非已发布状态算减 1)", async () => {
    await setupComments([{ coid: 1, cid: 10, status: 1 }]);
    let decs = 0;
    sharedFake.on("contents", "update", async (args: { data?: { comment_num?: { increment?: number; decrement?: number } } } = { data: {} }) => {
      if (args?.data?.comment_num?.decrement) decs++;
      return {};
    });
    await callPatch("1", { status: 2 });
    expect(decs).toBe(1);
  });

  test("P2025(并发删除评论)→ 404 而非 500", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 0 }));
    sharedFake.on("comments", "update", async () => {
      const e = new Error("not found") as Error & { code: string };
      e.code = "P2025";
      throw e;
    });
    await expect(callPatch("1", { status: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });
});