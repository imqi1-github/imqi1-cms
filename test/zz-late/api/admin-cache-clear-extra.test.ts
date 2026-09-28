import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

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

describe("admin/cache/clear.post(边界补测)", () => {
  test("action=preset 空 value → 400「未知的缓存类别」", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: "" },
    })).rejects.toMatchObject({ statusCode: 400, message: "未知的缓存类别" });
  });

  test("action=preset 命中 → 删除匹配键", async () => {
    redisStore.set("page:home:1", "1");
    redisStore.set("page:home:2", "2");
    redisStore.set("other", "3");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: "page:home" },
    }) as { cleared: number };
    expect(r.cleared).toBe(2);
    expect(redisStore.has("other")).toBe(true);
  });

  test("scan 异常 → 不抛 500,降级 success:false(2026-09-28 修复 redis 兜底)", async () => {
    const brokenRedis = {
      ...fakeRedis,
      scan: async () => { throw new Error("redis down"); },
    };
    mock.module("#server/utils/redis", () => ({ redis: brokenRedis }));
    const cookie = await loginSessionCookie();
    // 修复后:scanAndUnlink 内 try/catch 返 -1,handler 返 success:false 不抛 500
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { success?: boolean; message?: string; matched?: number };
    expect(r.success).toBe(false);
    expect(r.matched).toBe(-1);
    expect(String(r.message)).toMatch(/Redis 不可用/);
    expect(String(r.message)).not.toMatch(/redis down/);
    // 还原
    mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));
  });
});