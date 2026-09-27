import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/comments/batch-delete.post")).default;

describe("admin/comments/batch-delete.post(批量删除评论)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { ids: [1, 2] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("ids 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 非数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: "1,2" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 空数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 含非数字 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1, "x"] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 删除 + 返回 success + count", async () => {
    // tx.comments.findMany 需要返回 cid 列表用于分组更新文章计数
    sharedFake.on("comments", "findMany", async () => [
      { coid: 1, cid: 10, status: 1 },
      { coid: 2, cid: 10, status: 1 },
      { coid: 3, cid: 11, status: 0 },
    ]);
    let deletedWhere: { coid: { in: number[] } } | null = null;
    sharedFake.on("comments", "deleteMany", async ({ where }: { where: { coid: { in: number[] } } }) => {
      deletedWhere = where;
      return { count: where.coid.in.length };
    });
    sharedFake.on("contents", "update", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2, 3] },
    }) as { success: boolean; count: number };
    expect(r.success).toBe(true);
    expect(r.count).toBe(3);
    expect(deletedWhere!.coid.in).toEqual([1, 2, 3]);
  });

  test("$transaction 抛 P2025(并发计数竞态)→ 404", async () => {
    sharedFake.on("comments", "findMany", async () => [{ coid: 1, cid: 10, status: 1 }]);
    sharedFake.on("comments", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("contents", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});