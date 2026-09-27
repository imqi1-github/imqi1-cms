import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const importHandler = (await import("#server/api/admin/data/import.post")).default;

describe("admin/data/import.post(数据恢复)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: "csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: "{}" },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie,
      body: { source: "{}" },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("source 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 非字符串 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: 12345 },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 过大(>50MB)→ 400", async () => {
    const cookie = await loginSessionCookie();
    const huge = "x".repeat(50 * 1024 * 1024 + 1);
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: huge },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 非合法 JSON → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: "{not valid json" },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("version 不匹配 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(importHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: '{"version":99,"tables":{}}' },
      url: "/api/admin/data/import",
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});