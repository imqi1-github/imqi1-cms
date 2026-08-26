/**
 * 登录限流（按 IP，内存实现）
 *
 * 用于缓解 /api/auth/login 暴力破解：窗口内失败次数达阈值后锁定一段时间。
 *
 * 局限：基于进程内存 Map，进程重启清零；多实例/集群部署下各实例计数独立
 * （单用户博客通常单实例，可接受；若将来多实例可改造为复用 session-store 后端）。
 */

import type { AttemptRecord, RateLimitResult } from "#server/types/utils/login-rate-limit";

const MAX_ATTEMPTS = 5; // 窗口内允许失败次数上限
const WINDOW_MS = 15 * 60 * 1000; // 15 分钟统计窗口
const LOCK_MS = 15 * 60 * 1000; // 触发后锁定 15 分钟
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟清理过期记录

const records = new Map<string, AttemptRecord>();
let lastCleanup = Date.now();

// 定期清理过期记录，避免 Map 无限增长
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
export function checkLoginRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  ensureCleanup(now);
  const rec = records.get(ip);
  if (rec && rec.lockedUntil > now) {
    return { locked: true, retryAfter: rec.lockedUntil - now };
  }
  return { locked: false, retryAfter: 0 };
}

/** 记录一次登录失败，达到阈值则锁定 */
export function recordLoginFailure(ip: string): void {
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
export function resetLoginAttempts(ip: string): void {
  records.delete(ip);
}
