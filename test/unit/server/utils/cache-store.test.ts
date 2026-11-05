// 缓存门面（server/utils/cache/store.ts）：开发环境恒不启用缓存，
// 否则本地会看到旧数据（e2e 搜索用例就是这么发现内存兜底把 dev 也缓存了）。
import "#test/helpers/nitro-globals";

import { afterEach, describe, expect, test } from "bun:test";

import { cacheClearByPrefix, cacheClearBySubstring, cacheExpire, cacheGet, cacheIncr, cacheSetex, cacheTtl } from "#server/utils/cache/store";

const ORIGINAL_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe("缓存门面", () => {
  test("开发环境：读为 null、写不生效（本地不该看到陈旧数据）", async () => {
    process.env.NODE_ENV = "development";
    const key = `dev-${Date.now()}`;
    await cacheSetex(key, 60, "v");
    expect(await cacheGet(key)).toBeNull();
    expect(await cacheTtl(key)).toBe(-1);
    // 计数器在开发环境等同未启用：每次都从 1 起（不限流，与「无 Redis」时的行为一致）
    expect(await cacheIncr(key)).toBe(1);
  });

  test("非开发环境：写入后能读回", async () => {
    process.env.NODE_ENV = "production";
    const key = `prod-${Date.now()}`;
    await cacheSetex(key, 60, "v");
    expect(await cacheGet(key)).toBe("v");
  });

  test("非开发环境：改 TTL 真的生效（回归：漏传 ttlSec 会让 TTL 变 NaN 永不过期）", async () => {
    process.env.NODE_ENV = "production";
    const key = `prod-exp-${Date.now()}`;
    await cacheSetex(key, 600, "v");
    await cacheExpire(key, 30);
    const ttl = await cacheTtl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  // 回归：不装 Redis 时搜索/足迹/限流计数都在内存里，运维清理必须仍能生效
  test("按前缀清理：内存后端清掉匹配的键，不动其它键", async () => {
    process.env.NODE_ENV = "production";
    const stamp = Date.now();
    await cacheSetex(`search:q${stamp}`, 60, "v");
    await cacheSetex(`custom:footprint${stamp}`, 60, "v");
    const cleared = await cacheClearByPrefix(["search:"]);
    expect(cleared).toBe(1);
    expect(await cacheGet(`search:q${stamp}`)).toBeNull();
    expect(await cacheGet(`custom:footprint${stamp}`)).toBe("v");
  });

  test("按子串清理：内存后端按包含关系删键", async () => {
    process.env.NODE_ENV = "production";
    const stamp = Date.now();
    await cacheSetex(`kw-${stamp}-a`, 60, "v");
    await cacheSetex(`kw-${stamp}-b`, 60, "v");
    const cleared = await cacheClearBySubstring(`kw-${stamp}`);
    expect(cleared).toBe(2);
    expect(await cacheGet(`kw-${stamp}-a`)).toBeNull();
  });
});
