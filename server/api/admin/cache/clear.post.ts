import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { redis } from "#server/utils/redis";
import { cacheClearByPrefix, cacheClearBySubstring } from "#server/utils/cache/store";
import { clearMemoryLoginLocks } from "#server/utils/login-rate-limit";
import { clearMemoryRateLimits } from "#server/utils/rate-limit";
import { clearSourceCacheByKeyword } from "#server/utils/source-cache";
import { invalidateContentCaches } from "#server/utils/content-cache";
import type { CacheClearBody, CacheClearResponse } from "#server/types/apis/cache";
import { logAdminAudit } from "#server/utils/audit";

/**
 * 后台缓存清理。
 *
 * 三层缓存各有各的键空间：源站页面缓存（Nitro 缓存组，Redis 或文件）、
 * 短期缓存（搜索/足迹/限流，Redis 或进程内内存）、CDN 边缘缓存（不在本进程，走刷新接口）。
 * 这里能清前两层；边缘缓存走 /api/admin/cache/cdn-purge。
 */
export default defineEventHandler(async event => {
  const body = await readBody<CacheClearBody>(event);
  const { csrfToken, action, value } = body ?? {};

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 验证用户登录
  const user = await getUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    if (action === "all") {
      if (redis) await redis.flushdb();
      // 源站页面缓存清空 + 触发一次边缘刷新（否则边缘仍是旧 HTML）
      await invalidateContentCaches();
      clearMemoryRateLimits();
      clearMemoryLoginLocks();
      await logAdminAudit({
        actor: { uid: user.uid, name: user.name },
        action: "cache.clear",
        target: { type: "cache" },
      });
      return {
        success: true,
        matched: -1,
        cleared: -1,
        note: "已清空源站缓存与进程内短期缓存，并提交一次 CDN 边缘刷新（边缘缓存需另行刷新）",
      } satisfies CacheClearResponse;
    }

    // 仅清自定义搜索缓存：search.get.ts 写入的 search:${q}:${type} 键（前缀精确匹配）
    if (action === "search") {
      const total = await cacheClearByPrefix(["search:"]);
      return clearedResponse(total, "没有匹配的搜索缓存键");
    }

    // 自定义缓存：足迹地理位置等（footprint.get.ts 写入 custom:footprint 前缀，非 ISR）
    if (action === "footprint") {
      const total = await cacheClearByPrefix(["custom:footprint"]);
      return clearedResponse(total, "没有匹配的足迹缓存键");
    }

    // preset 与 keyword 都按键名子串匹配删除（源站页面缓存 + 进程内短期缓存）
    if (action === "preset" || action === "keyword") {
      // readBody 仅类型标注无运行时校验：value 可能是数字/对象/数组，直接 .trim() 会抛 TypeError
      const keyword = typeof value === "string" ? value.trim() : "";
      if (!keyword) {
        throw createError({
          statusCode: 400,
          message: action === "preset" ? "未知的缓存类别" : "请输入关键词",
        });
      }
      // 剥掉通配符：关键词是子串匹配，不是 glob，传 * 会误删一批键
      const safe = keyword.replace(/[\\*?[\]]/g, "");
      if (!safe) {
        return {
          success: true,
          matched: 0,
          cleared: 0,
          note: "关键词只含通配符，未清理任何键",
        } satisfies CacheClearResponse;
      }
      const pages = await clearSourceCacheByKeyword(safe);
      const others = await cacheClearBySubstring(safe);
      if (others < 0) return redisUnavailable();
      const total = pages + others;
      return clearedResponse(total, "没有匹配该关键词的缓存键");
    }

    throw createError({ statusCode: 400, message: "未知的操作类型" });
  } catch (error) {
    // 带 statusCode 的错误（400/403/401）原样抛，避免被 500 覆盖
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[缓存清理失败]", error);
    throw createError({ statusCode: 500, message: "缓存清理失败" });
  }
});

/** 清理结果响应（-1 = Redis 不可用，降级提示而不是报成功） */
function clearedResponse(total: number, emptyNote: string): CacheClearResponse {
  if (total < 0) return redisUnavailable();
  return {
    success: true,
    matched: total,
    cleared: total,
    note: total === 0 ? emptyNote : undefined,
  };
}

/** Redis 不可用时的降级响应 */
function redisUnavailable(): CacheClearResponse {
  return {
    success: false,
    matched: -1,
    cleared: -1,
    message: "Redis 不可用,无法执行清理",
  };
}
