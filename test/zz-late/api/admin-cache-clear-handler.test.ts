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

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
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

// 用真实 csrf/auth(走 cookie + token),redis 用 mock.module(本进程唯一;不影响其他测试,因为其他测试只读 fake redis null)
// — 之前 csrf/auth 也用 mock.module 会跨文件泄漏,污染 noredis/detail 等用真实 csrf 的测试
let redisImpl: ReturnType<typeof makeFakeRedis> | null = null;

beforeEach(() => {
  redisImpl = null;
  mock.module("#server/utils/redis", () => ({ redis: redisImpl?.redis ?? null }));
});

const { default: clearHandler } = await import("#server/api/admin/cache/clear.post");

async function authedCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; csrf_token=${CSRF_TOKEN}`;
}

describe("admin cache/clear:CSRF/auth 守卫", () => {
  test("validateCsrfToken=false → 抛 403(不带 csrf cookie)", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(clearHandler, {
      method: "POST",
      cookie: session, // 仅 session,无 csrf cookie → 真实 validateCsrfToken 返 false
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("getUser=null → 抛 401(无 session)", async () => {
    await expect(callAdmin(clearHandler, {
      method: "POST",
      cookie: `csrf_token=${CSRF_TOKEN}`, // csrf 有,但 session 无 → 真实 getUser 返 null
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("admin cache/clear:redis 未配置", () => {
  test("redis=null → {success:false, matched:0, cleared:0, message}", async () => {
    redisImpl = null;
    mock.module("#server/utils/redis", () => ({ redis: null }));
    const cookie = await authedCookie();
    const res = await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean; matched: number; cleared: number; message?: string };
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
    const cookie = await authedCookie();
    const res = await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean; matched: number; cleared: number };
    expect(res.success).toBe(true);
    expect(res.matched).toBe(-1);
    expect(res.cleared).toBe(-1);
    expect(redisImpl.calls.find(c => c.method === "flushdb")).toBeDefined();
  });

  test("action=search → pattern 精确 'search:*'(不模糊匹配),扫到 key 即 unlink", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["search:hello:type", "search:foo:bar"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const cookie = await authedCookie();
    const res = await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { matched: number; cleared: number };
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
    const cookie = await authedCookie();
    const res = await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { matched: number; cleared: number; note?: string };
    expect(res.matched).toBe(0);
    expect(res.note).toContain("没有匹配");
  });

  test("action=footprint → 精确键 'custom:footprint'", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["custom:footprint"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const cookie = await authedCookie();
    await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "footprint" },
    });
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    expect(scanCall?.args).toContain("custom:footprint");
  });

  test("action=keyword → value 走 clearBySubstring(pattern = `*${value}*`)", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", ["foo:bar:1", "baz:foo:2"]);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const cookie = await authedCookie();
    const res = await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "foo" },
    }) as { matched: number };
    expect(res.matched).toBe(2);
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    expect(scanCall?.args).toContain("*foo*");
  });

  test("action=keyword value 含通配符 → 内部 *?[ ] 被剥离,pattern 仍含首尾 *", async () => {
    redisImpl = makeFakeRedis();
    redisImpl.pushScan("0", []);
    mock.module("#server/utils/redis", () => ({ redis: redisImpl!.redis }));
    const cookie = await authedCookie();
    await callAdmin(clearHandler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "foo*?[bar]" },
    });
    const scanCall = redisImpl.calls.find(c => c.method === "scan");
    const pattern = scanCall!.args[2] as string;
    expect(pattern).toBe("*foobar*");
  });

  test("action=keyword value 非字符串 → 400(防 .trim 抛 TypeError)", async () => {
    const fake = makeFakeRedis();
    redisImpl = fake;
    mock.module("#server/utils/redis", () => ({ redis: fake.redis }));
    const cookie = await authedCookie();
    await expect(
      callAdmin(clearHandler, {
        method: "POST", cookie,
        body: { csrfToken: CSRF_TOKEN, action: "keyword", value: 123 as unknown as string },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("action=keyword value 为空字符串 → 400", async () => {
    const fake = makeFakeRedis();
    redisImpl = fake;
    mock.module("#server/utils/redis", () => ({ redis: fake.redis }));
    const cookie = await authedCookie();
    await expect(
      callAdmin(clearHandler, {
        method: "POST", cookie,
        body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "   " },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("action 未知 → 400", async () => {
    const fake = makeFakeRedis();
    redisImpl = fake;
    mock.module("#server/utils/redis", () => ({ redis: fake.redis }));
    const cookie = await authedCookie();
    await expect(
      callAdmin(clearHandler, {
        method: "POST", cookie,
        body: { csrfToken: CSRF_TOKEN, action: "bogus" as never },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin cache/clear:异常处理", () => {
  test("redis.scan 抛错(非 statusCode)→ 抛 500 '缓存清理失败'", async () => {
    const fake = makeFakeRedis();
    redisImpl = fake;
    fake.redis.scan = async () => { throw new Error("ECONNRESET"); };
    mock.module("#server/utils/redis", () => ({ redis: fake.redis }));
    const origErr = console.error;
    console.error = () => {};
    try {
      const cookie = await authedCookie();
      await expect(callAdmin(clearHandler, {
        method: "POST", cookie,
        body: { csrfToken: CSRF_TOKEN, action: "search" },
      })).rejects.toMatchObject({
        statusCode: 500,
        message: "缓存清理失败",
      });
    } finally {
      console.error = origErr;
    }
  });

  test("内部抛带 statusCode 错误 → 原样抛(不被吞成 500)", async () => {
    const fake = makeFakeRedis();
    redisImpl = fake;
    mock.module("#server/utils/redis", () => ({ redis: fake.redis }));
    const cookie = await authedCookie();
    await expect(
      callAdmin(clearHandler, {
        method: "POST", cookie,
        body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});