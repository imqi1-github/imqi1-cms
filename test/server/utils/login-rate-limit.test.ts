import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// redis 置 null → 全走内存兜底分支(Redis 优先路径另有 try/catch,此处聚焦兜底语义)
mock.module("#server/utils/redis", () => ({ redis: null }));

const {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
  hasRecentFailures,
} = await import("#server/utils/login-rate-limit");

describe("login-rate-limit(内存兜底分支)", () => {
  test("初始状态:未锁定、无近期失败", async () => {
    const ip = "10.1.1.1";
    expect(await checkLoginRateLimit(ip)).toEqual({ locked: false, retryAfter: 0 });
    expect(await hasRecentFailures(ip)).toBe(false);
  });

  test("失败 <5 次不锁定,但 hasRecentFailures 为 true(自适应验证码)", async () => {
    const ip = "10.1.1.2";
    for (let i = 0; i < 4; i++) await recordLoginFailure(ip);
    const r = await checkLoginRateLimit(ip);
    expect(r.locked).toBe(false);
    expect(await hasRecentFailures(ip)).toBe(true);
  });

  test("达到 5 次失败锁定,resetLoginAttempts 解锁", async () => {
    const ip = "10.1.1.3";
    for (let i = 0; i < 5; i++) await recordLoginFailure(ip);
    const locked = await checkLoginRateLimit(ip);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfter).toBeGreaterThan(0);

    await resetLoginAttempts(ip);
    expect(await checkLoginRateLimit(ip)).toEqual({ locked: false, retryAfter: 0 });
    expect(await hasRecentFailures(ip)).toBe(false);
  });

  test("reset 对未知 IP 幂等", async () => {
    await expect(resetLoginAttempts("10.1.1.9")).resolves.toBeUndefined();
  });
});
