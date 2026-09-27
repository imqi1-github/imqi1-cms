import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/changelogs/[id].put")).default;

describe("admin/changelogs/[id].put 字节上限", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie,
      params: { id: "1" },
      body: { content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("内容超 20000 字符 → 400", async () => {
    sharedFake.on("changelogs", "findUnique", async () => ({ id: 1, content: "[]" }));
    const cookie = await loginSessionCookie();
    const bigEntries = [{ type: "修复", value: "x".repeat(20_001) }];
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: bigEntries },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("changelog 不存在 → 404", async () => {
    sharedFake.on("changelogs", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("update 抛未知异常 → 500", async () => {
    sharedFake.on("changelogs", "findUnique", async () => ({ id: 1, content: "[]" }));
    sharedFake.on("changelogs", "update", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});