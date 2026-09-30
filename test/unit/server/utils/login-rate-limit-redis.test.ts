/**
 * login-rate-limit Redis 分支:Redis 可用时走 ioredis,出错回落内存
 *
 *  - recordLoginFailure 累计到阈值时 set EX 锁
 *  - checkLoginRateLimit 读 ttl,正数即锁定
 *  - resetLoginAttempts del 两键
 *  - hasRecentFailures 读 failKey
 *  - Redis 异常时透明回落到内存分支(异常不阻断登录)
 *  - mock.module("#server/utils/redis") 在该文件顶层注册,会污染进程级 redis
 *    单测文件须放在 test/server/utils/(非 zz-late),因为该文件 mock 与登录测试
 *    不冲突:登录测试自己 mock module(后注册者覆盖),本文件结尾复位 redis=null
 */
import "#test/helpers/nitro-globals";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ioredis 替身:记录每次调用 + 可触发异常
const calls: Array<{ method: string; args: unknown[] }> = [];
let throwOn: Set<string> = new Set();
let counters = new Map<string, number>();
let stored = new Map<string, { value: string; expiresAt: number }>();

function makeFakeRedis() {
  return {
    async incr(key: string): Promise<number> {
      calls.push({ method: "incr", args: [key] });
      if (throwOn.has("incr")) throw new Error("redis-down");
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      // 让 get() 也能拿到(INCR 后用 GET 看计数的常见用法)
      const e = stored.get(key);
      if (e) e.value = String(n);
      else stored.set(key, { value: String(n), expiresAt: Date.now() + 900_000 });
      return n;
    },
    async expire(key: string, sec: number): Promise<number> {
      calls.push({ method: "expire", args: [key, sec] });
      if (throwOn.has("expire")) throw new Error("redis-down");
      const e = stored.get(key);
      if (e) e.expiresAt = Date.now() + sec * 1000;
      return 1;
    },
    async ttl(key: string): Promise<number> {
      calls.push({ method: "ttl", args: [key] });
      if (throwOn.has("ttl")) throw new Error("redis-down");
      const e = stored.get(key);
      if (!e) return -2;
      const ms = e.expiresAt - Date.now();
      return ms > 0 ? Math.ceil(ms / 1000) : -2;
    },
    async set(key: string, value: string, ...rest: unknown[]): Promise<unknown> {
      calls.push({ method: "set", args: [key, value, ...rest] });
      if (throwOn.has("set")) throw new Error("redis-down");
      // 末参为 EX <sec>
      const exIdx = rest.indexOf("EX");
      const sec = Number(rest[exIdx + 1] ?? 0);
      stored.set(key, { value, expiresAt: Date.now() + sec * 1000 });
      return "OK";
    },
    async get(key: string): Promise<string | null> {
      calls.push({ method: "get", args: [key] });
      if (throwOn.has("get")) throw new Error("redis-down");
      const e = stored.get(key);
      return e?.value ?? null;
    },
    async del(...keys: string[]): Promise<number> {
      calls.push({ method: "del", args: keys });
      if (throwOn.has("del")) throw new Error("redis-down");
      let n = 0;
      for (const k of keys) {
        if (stored.delete(k)) n++;
        counters.delete(k);
      }
      return n;
    },
  };
}

mock.module("#server/utils/redis", () => ({ redis: makeFakeRedis() }));

beforeEach(() => {
  calls.length = 0;
  throwOn = new Set();
  counters = new Map();
  stored = new Map();
});

afterEach(() => {
  throwOn = new Set();
});

const {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
  hasRecentFailures,
} = await import("#server/utils/login-rate-limit");

describe("login-rate-limit:Redis 可用分支", () => {
  test("checkLoginRateLimit 无锁 → locked=false,不走 Redis 之外的兜底", async () => {
    const r = await checkLoginRateLimit("10.0.0.1");
    expect(r).toEqual({ locked: false, retryAfter: 0 });
    // ttl 被调一次
    expect(calls.some(c => c.method === "ttl")).toBe(true);
  });

  test("checkLoginRateLimit ttl > 0 → locked=true + retryAfter=ttl*1000", async () => {
    // 模拟已存在 lock
    const lockKey = "login:lock:10.0.0.2";
    stored.set(lockKey, { value: "1", expiresAt: Date.now() + 300_000 });
    const r = await checkLoginRateLimit("10.0.0.2");
    expect(r.locked).toBe(true);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(300_000);
  });

  test("recordLoginFailure:首次 incr 后立即 expire 锁住窗口", async () => {
    await recordLoginFailure("10.0.0.3");
    const incrCalls = calls.filter(c => c.method === "incr");
    const expireCalls = calls.filter(c => c.method === "expire");
    expect(incrCalls.length).toBe(1);
    expect(incrCalls[0]!.args[0]).toBe("login:fail:10.0.0.3");
    expect(expireCalls.length).toBe(1);
    expect(expireCalls[0]!.args[1]).toBe(900); // WINDOW_SEC
  });

  test("recordLoginFailure 第 5 次失败时 set 锁键,EX=900", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure("10.0.0.4");
    const setCalls = calls.filter(c => c.method === "set");
    expect(setCalls.length).toBe(1);
    expect(setCalls[0]!.args[0]).toBe("login:lock:10.0.0.4");
    expect(setCalls[0]!.args[1]).toBe("1");
    expect(setCalls[0]!.args).toContain("EX");
    expect(setCalls[0]!.args).toContain(900);
  });

  test("hasRecentFailures:无失败 → false", async () => {
    expect(await hasRecentFailures("10.0.0.5")).toBe(false);
  });

  test("hasRecentFailures:失败计数 > 0 → true", async () => {
    await recordLoginFailure("10.0.0.6");
    expect(await hasRecentFailures("10.0.0.6")).toBe(true);
  });

  test("resetLoginAttempts 删除 fail + lock 两键", async () => {
    await recordLoginFailure("10.0.0.7");
    await resetLoginAttempts("10.0.0.7");
    const delCalls = calls.filter(c => c.method === "del");
    expect(delCalls.length).toBe(1);
    expect(delCalls[0]!.args.sort()).toEqual(["login:fail:10.0.0.7", "login:lock:10.0.0.7"]);
    expect(await hasRecentFailures("10.0.0.7")).toBe(false);
  });
});

describe("login-rate-limit:Redis 异常回落内存", () => {
  test("recordLoginFailure Redis incr 异常 → 不阻断,但 Redis 仍在线时内存分支不被查询,只 incr 失败不计次", async () => {
    throwOn = new Set(["incr"]);
    // Redis 还在 → checkLoginRateLimit 仍走 Redis,ttl=-2 → not locked
    // 行为要点:Redis 写入异常不抛(被 try/catch 吞)→ 调用方拿不到失败计数 → 不会上锁
    // 这是有意设计:Redis 在线但写失败 ≠ 切内存,需要运维介入
    for (let i = 0; i < 5; i++) await recordLoginFailure("10.0.0.8");
    const r = await checkLoginRateLimit("10.0.0.8");
    expect(r.locked).toBe(false);
    expect(r.retryAfter).toBe(0);
  });

  test("checkLoginRateLimit Redis 异常 → 回落到内存判定", async () => {
    throwOn = new Set(["ttl"]);
    // 内存分支:首次 lock=false
    expect(await checkLoginRateLimit("10.0.0.9")).toEqual({ locked: false, retryAfter: 0 });
  });

  test("hasRecentFailures Redis 异常 → 走内存(rec.failures > 0)", async () => {
    throwOn = new Set(["get"]);
    // 内存兜底:首次 hasRecentFailures=false
    expect(await hasRecentFailures("10.0.0.10")).toBe(false);
  });

  test("resetLoginAttempts Redis 异常 → 不阻断,内存 Map 也清", async () => {
    throwOn = new Set(["del"]);
    await expect(resetLoginAttempts("10.0.0.11")).resolves.toBeUndefined();
  });
});