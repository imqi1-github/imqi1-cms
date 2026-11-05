/**
 * 浏览器一律不缓存、每次向边缘验证；边缘 TTL 分两档：
 *   - 内容页（文章详情/友链/订阅/…）：site.config 的 pageCacheSeconds（长），
 *     靠写库后的精确 URL 刷新保持新鲜；
 *   - 列表/统计页（首页/分类/标签/归档/关于/站点地图）：listPageCacheSeconds（短），
 *     内嵌评论数等聚合数据靠 TTL 自然收敛，写库后不提交边缘刷新。
 *
 * 必须用 beforeResponse 钩子：Nitro 的缓存处理器会写死 `max-age=<源站 TTL>`，
 * routeRules 的 headers 会被它覆盖，只有响应发出前能改回来。
 */
import { getRequestPath, getResponseHeader, getResponseStatus, setResponseHeader } from "h3";

import { siteConfig } from "~~/site.config";
import { isBrowserRevalidateApi, isCdnCachedPage, isListPageRoute } from "#server/utils/cache-routes";

const PAGE_S_MAXAGE = siteConfig.build.pageCacheSeconds;
const LIST_S_MAXAGE = siteConfig.build.listPageCacheSeconds;
const API_S_MAXAGE = 60;

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("beforeResponse", (event) => {
    // 开发环境不下发边缘缓存头（与 routeRules 的 isProduction 门控一致）
    if (process.env.NODE_ENV !== "production") return;

    const path = getRequestPath(event);
    const isPagePath = isCdnCachedPage(path);
    const isApiPath = isBrowserRevalidateApi(path);
    if (!isPagePath && !isApiPath) return;
    // 4xx/5xx 不进长缓存（例如不存在的文章）：显式 no-store，避免 404 被边缘缓存后一直 404
    if (getResponseStatus(event) >= 400) {
      setResponseHeader(event, "cache-control", "no-store");
      return;
    }
    // admin / login 等已显式 no-store，不要覆盖
    if (String(getResponseHeader(event, "cache-control") ?? "").includes("no-store")) return;

    const contentType = String(getResponseHeader(event, "content-type") ?? "");
    if (isPagePath && (contentType.includes("text/html") || path === "/sitemap.xml")) {
      const sMaxage = isListPageRoute(path) ? LIST_S_MAXAGE : PAGE_S_MAXAGE;
      setResponseHeader(event, "cache-control", `public, max-age=0, s-maxage=${sMaxage}`);
      return;
    }
    if (isApiPath) {
      setResponseHeader(event, "cache-control", `public, max-age=0, s-maxage=${API_S_MAXAGE}`);
    }
  });
});
