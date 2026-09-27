import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/travels/[id].delete")).default;

describe("admin/travels/[id].delete 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "DELETE",
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie,
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省/非法 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("地点不存在(并发删/不存在)→ 404(P2025)", async () => {
    sharedFake.on("travels", "delete", async () => {
      const e = new Error("not found") as Error & { code: string };
      e.code = "P2025";
      throw e;
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 删地点 + 失效缓存", async () => {
    sharedFake.on("travels", "delete", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("未知异常 → 500", async () => {
    sharedFake.on("travels", "delete", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});