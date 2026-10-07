/**
 * consumeRateLimit Redis 分支:INCR/EXPIRE 窗口 + 无 TTL 残留键自愈(回归:INCR 后
 * EXPIRE 前崩溃会留下永久键,曾致该 IP 永久 429)。内存分支见 rate-limit-memory.test.ts。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ m: string; args: unknown[] }> = [];
// noTtl 里的键 ttl() 返回 -1:模拟 INCR 与 EXPIRE 之间崩溃留下的无窗口残留键
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

const { consumeRateLimit } = await import("#server/utils/rate-limit");

describe("consumeRateLimit:Redis 分支", () => {
  test("首次请求 incr=1 → 设一次 expire 窗口,放行", async () => {
    const r = await consumeRateLimit({ key: "t:first", limit: 3, windowSec: 60 });
    expect(r).toMatchObject({ allowed: true, count: 1, retryAfterMs: 0 });
    expect(calls.filter(c => c.m === "expire")).toEqual([{ m: "expire", args: ["rl:t:first", 60] }]);
  });

  test("窗口内累计超限 → 拒绝 + retryAfterMs 取自 ttl;正常键不重复 expire", async () => {
    counters.set("rl:t:busy", 3); // 已有 3 次(带 TTL,fake 默认 ttl=300)
    const r = await consumeRateLimit({ key: "t:busy", limit: 3, windowSec: 60 });
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(4);
    expect(r.retryAfterMs).toBe(300_000);
    expect(calls.filter(c => c.m === "expire")).toEqual([]);
  });

  test("回归:无 TTL 残留键(count 已超限)→ 拒绝的同时补设 expire,不再永久锁死", async () => {
    // 模拟崩溃残留:计数已到 5,但键没有 TTL
    counters.set("rl:t:stuck", 5);
    noTtl.add("rl:t:stuck");
    const r = await consumeRateLimit({ key: "t:stuck", limit: 3, windowSec: 60 });
    expect(r.allowed).toBe(false);
    // 自愈:本次请求把窗口补回去
    expect(calls).toContainEqual({ m: "expire", args: ["rl:t:stuck", 60] });
    expect(noTtl.has("rl:t:stuck")).toBe(false);
  });

  test("Redis 异常 fail-open → 回落内存分支首次放行", async () => {
    throwOnIncr = true;
    const r = await consumeRateLimit({ key: "t:down", limit: 1, windowSec: 60 });
    expect(r).toMatchObject({ allowed: true, count: 1 });
  });
});
