import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { redis } from "#server/utils/redis";
import type { CacheClearBody, CacheClearResponse } from "#server/types/apis/cache";

// SCAN 游标遍历 + UNLINK 非阻塞删除，避免大 key 阻塞 Redis
async function scanAndUnlink(pattern: string): Promise<number> {
  if (!redis) {
    return 0;
  }
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      await redis.unlink(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");
  return removed;
}

// 按关键词子串匹配删除（与宝塔面板搜键一致）：删除所有键名包含该词的缓存
async function clearBySubstring(keyword: string): Promise<number> {
  // 去掉通配符，避免注入异常 pattern
  const safe = keyword.replace(/[\\*?[\]]/g, "");
  if (!safe) {
    return 0;
  }
  return scanAndUnlink(`*${safe}*`);
}

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

  // Redis 未配置
  if (!redis) {
    return {
      success: false,
      matched: 0,
      cleared: 0,
      message: "未配置 Redis 连接，无需清理",
    } satisfies CacheClearResponse;
  }

  try {
    if (action === "all") {
      await redis.flushdb();
      return {
        success: true,
        matched: -1,
        cleared: -1,
        note: "已清空整个 Redis 数据库（含图标缓存，页面访问后会自动重建）",
      } satisfies CacheClearResponse;
    }

    // 仅清自定义搜索缓存：search.get.ts 写入的 search:${q}:${type} 键，前缀精确匹配，
    // 不碰 Nuxt 页面/ISR 缓存（与缓存管理页"搜索"预设的 *search* 子串匹配区分开）
    if (action === "search") {
      const total = await scanAndUnlink("search:*");
      return {
        success: true,
        matched: total,
        cleared: total,
        note: total === 0 ? "没有匹配的搜索缓存键" : undefined,
      } satisfies CacheClearResponse;
    }

    // 自定义缓存：足迹地理位置等（footprint.get.ts 写入 custom:* 前缀，非 ISR）
    if (action === "footprint") {
      const total = await scanAndUnlink("custom:footprint");
      return {
        success: true,
        matched: total,
        cleared: total,
        note: total === 0 ? "没有匹配的足迹缓存键" : undefined,
      } satisfies CacheClearResponse;
    }

    // preset 与 keyword 都按键名子串匹配删除
    if (action === "preset" || action === "keyword") {
      // readBody 仅类型标注无运行时校验：value 可能是数字/对象/数组，直接 .trim() 会抛 TypeError
      const keyword = typeof value === "string" ? value.trim() : "";
      if (!keyword) {
        throw createError({
          statusCode: 400,
          message: action === "preset" ? "未知的缓存类别" : "请输入关键词",
        });
      }
      const total = await clearBySubstring(keyword);
      return {
        success: true,
        matched: total,
        cleared: total,
        note: total === 0 ? "没有匹配该关键词的缓存键" : undefined,
      } satisfies CacheClearResponse;
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
