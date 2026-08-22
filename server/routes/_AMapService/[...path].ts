import { createError, defineEventHandler, getRequestURL, proxyRequest, setResponseHeader } from "h3";

import { resolveAmapProxyTarget } from "#shared/amap-proxy";

export default defineEventHandler(event => {
  const config = useRuntimeConfig();

  if (!config.public.amapUseServerProxy) {
    throw createError({
      statusCode: 404,
      statusMessage: "AMap proxy is disabled.",
    });
  }

  // key/securityCode 不烘焙进包：运行时直接读 process.env（生产环境设 AMAP_KEY / AMAP_SECURITY_CODE 即可生效，无需重新打包）。
  const amapKey = process.env.AMAP_KEY || "";
  const amapSecurityCode = process.env.AMAP_SECURITY_CODE || "";

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
