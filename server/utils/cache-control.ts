/**
 * 边缘缓存头的计算（纯函数，不依赖 Nitro 类型，便于单测直接引用）。
 *
 * 两档 TTL：列表/统计页短（评论数等聚合数据靠 TTL 收敛），内容页长（靠精确 URL 刷新）。
 */

import { siteConfig } from "~~/site.config";
import { isBrowserRevalidateApi, isCdnCachedPage, isListPageRoute } from "#server/utils/cache-routes";

const PAGE_S_MAXAGE = siteConfig.build.pageCacheSeconds;
const LIST_S_MAXAGE = siteConfig.build.listPageCacheSeconds;
const API_S_MAXAGE = 60;

/** 页面的边缘缓存头：列表页短 TTL、内容页长 TTL */
export function pageCacheControl(path: string): string {
  const sMaxage = isListPageRoute(path) ? LIST_S_MAXAGE : PAGE_S_MAXAGE;
  return `public, max-age=0, s-maxage=${sMaxage}`;
}

/** 公开接口的边缘缓存头 */
export function apiCacheControl(): string {
  return `public, max-age=0, s-maxage=${API_S_MAXAGE}`;
}

/**
 * 304 响应的缓存头（按路径判定，不看 content-type——304 路径上它可能已被删）。
 *
 * 返回 null = 不干预（保留原头，例如 no-store 的后台路径）。
 */
export function cacheControlFor304(path: string): string | null {
  if (isCdnCachedPage(path)) return pageCacheControl(path);
  if (isBrowserRevalidateApi(path)) return apiCacheControl();
  return null;
}
