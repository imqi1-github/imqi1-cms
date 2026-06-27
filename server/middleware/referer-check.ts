import { siteConfig } from "~~/site.config";

export default defineEventHandler(event => {
  // 跳过开发环境
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // 非 API 端点跳过
  const path = event.node.req.url;

  if (!path?.startsWith("/api/")) {
    return;
  }

  // 优先检查：SSR 内部请求标识
  const ssrInternalRequest = event.node.req.headers["x-ssr-internal-request"];

  if (ssrInternalRequest === "true") {
    return;
  }

  const referer = event.node.req.headers.referer;

  // 允许的 referer 域名
  const allowedDomains = siteConfig.security.allowedRefererDomains;

  // 浏览器请求必须有 referer
  if (!referer) {
    setResponseStatus(event, 403);

    return {
      message: "Forbidden"
    };
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

      return {
        message: "Invalid referer domain"
      };
    }
  } catch (error) {
    console.error(error);
    console.warn(
      "referer 解析失败:",
      referer,
      error
    );

    setResponseStatus(event, 403);

    return {
      message: "Invalid referer format"
    };
  }
});