import { siteConfig } from "~~/site.config";

export default defineEventHandler(event => {
  // 跳过开发环境
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // 非 API 端点跳过。剥离查询串，避免 "?..." 干扰前缀匹配（如 /api/mini?x=1 也须命中跳过规则）。
  const rawUrl = event.node.req.url || "";
  const path = rawUrl.split("?")[0] ?? "";

  if (!path.startsWith("/api/")) {
    return;
  }

  // 小程序公开 API 不依赖浏览器 referer，后续需要鉴权的接口单独做 token/session 校验
  if (path === "/api/mini" || path.startsWith("/api/mini/")) {
    return;
  }

  // @nuxt/icon 客户端按需取图端点：返回公开图标 SVG、无敏感数据。
  // 客户端 fetch 在部分场景（无 document referrer、经代理被剥离 Referer 等）
  // 不带 Referer 会被下方校验 403，导致图标加载超时/失败，故放行。
  if (path === "/api/_nuxt_icon" || path.startsWith("/api/_nuxt_icon/")) {
    return;
  }

  // 优先检查：SSR 内部请求标识。未配置环境变量时回落默认值，确保 SSR 内部请求在缺配
  // 环境下仍能通过 referer 门禁（与 app/utils/internal-request.ts 的 getInternalRequestHeaders 一致）。
  // 运维可通过设置 SSR_INTERNAL_REQUEST_SECRET 覆盖默认值，换成随机长串以增强安全性。
  // 应用层环境变量直接读 process.env，不经 Nuxt runtimeConfig 注入。
  const ssrInternalRequest = event.node.req.headers["x-ssr-internal-request"];
  const ssrInternalRequestSecret = process.env.SSR_INTERNAL_REQUEST_SECRET || "imqi1-cms-ssr-internal-request";
  const isSsrInternalRequest = !!ssrInternalRequestSecret && ssrInternalRequest === ssrInternalRequestSecret;

  if (isSsrInternalRequest) {
    return;
  }

  const referer = event.node.req.headers.referer;

  // 允许的 referer 域名
  const allowedDomains = siteConfig.security.allowedRefererDomains;

  // 浏览器请求必须有 referer
  if (!referer) {
    setResponseStatus(event, 403);

    console.warn("referer 缺失:", referer);

    return "";
  }

  try {
    const refererUrl = new URL(referer);

    const refererDomain = refererUrl.hostname;

    // 支持子域名
    const allowed = allowedDomains.some(domain =>
      refererDomain === domain ||
      refererDomain.endsWith(`.${domain}`)
    );

    if (!allowed) {
      setResponseStatus(event, 403);

      console.warn("referer 域名无效:", refererDomain);

      return "";
    }
  } catch (error) {
    console.error(error);
    console.warn(
      "referer 解析失败:",
      referer,
      error
    );

    setResponseStatus(event, 403);

    return "";
  }
});
