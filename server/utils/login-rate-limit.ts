/**
 * 登录限流（按 IP，Redis 优先、内存兜底）
 *
 * 用于缓解 /api/auth/login 暴力破解：窗口内失败次数达阈值后锁定一段时间。
 * 有 Redis 时用 INCR+EXPIRE 持久计数（跨重启/多实例共享）；Redis 不可用或未配置时
 * 回落进程内存 Map（重启清零，单实例）。判定是否要「自适应验证码」用 hasRecentFailures。
 *
 * 任何 Redis 异常都不应阻断登录 —— 用 try/catch 包住 Redis 路径，出错则走内存分支。
 */

import type { AttemptRecord, RateLimitResult } from "#server/types/utils/login-rate-limit";
import { redis } from "#server/utils/redis";

const MAX_ATTEMPTS = 5; // 窗口内允许失败次数上限
const WINDOW_MS = 15 * 60 * 1000; // 15 分钟统计窗口
const LOCK_MS = 15 * 60 * 1000; // 触发后锁定 15 分钟
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟清理过期记录（内存模式）
const WINDOW_SEC = WINDOW_MS / 1000;
const LOCK_SEC = LOCK_MS / 1000;

/** Redis 模式：IP 计数 / 锁定 键名 */
const failKey = (ip: string) => `login:fail:${ip}`;
const lockKey = (ip: string) => `login:lock:${ip}`;

// 内存兜底存储
const records = new Map<string, AttemptRecord>();
let lastCleanup = Date.now();

// 定期清理过期记录，避免 Map 无限增长（内存模式）
function ensureCleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  for (const [ip, rec] of records) {
    if (rec.lockedUntil < now && rec.windowStart + WINDOW_MS < now) {
      records.delete(ip);
    }
  }
  lastCleanup = now;
}

/** 检查指定 IP 是否被锁定 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  if (redis) {
    try {
      const ttl = await redis.ttl(lockKey(ip));
      return ttl > 0 ? { locked: true, retryAfter: ttl * 1000 } : { locked: false, retryAfter: 0 };
    } catch {
      // Redis 不可用，回落内存
    }
  }

  const now = Date.now();
  ensureCleanup(now);
  const rec = records.get(ip);
  if (rec && rec.lockedUntil > now) {
    return { locked: true, retryAfter: rec.lockedUntil - now };
  }
  return { locked: false, retryAfter: 0 };
}

/** 记录一次登录失败，达到阈值则锁定 */
export async function recordLoginFailure(ip: string): Promise<void> {
  if (redis) {
    try {
      const count = await redis.incr(failKey(ip));
      if (count === 1) await redis.expire(failKey(ip), WINDOW_SEC);
      if (count >= MAX_ATTEMPTS) await redis.set(lockKey(ip), "1", "EX", LOCK_SEC);
      return;
    } catch {
      // Redis 不可用，回落内存
    }
  }

  const now = Date.now();
  let rec = records.get(ip);
  if (!rec || rec.windowStart + WINDOW_MS < now) {
    rec = { failures: 0, windowStart: now, lockedUntil: 0 };
    records.set(ip, rec);
  }
  rec.failures += 1;
  if (rec.failures >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCK_MS;
  }
}

/** 登录成功后重置该 IP 的失败计数 */
export async function resetLoginAttempts(ip: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(failKey(ip), lockKey(ip));
      return;
    } catch {
      // Redis 不可用，回落内存
    }
  }
  records.delete(ip);
}

/**
 * 该 IP 在统计窗口内是否已有失败 —— 用于「自适应验证码」：
 * 平时（无失败）登录零摩擦；一旦失败过就要求图形验证码，挡住脚本撞库。
 */
export async function hasRecentFailures(ip: string): Promise<boolean> {
  if (redis) {
    try {
      const count = await redis.get(failKey(ip));
      return Number(count) > 0;
    } catch {
      // Redis 不可用，回落内存
    }
  }
  const rec = records.get(ip);
  return !!rec && rec.failures > 0;
}
