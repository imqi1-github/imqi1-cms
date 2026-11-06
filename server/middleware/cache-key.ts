import { getQuery, getRequestPath } from "h3";

import { canonicalSearch, isCdnCachedPage } from "#server/utils/cache-routes";

/**
 * 归一化源站缓存键里的查询串。
 *
 * Nitro 路由缓存的键含完整 URL（路径+查询串），爬虫带的推广参数（?source=…）
 * 会各自生成一份缓存文件并触发一次整页渲染；这里只保留会影响 SSR 输出的参数。
 */
export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== "production") return;
  // h3 的 getRequestPath 带查询串，缓存路由匹配要的是纯路径
  const path = getRequestPath(event).split("?")[0] || "/";
  if (!isCdnCachedPage(path)) return;

  const query = getQuery(event);
  if (!Object.keys(query).length) return;

  const search = canonicalSearch(path, query);
  event.node.req.originalUrl = `${path}${search}`;
});
