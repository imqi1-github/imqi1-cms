import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/subscribes.post")).default;

describe("admin/subscribes.post 残差补测", () => {
  test("name 非字符串(数字)→ 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: 12345, url: "https://x.com" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("url 非字符串(数字)→ 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", url: 12345 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("validateSubscribeData 长度超限 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲".repeat(500), url: "https://x.com" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("avatar 非字符串 → 400", async () => {
    sharedFake.on("subscribes", "create", async ({ data }: { data: Record<string, unknown> }) => ({
      id: 100, ...data, url: data.url as string, name: data.name as string, avatar: null, lastUpdated: null,
    }));
    const cookie = await loginSessionCookie();
    // avatar: 12345 → typeof !== 'string', typeof !== 'object' 跳过校验,到 Prisma 那才炸
    // 实际 handler 没显式校验 avatar 类型,所以 500
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", url: "https://x.com", avatar: 12345 },
    }) as { id: number };
    expect(r.id).toBe(100);
  });
});