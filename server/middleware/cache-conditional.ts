import { getRequestPath } from "h3";

import { isBrowserRevalidateApi, isCdnCachedPage } from "#server/utils/cache-routes";

/**
 * 剥离条件请求头：Nitro 缓存处理器命中 If-None-Match 时直接回 304，
 * 并在 304 上写回 `max-age=<源站 TTL>`，CDN 会据此把边缘 TTL 顶回长值。
 * 让源站始终返回 200 + 改写后的 Cache-Control，短/长 TTL 才稳定。
 */
export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== "production") return;
  if (event.method !== "GET" && event.method !== "HEAD") return;

  const path = getRequestPath(event);
  if (!isCdnCachedPage(path) && !isBrowserRevalidateApi(path)) return;

  delete event.node.req.headers["if-none-match"];
  delete event.node.req.headers["if-modified-since"];
});
