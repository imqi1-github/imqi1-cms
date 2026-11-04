/**
 * 缓存读写门面
 *
 * 后端优先 Redis，未启用或调用异常时回落进程内内存（生产可以不装 Redis）。
 * 页面缓存不在这里——页面缓存已迁到 CDN 边缘缓存，见 `server/utils/cdn/`。
 */

import { memoryDel, memoryExpire, memoryGet, memoryIncr, memorySetex, memoryTtl } from "./memory-store";

import { redis } from "#server/utils/redis";

/**
 * 开发环境恒不启用缓存（与「开发恒不启用 Redis」同口径）。
 *
 * 本地要能立刻看到刚改的数据；开了缓存就会搜到旧结果（e2e 的搜索用例就是这么发现问题的）。
 * 生产（即使没装 Redis）的内存兜底不受影响——那里没有「本地调试」需求。
 * 测试环境保持启用：单测要能断言缓存读写确实发生了。
 */
function cacheDisabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** 当前生效的后端：Redis 已配置但未连通时仍报 redis（读操作会自行回落内存） */
export function cacheBackend(): "redis" | "memory" {
  if (cacheDisabled()) return "memory";
  return redis ? "redis" : "memory";
}

/** 读取字符串值 */
export async function cacheGet(key: string): Promise<string | null> {
  if (cacheDisabled()) return null;
  if (redis) {
    try {
      return await redis.get(key);
    } catch (error) {
      console.error("[cache] Redis 读取失败，回落内存:", error);
    }
  }
  return memoryGet(key);
}

/** 写入并设 TTL（秒） */
export async function cacheSetex(key: string, ttlSec: number, value: string): Promise<void> {
  if (cacheDisabled()) return;
  if (redis) {
    try {
      await redis.setex(key, ttlSec, value);
      return;
    } catch (error) {
      console.error("[cache] Redis 写入失败，回落内存:", error);
    }
  }
  await memorySetex(key, ttlSec, value);
}

/** 删除键 */
export async function cacheDel(key: string): Promise<void> {
  if (cacheDisabled()) return;
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      console.error("[cache] Redis 删除失败，回落内存:", error);
    }
  }
  await memoryDel(key);
}

/** 自增计数（键不存在时从 1 起） */
export async function cacheIncr(key: string): Promise<number> {
  if (cacheDisabled()) return 1;
  if (redis) {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error("[cache] Redis 自增失败，回落内存:", error);
    }
  }
  return memoryIncr(key);
}

/** 设 TTL（秒）：键不存在返回 0 */
export async function cacheExpire(key: string, ttlSec: number): Promise<number> {
  if (cacheDisabled()) return 0;
  if (redis) {
    try {
      return await redis.expire(key, ttlSec);
    } catch (error) {
      console.error("[cache] Redis 设 TTL 失败，回落内存:", error);
    }
  }
  return memoryExpire(key, ttlSec);
}

/** 剩余 TTL（秒）：-1 = 无 TTL，-2 = 键不存在 */
export async function cacheTtl(key: string): Promise<number> {
  if (cacheDisabled()) return -1;
  if (redis) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error("[cache] Redis 读 TTL 失败，回落内存:", error);
    }
  }
  return memoryTtl(key);
}
