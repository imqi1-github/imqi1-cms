import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/links.post")).default;

describe("admin/links.post 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "https://a.com" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { name: "甲", link: "https://a.com" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name/link 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("javascript: 协议 → 400(防 XSS)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "javascript:alert(1)" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name/link 非字符串 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: 123, link: "https://a.com" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: 123 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 创建友链", async () => {
    let created: Record<string, unknown> | undefined;
    sharedFake.on("links", "create", async ({ data }: { data: Record<string, unknown> }) => {
      created = data;
      return { id: 100, ...data, enabled: true };
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "https://a.com" },
    }) as { id: number };
    expect(r.id).toBe(100);
    expect(created!.link).toBe("https://a.com");
  });
});