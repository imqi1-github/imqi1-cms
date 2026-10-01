/**
 * 大压力测试(单进程内并发):缓存击穿 + single-flight 暴露
 *
 * ⚠️ KNOWN ISSUE(2026-09-28 实测):search.get 缓存读路径无 single-flight 保护,
 * 50 个并发 cache miss 会触发 50 次 DB 查询(理想=1,缓存击穿)。
 * 修复:加模块级 Promise cache,miss 时只发一次 DB,其它 await 同一 promise。
 *
 * 本测试暴露此 bug 并固化修复后的预期值,目前应当 fail(stampede 触发)。
 */
import { describe, expect, mock, test } from "bun:test";

import { DEFAULT_SEARCH_CACHE_EXPIRE } from "#shared/constants";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 提供可替换的 redis mock:每个 test 替换 .get 实现
const redisState = {
  getImpl: async () => null as string | null,
  setexCalls: 0,
};
const mockRedis = {
  status: "ready" as string,
  on() {},
  off() {},
  disconnect() {},
  get: () => redisState.getImpl(),
  setex: async () => { redisState.setexCalls++; },
  scan: async () => ["0", []],
  del: async () => {},
  unlink: async () => {},
  ttl: async () => -2,
  incr: async () => 1,
  expire: async () => 1,
  set: async () => {},
  getdel: async () => null,
  ping: async () => "PONG",
};
mock.module("#server/utils/redis", () => ({ redis: mockRedis }));

const searchHandler = (await import("#server/api/search.get")).default;

function event(url = "/api/search?q=hot") {
  return {
    method: "GET", context: {}, path: url,
    node: {
      req: { method: "GET", url, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

function enableCacheAndContents(queryBuilder: (q: string) => { cid: number; title: string; slug: string; desc: null; content: string; create_time: Date; contentrelations: never[]; status: 1 }[]) {
  sharedFake.on("informations", "findMany", async () => [
    { key: "searchCacheEnabled", value: "true" },
    { key: "searchCacheExpire", value: String(DEFAULT_SEARCH_CACHE_EXPIRE) },
  ]);
  sharedFake.on("subscribes", "findMany", async () => []);
  sharedFake.on("links", "findMany", async () => []);
  sharedFake.on("subscribeposts", "findMany", async () => []);
  sharedFake.on("comments", "findMany", async () => []);
  sharedFake.on("contents", "findMany", async (args?: unknown) => {
    // 简化:从 query 里任一 contains 字段提取 q
    const json = JSON.stringify(args ?? {});
    const m = json.match(/"contains":"([^"]+)"/);
    const q = m?.[1] ?? "";
    return queryBuilder(q);
  });
}

describe("大压力 + 缓存击穿", () => {
  test("缓存 cold miss + 50 并发:理想 DB=1 次;当前 = 50(stampede bug)", async () => {
    redisState.setexCalls = 0;
    redisState.getImpl = async () => null;
    let dbCallCount = 0;
    enableCacheAndContents(() => {
      dbCallCount++;
      return [{ cid: 1, title: "x", slug: "x", desc: null, content: "x", create_time: new Date(0), contentrelations: [], status: 1 }];
    });
    const CONCURRENT = 50;
    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => searchHandler(event() as never)));
    expect(results.length).toBe(CONCURRENT);
    // ⚠️ KNOWN BUG:应只 1 次 DB(single-flight),实际 50 次(cache stampede)
    // 修复方向:模块级 promise cache,miss 时只发一次 DB,其它 await 同一 promise
    expect(dbCallCount).toBe(1);
    // 响应一致性
    const firstData = JSON.stringify((results[0] as { data?: unknown }).data);
    for (const r of results) {
      expect(JSON.stringify((r as { data?: unknown }).data)).toBe(firstData);
    }
  }, 10000);

  test("缓存 hit 后并发 50:DB 只调一次", async () => {
    redisState.setexCalls = 0;
    const cached = JSON.stringify({
      results: [{ type: "content", cid: 1, title: "cached", slug: "c", desc: null, createTime: "", categoryName: null, categorySlug: null, highlight: "" }],
      total: 1, query: "hot", type: "content",
    });
    redisState.getImpl = async () => cached;
    let dbCallCount = 0;
    enableCacheAndContents(() => {
      dbCallCount++;
      return [{ cid: 1, title: "x", slug: "x", desc: null, content: "x", create_time: new Date(0), contentrelations: [], status: 1 }];
    });
    const CONCURRENT = 50;
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => searchHandler(event() as never)));
    const elapsed = performance.now() - start;
    expect(results.length).toBe(CONCURRENT);
    // 缓存命中,DB 不应被调
    expect(dbCallCount).toBe(0);
    expect((results[0] as { message?: string }).message).toMatch(/缓存/);
    expect(elapsed).toBeLessThan(200);
  }, 10000);

  test("50 个并发不同 query:各自独立(DB 调用 ≥ 50)", async () => {
    redisState.setexCalls = 0;
    redisState.getImpl = async () => null;
    const callQueries: string[] = [];
    enableCacheAndContents((q) => {
      callQueries.push(q);
      return q ? [{ cid: 1, title: q, slug: q, desc: null, content: "x", create_time: new Date(0), contentrelations: [], status: 1 }] : [];
    });
    const CONCURRENT = 50;
    const queries = Array.from({ length: CONCURRENT }, (_, i) => `q-${i}`);
    const results = await Promise.all(queries.map(q => searchHandler(event(`/api/search?q=${q}`) as never)));
    expect(results.length).toBe(CONCURRENT);
    expect(callQueries.length).toBeGreaterThanOrEqual(CONCURRENT);
    expect(new Set(callQueries).size).toBe(CONCURRENT);
    for (let i = 0; i < CONCURRENT; i++) {
      const r = results[i] as { data?: { query?: string } };
      expect(r.data?.query).toBe(queries[i]);
    }
  }, 10000);
});