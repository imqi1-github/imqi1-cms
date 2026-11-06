import {
  BROWSER_REVALIDATE_API_PREFIXES,
  BROWSER_REVALIDATE_API_ROUTES,
  CDN_CACHED_ROUTES,
  LIST_PAGE_ROUTES,
} from "./constants";

/**
 * 缓存路由判定（app 与 nitro 共用同一份）。
 *
 * 放在 shared 是因为 **nuxt.config 的 routeRules 与运行时的响应头插件都要用**：
 * 两边若各写一套（一个精确相等、一个模式匹配），同一页面会被判成不同 TTL 档位。
 */

/** 去掉查询串：h3 的 event.path 可能带 `?query`，不剥会让所有匹配失效 */
function pathname(path: string): string {
  return path.split("?")[0] || "/";
}

/**
 * 路由匹配串取样例路径（`/category/**` → `/category`）。
 *
 * 匹配串按「路径」语义匹配时匹配不上自己（`/category/**` 不等于 `/category/**` 的前缀），
 * 判定「这一族页面是不是列表页 / 有没有进边缘」时要用样例路径，
 * 这样「具体路径」与「路由匹配串」两种入参走同一份清单，不会分叉成两套档位。
 */
export function routeSamplePath(route: string): string {
  return route.endsWith("/**") ? (route.slice(0, -3) || "/") : route;
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
  const sample = routeSamplePath(pathname(path));
  return CDN_CACHED_ROUTES.some(route => matchesRoutePattern(sample, route));
}

/**
 * 是否是「列表/统计页」（内嵌评论数等聚合数据）。
 *
 * 这些页面的边缘 TTL 短（见 build.listPageCacheSeconds），写库后**不提交边缘刷新**——
 * 靠 TTL 自然过期收敛，把 EdgeOne 刷新额度留给内容页。
 */
export function isListPageRoute(path: string): boolean {
  const sample = routeSamplePath(pathname(path));
  return LIST_PAGE_ROUTES.some(route => matchesRoutePattern(sample, route));
}

/**
 * 路由**匹配串**是否属于列表页档（给 nuxt.config 的 routeRules 定 TTL 用）。
 *
 * 与 isListPageRoute 共用同一份 LIST_PAGE_ROUTES，避免「配置里算长 TTL、运行时算短 TTL」。
 */
export function isListPageRoutePattern(route: string): boolean {
  return isListPageRoute(route);
}

/**
 * 各路由族里**会改变 SSR 输出**的查询参数（其余可安全剥掉）。
 *
 * 漏登记的参数 = 源站缓存串页：例：/map 的 place 决定标题，剥掉后
 * 「中街 - 我的足迹」会被缓存成所有人的标题（实测生产命中过）。
 */
export const SIGNIFICANT_QUERY_PARAMS: Record<string, string[]> = {
  "/category/**": ["page"],
  "/tag/**": ["page"],
  "/map": ["view", "place"],
  "/subscribes": ["source"],
  "/changelogs": ["type"],
};

/** 该路径下需要保留的查询参数名 */
export function significantQueryParams(path: string): string[] {
  const p = routeSamplePath(pathname(path));
  for (const [pattern, params] of Object.entries(SIGNIFICANT_QUERY_PARAMS)) {
    if (matchesRoutePattern(p, pattern)) return params;
  }
  return [];
}

/**
 * 只保留显著参数的规范化查询串（无参数时返回空串）。
 * 参数顺序按注册表顺序固定，避免 /map?view=blogs&place=1 与 /map?place=1&view=blogs 生成两条缓存键。
 *
 * 分页参数归一化：`page=1`（以及 abc/0/-5 这类非法值，后端都回退到第 1 页）
 * 与不带参数等价 → 一律剥掉，让「第 1 页」只有一条缓存键。
 */
export function canonicalSearch(path: string, query: Record<string, unknown>): string {
  const keep = significantQueryParams(path);
  if (!keep.length) return "";
  const parts: string[] = [];
  for (const name of keep) {
    const value = query[name];
    if (value === undefined || value === null) continue;
    const raw = Array.isArray(value) ? String(value[0]) : String(value);
    if (name === "page") {
      const page = Number.parseInt(raw, 10);
      if (!Number.isInteger(page) || page < 2) continue;
    }
    parts.push(`${name}=${encodeURIComponent(raw)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** 响应可进边缘缓存、但浏览器必须每次回源验证的公开接口 */
export function isBrowserRevalidateApi(path: string): boolean {
  return (
    BROWSER_REVALIDATE_API_ROUTES.some(route => matchesRoutePattern(path, route))
    || BROWSER_REVALIDATE_API_PREFIXES.some(prefix => pathname(path).startsWith(prefix))
  );
}
