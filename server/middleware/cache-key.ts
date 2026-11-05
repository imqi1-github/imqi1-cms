/**
 * 归一化源站缓存键里的查询串。
 *
 * Nitro 路由缓存的键含完整 URL（路径+查询串），爬虫带的推广参数（?source=…）
 * 会各自生成一份缓存文件并触发一次整页渲染；这里只保留会影响 SSR 输出的参数。
 */
import { getQuery, getRequestPath } from "h3";

import { isCdnCachedPage, matchesRoutePattern } from "#server/utils/cache-routes";

/** 各路由族里会影响 SSR 输出的查询参数（其余一律剥掉） */
const SIGNIFICANT_QUERY_PARAMS: Record<string, string[]> = {
  "/category/**": ["page"],
  "/tag/**": ["page"],
  "/map": ["view"],
  "/subscribes": ["source"],
  "/changelogs": ["type"],
};

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== "production") return;
  // h3 的 getRequestPath 带查询串，缓存路由匹配要的是纯路径
  const path = getRequestPath(event).split("?")[0] || "/";
  if (!isCdnCachedPage(path)) return;

  const query = getQuery(event);
  const names = Object.keys(query);
  if (!names.length) return;

  const keep = new Set<string>();
  for (const [pattern, params] of Object.entries(SIGNIFICANT_QUERY_PARAMS)) {
    if (matchesRoutePattern(path, pattern)) for (const param of params) keep.add(param);
  }
  if (names.every(name => keep.has(name))) return;

  const kept = names.filter(name => keep.has(name) && query[name] !== undefined);
  const search = kept.length
    ? `?${kept.map(name => `${name}=${encodeURIComponent(String(query[name]))}`).join("&")}`
    : "";
  event.node.req.originalUrl = `${path}${search}`;
});
