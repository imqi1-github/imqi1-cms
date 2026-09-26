import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";

const _fakePrisma = await import("#test/helpers/fake-prisma");
void _fakePrisma;

// ===== redis 假件 =====
const redisStub = {
  scanCalls: [] as Array<unknown[]>,
  unlinkCalls: [] as Array<unknown[]>,
  flushdbCalled: false,
  scanResults: [] as Array<{ cursor: string, keys: string[] }>,
  // 模拟 scan 每次 next cursor
  scanCursor: "0",
  scanHits: 0,
  scanLimit: 0, // scan 调用的次数限制
};
const redisModule = {
  redis: {
    async scan(...args: unknown[]) {
      redisStub.scanCalls.push(args);
      const result = redisStub.scanResults.shift() ?? { cursor: "0", keys: [] };
      redisStub.scanHits++;
      if (redisStub.scanLimit && redisStub.scanHits > redisStub.scanLimit) {
        return ["0", []];
      }
      return [result.cursor, result.keys];
    },
    async unlink(...keys: unknown[]) {
      redisStub.unlinkCalls.push(keys);
      return keys.length;
    },
    async flushdb() {
      redisStub.flushdbCalled = true;
      return "OK";
    },
  },
};
mock.module("#server/utils/redis", () => redisModule);

const cacheClearHandler = (await import("#server/api/admin/cache/clear.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  redisStub.scanCalls.length = 0;
  redisStub.unlinkCalls.length = 0;
  redisStub.flushdbCalled = false;
  redisStub.scanResults.length = 0;
  redisStub.scanHits = 0;
  redisStub.scanLimit = 0;
});

describe("cache/clear.post", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(cacheClearHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { action: "all", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "all" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("action='all' → flushdb + 返回 success + matched=-1", async () => {
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "all", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, matched: number };
    expect(r.success).toBe(true);
    expect(r.matched).toBe(-1);
    expect(redisStub.flushdbCalled).toBe(true);
  });

  test("action='search' → scan + unlink search:* 键", async () => {
    redisStub.scanResults.push({ cursor: "0", keys: ["search:foo", "search:bar", "search:baz"] });
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "search", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, cleared: number };
    expect(r.success).toBe(true);
    expect(r.cleared).toBe(3);
  });

  test("action='search' 无匹配 → cleared=0 + note", async () => {
    redisStub.scanResults.push({ cursor: "0", keys: [] });
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "search", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { cleared: number, note: string };
    expect(r.cleared).toBe(0);
    expect(r.note).toContain("没有匹配");
  });

  test("action='footprint' → scan + unlink custom:footprint", async () => {
    redisStub.scanResults.push({ cursor: "0", keys: ["custom:footprint:1", "custom:footprint:2"] });
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "footprint", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { cleared: number };
    expect(r.cleared).toBe(2);
  });

  test("action='preset' value 空 → 400 未知的缓存类别", async () => {
    await expect(callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "preset", value: "", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/未知的缓存类别/);
  });

  test("action='keyword' value 非字符串 → 400 请输入关键词", async () => {
    await expect(callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "keyword", value: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/关键词/);
  });

  test("action='keyword' + value='abc' → 子串匹配清除", async () => {
    redisStub.scanResults.push({ cursor: "0", keys: ["foo:abc:1", "bar:abc:2"] });
    const r = await callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "keyword", value: "abc", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { cleared: number };
    expect(r.cleared).toBe(2);
  });

  test("未知 action → 400", async () => {
    await expect(callAdmin(cacheClearHandler, {
      method: "POST",
      body: { action: "unknown", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/未知/);
  });
});
