import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ====== 内存假 redis(供 cache/clear 用) ======
const redisStore = new Map<string, string>();
const fakeRedis = {
  flushdb: async () => { redisStore.clear(); },
  scan: async (_cursor: string, ...args: unknown[]) => {
    const matchIdx = args.indexOf("MATCH");
    const pattern = String(args[matchIdx + 1] ?? "*").replace(/\*/g, ".*");
    const regex = new RegExp("^" + pattern + "$");
    const keys = [...redisStore.keys()].filter(k => regex.test(k));
    return ["0", keys];
  },
  unlink: async (...keys: string[]) => { for (const k of keys) redisStore.delete(k); return keys.length; },
};
mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));

const handler = (await import("#server/api/admin/cache/clear.post")).default;

beforeEach(() => { redisStore.clear(); });

describe("admin/cache/clear.post(缓存清理)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, action: "all" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { action: "all" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("action=all → flushdb 清空全部键", async () => {
    redisStore.set("search:hello", "1");
    redisStore.set("custom:footprint", "2");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean; cleared: number };
    expect(r.success).toBe(true);
    expect(r.cleared).toBe(-1);
    expect(redisStore.size).toBe(0);
  });

  test("action=search → 仅清 search:* 键,保留其他前缀", async () => {
    redisStore.set("search:hello", "1");
    redisStore.set("search:world", "2");
    redisStore.set("custom:footprint", "3");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { success: boolean; cleared: number };
    expect(r.success).toBe(true);
    expect(r.cleared).toBe(2);
    expect(redisStore.has("custom:footprint")).toBe(true);
  });

  test("action=footprint → 仅清 custom:footprint", async () => {
    redisStore.set("custom:footprint", "1");
    redisStore.set("custom:other", "2");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "footprint" },
    }) as { cleared: number };
    expect(r.cleared).toBe(1);
    expect(redisStore.has("custom:other")).toBe(true);
  });

  test("action=keyword → 按子串匹配 + 空 value 400", async () => {
    redisStore.set("foo:bar", "1");
    redisStore.set("foo:baz", "2");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "foo" },
    }) as { cleared: number };
    expect(r.cleared).toBe(2);

    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("未知的 action → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "unknown" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});