/**
 * 站内路由 → CDN 刷新目标的映射
 *
 * 业务侧给的路由是 Nitro 匹配串（`/content/**` 表示该前缀下全部页面），
 * CDN 刷新要的是具体资源：精确页给 URL，通配页给目录前缀
 * （EdgeOne 不支持通配符 URL，只能按目录刷）。
 */

import type { CdnPurgeTarget } from "#server/types/utils/cdn";

/** 去掉末尾斜杠的站点根地址 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * 单个路由 → 刷新目标
 *
 * `/` → url `https://site/`；`/content/**` → prefix `https://site/content/`；`/archiving` → url `https://site/archiving`
 */
export function routeToPurgeTarget(route: string, baseUrl: string): CdnPurgeTarget {
  const base = normalizeBaseUrl(baseUrl);
  const path = route.startsWith("/") ? route : `/${route}`;
  if (path === "/") return { kind: "url", value: `${base}/` };
  if (path === "/**") return { kind: "prefix", value: `${base}/` };
  if (path.endsWith("/**")) return { kind: "prefix", value: `${base}${path.slice(0, -3)}/` };
  return { kind: "url", value: `${base}${path}` };
}

/**
 * 一组路由 → 刷新目标列表
 *
 * 传空数组表示「全站」：根目录前缀一条，覆盖首页与全部子页。
 *
 * `scope="site"` 时不管路由是什么都只返回根目录前缀：CDN 的刷新额度按「资源条目数」计
 * （一个目录 = 1 个额度），目录刷新池往往比 URL 刷新池紧得多，合并成一条最省额度，
 * 代价是全站页面都要回源一次。
 */
export function routesToPurgeTargets(
  routes: string[],
  baseUrl: string,
  scope: "route" | "site" = "route",
): CdnPurgeTarget[] {
  const base = normalizeBaseUrl(baseUrl);
  if (scope === "site") {
    return [{ kind: "prefix", value: `${base}/` }];
  }
  if (!routes.length) {
    return [{ kind: "prefix", value: `${base}/` }];
  }
  return routes.map(route => routeToPurgeTarget(route, baseUrl));
}
