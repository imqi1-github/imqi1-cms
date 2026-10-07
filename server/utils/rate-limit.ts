/**
 * 通用限流工具：Redis 优先 + 内存兜底；与 login-rate-limit 同范式但抽公共。
 *
 * 与 login-rate-limit 的关系：
 *   login 那条独立保留——它有「窗口滑动 + 失败计数 + 锁定」三段式语义，与本通用
 *   「窗口内总请求数」计数器不同（不应共用同一个 helper）。
 *
 * 用法（典型）：
 *   const r = await consumeRateLimit({
 *     key: `comments:post:${ip}`,
 *     limit: 3,
 *     windowSec: 60,
 *   });
 *   if (!r.allowed) throw createError({ statusCode: 429, message: "请求过于频繁" });
 *
 * 行为：
 *   - Redis 可用 → INCR + EXPIRE（首次 INCR 才设 EXPIRE，避免续期窗口）；
 *   - Redis 不可用或未配置 → 内存 Map（重启清零，单实例适用）；
 *   - 计数 > limit → allowed=false，retryAfterMs 给出剩余秒数。
 *   - Redis/内存异常 → fail-open（不阻断业务），日志告警。
 */

import { redis } from "./redis";

export interface ConsumeRateLimitOptions {
  /** Redis 键（不含前缀）；建议带 IP / fingerprint 等命名空间，避免不同限流规则互相覆盖 */
  key: string;
  /** 窗口内允许的最大次数 */
  limit: number;
  /** 窗口大小（秒）。首次超过 limit 后需等该秒数才能再次计数清零 */
  windowSec: number;
}

export interface ConsumeRateLimitResult {
  allowed: boolean;
  /** 当前窗口内的累计次数 */
  count: number;
  /** 距离窗口重置的剩余毫秒（allowed=false 时有效） */
  retryAfterMs: number;
}

// 内存兜底：key -> [windowStartMs, count, windowSec]
// 条目不会自然消失（只有同 key 再来请求才覆写），换 IP 刷接口会无限堆积，
// 超过容量上限时先清扫过期条目、仍满则按插入序丢最旧
const memoryStore = new Map<string, { windowStart: number; count: number; windowSec: number }>();
const MAX_MEMORY_ENTRIES = 10_000;

function sweepMemoryStore(): void {
  const now = Date.now();
  for (const [k, rec] of memoryStore) {
    if (now - rec.windowStart >= rec.windowSec * 1000) memoryStore.delete(k);
  }
  while (memoryStore.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryStore.keys().next().value;
    if (oldest === undefined) break;
    memoryStore.delete(oldest);
  }
}

export async function consumeRateLimit(opts: ConsumeRateLimitOptions): Promise<ConsumeRateLimitResult> {
  const { key, limit, windowSec } = opts;

  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        // 首次进入才设窗口；续期会被 incr 后再 expire 一下保持简单
        await redis.expire(redisKey, windowSec);
      } else if ((await redis.ttl(redisKey)) === -1) {
        // 自愈：INCR 与 EXPIRE 之间崩溃会留下无 TTL 键 → 该 key 永久限流，补上窗口
        await redis.expire(redisKey, windowSec);
      }
      if (count > limit) {
        const ttl = await redis.ttl(redisKey);
        const retryAfterMs = ttl > 0 ? ttl * 1000 : windowSec * 1000;
        return { allowed: false, count, retryAfterMs };
      }
      return { allowed: true, count, retryAfterMs: 0 };
    } catch (error) {
      console.error("[rate-limit] Redis 不可用，回落内存:", error);
      // 继续走内存分支
    }
  }

  // 内存兜底
  const now = Date.now();
  const rec = memoryStore.get(key);
  if (!rec || now - rec.windowStart >= windowSec * 1000) {
    if (!memoryStore.has(key) && memoryStore.size >= MAX_MEMORY_ENTRIES) sweepMemoryStore();
    memoryStore.set(key, { windowStart: now, count: 1, windowSec });
    return { allowed: true, count: 1, retryAfterMs: 0 };
  }
  rec.count += 1;
  if (rec.count > limit) {
    const retryAfterMs = rec.windowStart + windowSec * 1000 - now;
    return { allowed: false, count: rec.count, retryAfterMs };
  }
  return { allowed: true, count: rec.count, retryAfterMs: 0 };
}