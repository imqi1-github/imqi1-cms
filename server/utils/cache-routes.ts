import {
  BROWSER_REVALIDATE_API_PREFIXES,
  BROWSER_REVALIDATE_API_ROUTES,
  CDN_CACHED_ROUTES,
  LIST_PAGE_ROUTES,
} from "#shared/constants";

/** 去掉查询串：h3 的 event.path 可能带 `?query`，不剥会让所有匹配失效 */
function pathname(path: string): string {
  return path.split("?")[0] || "/";
}

/** 路径是否命中 Nitro 风格的 `/**` 路由匹配串 */
export function matchesRoutePattern(path: string, route: string): boolean {
  const p = pathname(path);
  if (route === "/**") return true;
  if (route.endsWith("/**")) {
    const prefix = route.slice(0, -3);
    return p === prefix || p.startsWith(`${prefix}/`);
  }
  return p === route;
}

/** 是否走 CDN 边缘缓存的页面 */
export function isCdnCachedPage(path: string): boolean {
  return CDN_CACHED_ROUTES.some(route => matchesRoutePattern(path, route));
}

/**
 * 是否是「列表/统计页」（内嵌评论数等聚合数据）。
 *
 * 这些页面的边缘 TTL 短（见 build.listPageCacheSeconds），写库后**不提交边缘刷新**——
 * 靠 TTL 自然过期收敛，把 EdgeOne 刷新额度留给内容页。
 */
export function isListPageRoute(path: string): boolean {
  return LIST_PAGE_ROUTES.some(route => matchesRoutePattern(path, route));
}

/** 响应可进边缘缓存、但浏览器必须每次回源验证的公开接口 */
export function isBrowserRevalidateApi(path: string): boolean {
  return (
    BROWSER_REVALIDATE_API_ROUTES.some(route => matchesRoutePattern(path, route))
    || BROWSER_REVALIDATE_API_PREFIXES.some(prefix => pathname(path).startsWith(prefix))
  );
}
