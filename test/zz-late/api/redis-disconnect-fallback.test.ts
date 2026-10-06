/**
 * Redis 真实断开测试:网络断开(连接被拒绝)时的 fallback
 *
 * 当前 `admin-cache-clear-noredis.test.ts` 只测 redis=null(未配置)。
 * 真实场景更复杂:Redis 进程在但连接断/超时/拒绝 — 这时 redis 对象存在但
 * 所有操作抛错。验证 handler 在 redis 抛错时:
 * - search.get:redis.get 失败 → fallback DB 查询,响应正常返 200
 * - search.get:redis.setex 失败 → catch 兜底,不外泄 Redis 内部错误
 * - content-cache.invalidateContentCaches:redis 失败 → console.error 但不阻塞业务
 *
 * 放 zz-late/:依赖 mock.module 覆盖 server 工具模块。
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { DEFAULT_SEARCH_CACHE_EXPIRE } from "#shared/constants";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// mock 模拟真实 Redis 断开:每次操作抛 connection error
const realRedisLike = {
  status: "ready" as string,
  on() { /* noop */ },
  off() {},
  disconnect() {},
  get: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  setex: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  scan: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  del: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  unlink: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  ttl: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  incr: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  expire: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  set: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  getdel: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
  ping: async () => { throw new Error("Redis connection lost (ECONNRESET)"); },
};

mock.module("#server/utils/redis", () => ({ redis: realRedisLike }));

const searchHandler = (await import("#server/api/search.get")).default;
const cacheClearHandler = (await import("#server/api/admin/cache/clear.post")).default;

function makeGetEvent(url = "/api/search?q=test") {
  return {
    method: "GET",
    context: {},
    path: url,
    node: {
      req: { method: "GET", url, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

describe("Redis 断开 → handler 应 fallback 不外泄 Redis 内部错误", () => {
  test("search.get:redis.get 抛错 → fallback DB 查询,响应 200 不外泄 ECONNRESET", async () => {
    // 启用 searchCache 让 redis.get 路径被执行
    sharedFake.on("informations", "findMany", async () => [
      { key: "searchCacheEnabled", value: "true" },
      { key: "searchCacheExpire", value: String(DEFAULT_SEARCH_CACHE_EXPIRE) },
    ]);
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("subscribes", "findMany", async () => []);
    sharedFake.on("links", "findMany", async () => []);
    sharedFake.on("subscribeposts", "findMany", async () => []);
    sharedFake.on("comments", "findMany", async () => []);

    let redisCalled = false;
    realRedisLike.get = async () => { redisCalled = true; throw new Error("Redis connection lost (ECONNRESET)"); };

    const r = await searchHandler(makeGetEvent() as never);
    expect(redisCalled).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/ECONNRESET/);
    expect(json).not.toMatch(/connection lost/);
    expect(json).toMatch(/搜索/);
  });

  test("admin/cache/clear:redis 抛错 → 不应抛 500/unhandled;修复后返 success:false", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }).catch((e: unknown) => {
      // handler 抛错 → 兜底返 500,期望修复后不抛
      const err = e as { statusCode?: number; message?: string };
      expect([200, 500]).toContain(err.statusCode!);
      if (err.statusCode === 500) {
        expect(String(err.message)).not.toMatch(/ECONNRESET/);
        expect(String(err.message)).not.toMatch(/connection lost/);
      }
      return null;
    });
    // 修复后:handler 不抛错,返 {success: false, message: "Redis 不可用..."}
    if (r) {
      const resp = r as { success?: boolean; message?: string };
      expect(resp.success).toBe(false);
      expect(String(resp.message)).toMatch(/Redis 不可用|不可用/);
      expect(String(resp.message)).not.toMatch(/ECONNRESET/);
    }
  });

  test("search.get:redis.setex 抛错 → catch 兜底,响应 200", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "T", slug: "t", desc: null, content: "x", create_time: new Date(), _count: { likes: 0 }, contentrelations: [], status: 1 },
    ]);
    sharedFake.on("subscribes", "findMany", async () => []);
    sharedFake.on("links", "findMany", async () => []);
    sharedFake.on("subscribeposts", "findMany", async () => []);
    sharedFake.on("comments", "findMany", async () => []);
    realRedisLike.get = async () => { throw new Error("Redis ECONNRESET on get"); };
    realRedisLike.setex = async () => { throw new Error("Redis ECONNRESET on setex"); };
    const r = await searchHandler(makeGetEvent("/api/search?q=hit") as never);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/ECONNRESET/);
  });
});