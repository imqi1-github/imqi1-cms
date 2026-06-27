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

  if (!config.amapKey || !config.amapSecurityCode) {
    throw createError({
      statusCode: 503,
      statusMessage: "AMap proxy is not configured.",
    });
  }

  const requestUrl = getRequestURL(event);
  const target = resolveAmapProxyTarget({
    pathname: requestUrl.pathname,
    search: requestUrl.search,
    key: config.amapKey,
    securityJsCode: config.amapSecurityCode,
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
