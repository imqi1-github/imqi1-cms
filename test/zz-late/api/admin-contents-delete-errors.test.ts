import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const deleteOneHandler = (await import("#server/api/admin/contents/[cid].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/contents/batch-delete.post")).default;

// 兜底 contentattachments / contentrelations / comments / contents 的 findMany / deleteMany,
// 否则 batch-delete 的预备 findMany 会先抛"未设置"
sharedFake.on("contentattachments", "findMany", async () => []);
sharedFake.on("contentrelations", "findMany", async () => []);
sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("comments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("comments", "findMany", async () => []);
sharedFake.on("contents", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("contents", "findMany", async () => []);

describe("admin/contents/[cid].delete 错误路径", () => {
  test("非 Prisma 未知异常 → 500", async () => {
    sharedFake.on("contents", "delete", async () => { throw new Error("db down"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteOneHandler, {
      method: "DELETE",
      params: { cid: "1" },
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("P2025 → 404", async () => {
    sharedFake.on("contents", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteOneHandler, {
      method: "DELETE",
      params: { cid: "999" },
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/contents/batch-delete 错误路径", () => {
  test("ids 含合法但 Set 去重后为空 → 400(防止 [true,null,-1] 之类被 Number 后看似合法)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [true, null, -1, 0] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("$transaction 异常 → 500(非 statusCode 非 Prisma)", async () => {
    sharedFake.on("$transaction", async () => { throw new Error("txn boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2] },
    })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("$transaction statusCode 异常 → 原样抛(避免吞成 500)", async () => {
    sharedFake.on("$transaction", async () => {
      throw createError({ statusCode: 403, message: "forbidden" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});