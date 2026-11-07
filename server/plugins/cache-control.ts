/**
 * 浏览器一律不缓存、每次向边缘验证；边缘 TTL 分两档：
 *   - 内容页（文章详情/友链/订阅/…）：site.config 的 edgeCacheSeconds（默认 1 小时），
 *     靠写库后的精确 URL 刷新保持新鲜；
 *   - 列表/统计页（首页/分类/标签/归档/关于/站点地图）：listPageCacheSeconds（短），
 *     内嵌评论数等聚合数据靠 TTL 自然收敛，写库后不提交边缘刷新。
 *
 * 必须用 beforeResponse 钩子：Nitro 的缓存处理器会写死 `max-age=<源站 TTL>`，
 * routeRules 的 headers 会被它覆盖，只有响应发出前能改回来。
 *
 * 304 走不到这个钩子（h3 在 event.handled 时跳过），由 `server/middleware/cache-304.ts` 单独修。
 */
import { getRequestPath, getResponseHeader, getResponseStatus, setResponseHeader } from "h3";

import { apiCacheControl, pageCacheControl } from "#server/utils/cache-control";
import { isBrowserRevalidateApi, isCdnCachedPage } from "#shared/cache-routes";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("beforeResponse", (event) => {
    // 开发环境不下发边缘缓存头（与 routeRules 的 isProduction 门控一致）
    if (process.env.NODE_ENV !== "production") return;

    // 响应已经写出时不能再设 header（Node: ERR_HTTP_HEADERS_SENT）→ 会把请求变成 500
    // 并触发错误通知邮件。handler 主动写出的 4xx/5xx（如 MCP 端点的 406/400）就会走到这里。
    if (event.node.res.headersSent) return;

    const path = getRequestPath(event);
    // 错误响应一律 no-store（不限路径）：边缘「默认缓存」开启时，无 Cache-Control 的 4xx/5xx 会被缓存半小时
    if (getResponseStatus(event) >= 400) {
      setResponseHeader(event, "cache-control", "no-store");
      return;
    }
    const isPagePath = isCdnCachedPage(path);
    const isApiPath = isBrowserRevalidateApi(path);
    if (!isPagePath && !isApiPath) return;
    // admin / login 等已显式 no-store，不要覆盖
    if (String(getResponseHeader(event, "cache-control") ?? "").includes("no-store")) return;

    const contentType = String(getResponseHeader(event, "content-type") ?? "");
    if (isPagePath && (contentType.includes("text/html") || path === "/sitemap.xml")) {
      setResponseHeader(event, "cache-control", pageCacheControl(path));
      return;
    }
    if (isApiPath) {
      setResponseHeader(event, "cache-control", apiCacheControl());
    }
  });
});
