/**
 * isLikeRateLimited:Redis 5 分钟窗口 + 无 TTL 残留键自愈(回归:INCR/EXPIRE 间隙
 * 崩溃曾会永久封死该访客对该文章的点赞)。Redis 异常 fail-open 由唯一约束兜底。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ m: string; args: unknown[] }> = [];
const noTtl = new Set<string>();
const counters = new Map<string, number>();
let throwOnIncr = false;

function makeFakeRedis() {
  return {
    async incr(key: string): Promise<number> {
      calls.push({ m: "incr", args: [key] });
      if (throwOnIncr) throw new Error("redis-down");
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n;
    },
    async expire(key: string, sec: number): Promise<number> {
      calls.push({ m: "expire", args: [key, sec] });
      noTtl.delete(key);
      return 1;
    },
    async ttl(key: string): Promise<number> {
      calls.push({ m: "ttl", args: [key] });
      return noTtl.has(key) ? -1 : 300;
    },
  };
}

mock.module("#server/utils/redis", () => ({ redis: makeFakeRedis() }));

beforeEach(() => {
  calls.length = 0;
  noTtl.clear();
  counters.clear();
  throwOnIncr = false;
});

const { isLikeRateLimited, LIKE_RATE_TTL_SECONDS, buildLikeRateKey } = await import("#server/utils/likes");

describe("isLikeRateLimited", () => {
  test("首次点赞 incr=1 → 设一次 300s 窗口,放行", async () => {
    const limited = await isLikeRateLimited(1, "fp-a");
    expect(limited).toBe(false);
    expect(calls).toContainEqual({ m: "expire", args: [buildLikeRateKey(1, "fp-a"), LIKE_RATE_TTL_SECONDS] });
  });

  test("窗口内重复 → 限流 true,不重复 expire", async () => {
    counters.set(buildLikeRateKey(2, "fp-b"), 1); // 已有 1 次,带 TTL
    expect(await isLikeRateLimited(2, "fp-b")).toBe(true);
    expect(calls.filter(c => c.m === "expire")).toEqual([]);
  });

  test("回归:无 TTL 残留键 → 限流同时补设窗口,不再永久封死", async () => {
    const key = buildLikeRateKey(3, "fp-c");
    counters.set(key, 1);
    noTtl.add(key);
    expect(await isLikeRateLimited(3, "fp-c")).toBe(true);
    expect(calls).toContainEqual({ m: "expire", args: [key, LIKE_RATE_TTL_SECONDS] });
    expect(noTtl.has(key)).toBe(false);
  });

  test("Redis 异常 → fail-open 放行(唯一约束兜底防写穿)", async () => {
    throwOnIncr = true;
    expect(await isLikeRateLimited(4, "fp-d")).toBe(false);
  });
});
