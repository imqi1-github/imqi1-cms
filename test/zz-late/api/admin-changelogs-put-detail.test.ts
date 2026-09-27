import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/changelogs/[id].put")).default;

describe("admin/changelogs/[id].put 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
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

  test("id 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("content 非数组 → 400(normalizeChangelogEntries 返回空)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "[]" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 更新日志", async () => {
    sharedFake.on("changelogs", "findUnique", async () => ({ id: 1, content: "[]" }));
    sharedFake.on("changelogs", "update", async () => ({ id: 1, content: "[]" }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("字节超限 → 400", async () => {
    const cookie = await loginSessionCookie();
    // 生成超长 entries(每条 ~10KB,1000 条 = 10MB > 默认上限)
    const bigEntries = Array.from({ length: 1000 }, () => ({ type: "修复", value: "x".repeat(10000) }));
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: bigEntries },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});