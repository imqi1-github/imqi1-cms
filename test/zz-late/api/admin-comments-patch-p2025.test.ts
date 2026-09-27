import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/comments/[id].patch")).default;

describe("admin/comments/[id].patch catch 路径", () => {
  test("update P2025(并发竞态)→ 404「评论不存在或已被删除」", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async () => {
      const e = new Error("not found") as Error & { code: string };
      e.code = "P2025";
      throw e;
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "x" },
    })).rejects.toThrow(/已被删除/);
  });

  test("非 statusCode 非 P2025 异常 → 500", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "x" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});