/**
 * server/api/admin/cache/clear.post.ts:
 *  - CSRF/auth 守卫
 *  - redis 未配置 → 静默 false + message
 *  - action=search → 精确前缀 scanAndUnlink("search:*")
 *  - action=footprint → 精确 scanAndUnlink("custom:footprint")
 *  - action=all → flushdb 返 matched=-1
 *  - action=keyword/preset → 按子串匹配(value trim,过滤通配符)
 *  - value 非字符串 → 400(防 TypeError)
 *  - redis 抛错(非 statusCode) → 500
 *  - 异常带 statusCode → 原样抛(不被吞成 500)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 假 ioredis:记录 scan/unlink/flushdb 调用
function makeFakeRedis() {
  const calls: { method: string; args: unknown[] }[] = [];
  const scanResults: Array<{ cursor: string; keys: string[] }> = [];
  let scanIdx = 0;
  const redis = {
    async scan(cursor: string, ...args: unknown[]) {
      calls.push({ method: "scan", args: [cursor, ...args] });
      const next = scanIdx < scanResults.length - 1 ? String(scanIdx + 1) : "0";
      const r = scanResults[scanIdx++] ?? { cursor: "0", keys: [] };
      return [next, r.keys] as [string, string[]];
    },
    async unlink(...keys: string[]) {
      calls.push({ method: "unlink", args: keys });
      return keys.length;
    },
    async flushdb() {
      calls.push({ method: "flushdb", args: [] });
      return "OK";
    },
  };
  return { redis, calls, pushScan: (cursor: string, keys: string[]) => scanResults.push({ cursor, keys }) };
}

let redisImpl: ReturnType<typeof makeFakeRedis> | null = null;
let getUserImpl: (e: unknown) => Promise<unknown>;
let validateCsrfImpl: (e: unknown, t?: unknown) => boolean;

beforeEach(() => {
  redisImpl = null;
  getUserImpl = async () => ({ uid: 1 });
  validateCsrfImpl = () => true;
  mock.module("#server/utils/redis", () => ({ redis: redisImpl?.redis ?? null }));
  mock.module("#server/lib/auth", () => ({
    getUser: async (...args: unknown[]) => getUserImpl(args[0]),
  }));
  mock.module("#server/utils/csrf", () => ({
    validateCsrfToken: (e: unknown, t: unknown) => validateCsrfImpl(e, t),
    ensureCsrfToken: (_e: unknown) => "csrf-token-yes",
    getStoredCsrfToken: () => "csrf-token-yes",
    setCsrfToken: () => "csrf-token-yes",
    generateCsrfToken: () => "csrf-token-yes",
  }));
});

const { default: clearHandler } = await import("~/../server/api/admin/cache/clear.post");

function makeEvent(body: unknown) {
  return {
    method: "POST",
    path: "/api/admin/cache/clear",
    _requestBody: JSON.stringify(body),
    node: {
      req: {
        method: "POST",
        url: "/api/admin/cache/clear",
        headers: { "content-type": "application/json" },
      },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

async function callClear(body: unknown): Promise<unknown> {
  return (clearHandler as (e: never) => Promise<unknown>)(makeEvent(body) as never);
}

describe("admin cache/clear:CSRF/auth 守卫", () => {
  test("validateCsrfToken=false → 抛 403", async () => {
    validateCsrfImpl = () => false;
    await expect(callClear({ csrfToken: "x", action: "all" })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("getUser=null → 抛 401", async () => {
    getUserImpl = async () => null;
    await expect(callClear({ csrfToken: "x", action: "all" })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("admin cache/clear:redis 未配置", () => {
  test("redis=null → {success:false, matched:0, cleared:0, message}", async () => {
    redisImpl = null;
    mock.module("#server/utils/redis", () => ({ redis: null }));
    const res = await callClear({ csrfToken: "x", action: "all" }) as { success: boolean; matched: number; cleared: number; message?: string };
    expect(res.success).toBe(false);
    expect(res.matched).toBe(0);
    expect(res.cleared).toBe(0);
    expect(res.message).toContain("Redis");
  });
});

describe("admin cache/clear:action 路由", () => {
  test("action=all → flushdb,matches/cleared = -1", async () => {
    redisImpl = makeFakeRedis();
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const res = await callClear({ csrfToken: "x", action: "all" }) as { success: boolean; matched: number; cleared: number };
    expect(res.success).toBe(true);
    expect(res.matched).toBe(-1);
    expect(res.cleared).toBe(-1);
    expect(redisImpl.calls.find(c => c.method === "flushdb")).toBeDefined();
  });

  test("action=search → pattern 精确 'search:*'(不模糊匹配),扫到 key 即 unlink", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["search:hello:type", "search:foo:bar"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const res = await callClear({ csrfToken: "x", action: "search" }) as { matched: number; cleared: number };
    expect(res.matched).toBe(2);
    expect(res.cleared).toBe(2);
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    expect(scanCall?.args).toContain("search:*");
    expect(redisImpl.calls.find(c => c.method === "unlink")?.args).toEqual([
      "search:hello:type",
      "search:foo:bar",
    ]);
  });

  test("action=search 0 命中 → matched=0,note 提示无匹配", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", []);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const res = await callClear({ csrfToken: "x", action: "search" }) as { matched: number; cleared: number; note?: string };
    expect(res.matched).toBe(0);
    expect(res.note).toContain("没有匹配");
  });

  test("action=footprint → 精确键 'custom:footprint'", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["custom:footprint"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    await callClear({ csrfToken: "x", action: "footprint" });
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    expect(scanCall?.args).toContain("custom:footprint");
  });

  test("action=keyword → value 走 clearBySubstring(pattern = `*${value}*`)", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["foo:bar:1", "baz:foo:2"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const res = await callClear({ csrfToken: "x", action: "keyword", value: "foo" }) as { matched: number };
    expect(res.matched).toBe(2);
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    expect(scanCall?.args).toContain("*foo*");
  });

  test("action=keyword value 含通配符 → 内部 *?[ ] 被剥离,pattern 仍含首尾 *", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", []);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    await callClear({ csrfToken: "x", action: "keyword", value: "foo*?[bar]" });
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    const pattern = scanCall!.args[2] as string;
    // 内部关键字 'foo*?[bar]' → 'foobar';pattern = '*foobar*'(首尾 * 由 wrapper 加,内部已剥)
    expect(pattern).toBe("*foobar*");
  });

  test("action=keyword value 非字符串 → 400(防 .trim 抛 TypeError)", async () => {
    redisImpl = makeFakeRedis();
    mock.module("#server/utils/redis", () => ({ redis: redisImpl.redis }));
    await expect(
      callClear({ csrfToken: "x", action: "keyword", value: 123 as unknown as string }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("action=keyword value 为空字符串 → 400", async () => {
    redisImpl = makeFakeRedis();
    mock.module("#server/utils/redis", () => ({ redis: redisImpl.redis }));
    await expect(
      callClear({ csrfToken: "x", action: "keyword", value: "   " }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("action 未知 → 400", async () => {
    redisImpl = makeFakeRedis();
    mock.module("#server/utils/redis", () => ({ redis: redisImpl.redis }));
    await expect(
      callClear({ csrfToken: "x", action: "bogus" as never }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin cache/clear:异常处理", () => {
  test("redis.scan 抛错(非 statusCode)→ 抛 500 '缓存清理失败'", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.redis.scan = async () => { throw new Error("ECONNRESET"); };
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(callClear({ csrfToken: "x", action: "search" })).rejects.toMatchObject({
        statusCode: 500,
        message: "缓存清理失败",
      });
    } finally {
      console.error = origErr;
    }
  });

  test("内部抛带 statusCode 错误 → 原样抛(不被吞成 500)", async () => {
    // value 缺 → 内部 createError 400;handler catch 应保持 400
    redisImpl = makeFakeRedis();
    mock.module("#server/utils/redis", () => ({ redis: redisImpl.redis }));
    await expect(
      callClear({ csrfToken: "x", action: "keyword", value: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});