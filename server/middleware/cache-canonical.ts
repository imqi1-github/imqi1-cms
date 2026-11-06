import { getQuery, getRequestPath, sendRedirect, setResponseHeader } from "h3";

import { canonicalSearch, isCdnCachedPage } from "#shared/cache-routes";

/**
 * 把带推广参数的请求规范化到「唯一 URL」。
 *
 * 边缘缓存键含查询串：`/content/x?utm_source=weibo` 与 `/content/x` 是两条独立缓存，
 * 而刷新只提交裸 URL → 带参链接的内容永远不更新（内容页 TTL 6 小时）。
 * 这里把不影响 SSR 的参数剥掉并 301 到规范 URL，边缘只存一条缓存，精确刷新即可覆盖。
 */
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV !== "production") return;
  if (event.method !== "GET" && event.method !== "HEAD") return;

  const raw = getRequestPath(event);
  const path = raw.split("?")[0] || "/";
  if (!isCdnCachedPage(path)) return;

  const query = getQuery(event);
  if (!Object.keys(query).length) return;

  const canonical = `${path}${canonicalSearch(path, query)}`;
  if (canonical === raw) return;

  setResponseHeader(event, "cache-control", "public, max-age=0, s-maxage=3600");
  return sendRedirect(event, canonical, 301);
});
