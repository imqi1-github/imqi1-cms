import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// cache/clear 的 redis 假件:记录 scan pattern 与被删键
const deletedKeys: string[] = [];
const redisKeys = new Map<string, string>();
mock.module("#server/utils/redis", () => ({
  redis: {
    async scan(cursor: string, _m: string, pattern: string, _c: string, _n: string) {
      const matched = [...redisKeys.entries()].filter(([k]) =>
        new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$").test(k));
      return [cursor === "0" && matched.length > 0 ? "1" : "0", matched.map(([k]) => k)] as const;
    },
    async flushdb() {
      redisKeys.clear();
      return "OK";
    },
    async unlink(...keys: string[]) {
      keys.forEach(k => {
        redisKeys.delete(k);
        deletedKeys.push(k);
      });
      return keys.length;
    },
  },
}));

const clearHandler = (await import("#server/api/admin/cache/clear.post")).default;
const initHandler = (await import("#server/api/admin/settings/init.post")).default;

beforeEach(() => {
  redisKeys.clear();
  deletedKeys.length = 0;
  redisKeys.set("nitro:routes:_:index.abc.json", "html");
  redisKeys.set("nitro:routes:_:links.def.json", "html");
  redisKeys.set("search:关键词", "results");
});

describe("admin/cache/clear.post", () => {
  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(clearHandler, { cookie: session, body: { action: "keyword", value: "nitro" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("按关键词子串清缓存:只删匹配键,通配符被剥除", async () => {
    const session = await loginSessionCookie();
    const r = (await callAdmin(clearHandler, { cookie: `${session}; ${CSRF_COOKIE}`, body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "nitro*" } })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(deletedKeys.sort()).toEqual(["nitro:routes:_:index.abc.json", "nitro:routes:_:links.def.json"]);
    expect(redisKeys.has("search:关键词")).toBe(true);
  });

  test("action=all 清空当前 DB", async () => {
    const session = await loginSessionCookie();
    const r = (await callAdmin(clearHandler, { cookie: `${session}; ${CSRF_COOKIE}`, body: { csrfToken: CSRF_TOKEN, action: "all" } })) as { cleared: number };
    expect(r.cleared).toBe(-1);
    expect(redisKeys.size).toBe(0);
  });
});

describe("admin/settings/init.post", () => {
  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(initHandler, { cookie: session, body: {} })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("恢复默认设置:写入缺失的默认键", async () => {
    const created = new Map<string, string>();
    // 只预置一个键 → 其余默认键都算「缺失」应被创建
    sharedFake.on("informations", "findMany", async () => [{ key: "siteName" }]);
    sharedFake.on("informations", "createMany", async ({ data }: { data: Array<{ key: string; value: string }> }) => {
      data.forEach(d => created.set(d.key, d.value));
      return { count: data.length };
    });

    const r = (await callAdmin(initHandler, { cookie: `${await loginSessionCookie()}; ${CSRF_COOKIE}`, body: { csrfToken: CSRF_TOKEN } })) as {
      success: boolean; data: { created: unknown[]; total: number };
    };
    expect(r.success).toBe(true);
    // 已存在的 siteName 不重复创建,其余默认键写入
    expect(created.has("siteName")).toBe(false);
    expect(created.get("commentEnabled")).toBe("true");
    expect(created.size).toBeGreaterThan(10);
    expect(r.data.total).toBeGreaterThan(10);
  });
});
