import { createError, defineEventHandler, getRequestURL, proxyRequest, setResponseHeader } from "h3";

import { resolveAmapProxyTarget } from "#shared/amap-proxy";

export default defineEventHandler(event => {
  const config = useRuntimeConfig();

  if (!config.public.amapUseProxy) {
    throw createError({
      statusCode: 404,
      statusMessage: "AMap proxy is disabled.",
    });
  }

  // key 优先走 runtimeConfig（构建期 .env 或运行时 NUXT_AMAP_KEY 覆盖），
  // 兜底直接读 process.env.AMAP_KEY，让生产环境直接设置 AMAP_KEY 也能在运行时生效。
  const amapKey = config.amapKey || process.env.AMAP_KEY || "";
  const amapSecurityCode = config.amapSecurityCode || process.env.AMAP_SECURITY_CODE || "";

  if (!amapKey || !amapSecurityCode) {
    throw createError({
      statusCode: 503,
      statusMessage: "AMap proxy is not configured.",
    });
  }

  const requestUrl = getRequestURL(event);
  const target = resolveAmapProxyTarget({
    pathname: requestUrl.pathname,
    search: requestUrl.search,
    key: amapKey,
    securityJsCode: amapSecurityCode,
  });

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: "Unknown AMap proxy path.",
    });
  }

  return proxyRequest(event, target.toString(), {
    onResponse: () => {
      if (target.searchParams.has("callback")) {
        setResponseHeader(event, "Content-Type", "application/javascript; charset=utf-8");
      }
    },
  });
});
