import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const deleteHandler = (await import("#server/api/admin/comments/[id].delete")).default;

describe("admin/comments/[id].delete 500 fallback", () => {
  test("$transaction 抛未知异常 → 500(非 statusCode 非 P2025)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "delete", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});