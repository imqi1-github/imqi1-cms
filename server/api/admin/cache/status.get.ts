import { getUser } from "#server/lib/auth";
import { redis } from "#server/utils/redis";
import { createCdnProvider, isCdnDisabledByEnv, isCdnQuotaExhausted } from "#server/utils/cdn";
import type { CacheStatusResponse } from "#server/types/apis/cache";

/**
 * 缓存管理页的状态：哪些缓存能力当前可用
 *
 * 后端按配置逐个探测（Redis 是否配置、CDN 刷新是否可用、剩余额度），
 * 前端据此把不可用的功能灰显，避免点了才报「未配置」。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  const provider = createCdnProvider();

  let quota = null;
  if (provider?.isEnabled() && provider.describeQuota) {
    try {
      quota = await provider.describeQuota();
    } catch (error) {
      console.error("[cache/status] 查询刷新额度失败:", error);
    }
  }

  return {
    redis: { configured: Boolean(redis) },
    cdn: {
      enabled: provider?.isEnabled() ?? false,
      provider: provider?.name ?? null,
      disabledByEnv: isCdnDisabledByEnv(),
      quotaExhausted: isCdnQuotaExhausted(),
      quota,
    },
  } satisfies CacheStatusResponse;
});
