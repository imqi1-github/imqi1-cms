/**
 * admin/comments/batch-delete.post 补测:
 *  - ids 缺省/非数组/空数组 → 400
 *  - ids 含非正整数 → 400(防 Prisma 500)
 *  - 已发布评论才减计数(分文章聚合,1 篇 N 条合并 -N)
 *  - 待审核评论删除不影响 comment_num
 *  - 删除跨多篇:每篇独立更新
 *  - 成功:返回 success/count/message
 *  - 计数 update 时文章被删(P2025)→ 404 而非 500
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/comments/batch-delete.post")).default;

// 默认假件
sharedFake.on("$transaction", async (arg: unknown) => {
  if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
  return arg;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callBatch(opts: { ids?: unknown; cookie?: string }) {
  return callAdmin(handler, {
    method: "POST",
    body: { csrfToken: CSRF_TOKEN, ...(opts.ids !== undefined ? { ids: opts.ids } : {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/comments/batch-delete.post 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
      cookie: "",
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      body: { ids: [1] },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("ids 缺省 → 400", async () => {
    await expect(callBatch({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 非数组(字符串) → 400", async () => {
    await expect(callBatch({ ids: "1,2,3" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 空数组 → 400", async () => {
    await expect(callBatch({ ids: [] })).rejects.toMatchObject({ statusCode: 400, message: "请选择要删除的评论" });
  });

  test("ids 含 0/负数/小数/字符串 → 400(避免 Prisma 抛 500)", async () => {
    for (const bad of [[0], [-1], [1.5], ["abc"], [null], [1, -2]]) {
      await expect(callBatch({ ids: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("ids 含 boolean → 400(Number(true)=1 会误判 → 显式拒绝)", async () => {
    await expect(callBatch({ ids: [true] })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/comments/batch-delete.post 业务逻辑", () => {
  test("已发布评论 + 待审核评论混合 → 只减已发布的计数", async () => {
    sharedFake.on("comments", "findMany", async () => [
      { coid: 1, cid: 10, status: 1 },
      { coid: 2, cid: 10, status: 0 },
      { coid: 3, cid: 20, status: 1 },
    ]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 3 }));
    const updates: Array<{ where: { cid: number }; data: { comment_num: { decrement: number } } }> = [];
    sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: { comment_num: { decrement: number } } }) => {
      updates.push({ where, data });
      return {};
    });
    await callBatch({ ids: [1, 2, 3] });
    // 只 1 篇 cid=10 (1 条 status=1) + cid=20 (1 条 status=1) → 2 次 update
    expect(updates).toHaveLength(2);
    const byCid = new Map(updates.map(u => [u.where.cid, u.data.comment_num.decrement]));
    expect(byCid.get(10)).toBe(1);
    expect(byCid.get(20)).toBe(1);
  });

  test("同一文章多条已发布评论 → 合并为一次 -N(update 而非多次单减)", async () => {
    sharedFake.on("comments", "findMany", async () => [
      { coid: 1, cid: 10, status: 1 },
      { coid: 2, cid: 10, status: 1 },
      { coid: 3, cid: 10, status: 1 },
    ]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 3 }));
    const updates: Array<{ where: { cid: number }; data: { comment_num: { decrement: number } } }> = [];
    sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: { comment_num: { decrement: number } } }) => {
      updates.push({ where, data });
      return {};
    });
    await callBatch({ ids: [1, 2, 3] });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.where.cid).toBe(10);
    expect(updates[0]!.data.comment_num.decrement).toBe(3);
  });

  test("仅待审核评论 → 不调 contents.update", async () => {
    sharedFake.on("comments", "findMany", async () => [
      { coid: 1, cid: 10, status: 0 },
      { coid: 2, cid: 20, status: 0 },
    ]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 2 }));
    const updates: unknown[] = [];
    sharedFake.on("contents", "update", async () => {
      updates.push({});
      return {};
    });
    await callBatch({ ids: [1, 2] });
    expect(updates).toHaveLength(0);
  });
});

describe("admin/comments/batch-delete.post:并发兜底", () => {
  test("计数 update 时文章被删(P2025)→ 404 而非 500", async () => {
    sharedFake.on("comments", "findMany", async () => [{ coid: 1, cid: 10, status: 1 }]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("contents", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callBatch({ ids: [1] })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("未知错误 → 500 而非泄漏原始 message", async () => {
    sharedFake.on("comments", "findMany", async () => [{ coid: 1, cid: 10, status: 1 }]);
    sharedFake.on("comments", "deleteMany", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callBatch({ ids: [1] });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});

describe("admin/comments/batch-delete.post:响应 shape", () => {
  test("成功 → 返回 success/count/message(3 键)", async () => {
    sharedFake.on("comments", "findMany", async () => [{ coid: 1, cid: 10, status: 1 }]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("contents", "update", async () => ({}));
    const r = (await callBatch({ ids: [1] })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["count", "message", "success"]);
    expect(r.count).toBe(1);
    expect(r.message).toContain("1");
    expect(r.success).toBe(true);
  });
});