import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/changelogs.post")).default;

describe("admin/changelogs.post(创建更新日志)字节上限", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("content 非数组 → 400(normalizeChangelogEntries 返回空)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: "[]" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("内容超过 20000 字符上限 → 400", async () => {
    const cookie = await loginSessionCookie();
    const bigEntries = [{ type: "修复", value: "x".repeat(20_001) }];
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: bigEntries },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 写入数据库", async () => {
    let created = 0;
    sharedFake.on("changelogs", "create", async () => { created++; return { id: created }; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "新增", value: "新功能" }] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(created).toBe(1);
  });
});