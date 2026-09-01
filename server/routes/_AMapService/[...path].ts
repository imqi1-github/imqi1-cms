import { createError, defineEventHandler, getRequestURL, proxyRequest, setResponseHeader } from "h3";

import { resolveAmapProxyTarget } from "#shared/amap-proxy";

// Only AMap-owned hosts are valid proxy targets. The catch-all REST branch resolves against
// https://restapi.amap.com/, but a decoded path remainder like "//evil.com", "http://evil.com"
// or "/\\evil.com" makes new URL() escape the base host (SSRF). Re-checking the resolved
// hostname against an allowlist rejects any such escape regardless of how it is constructed,
// while still permitting the fixed script/style upstreams (webapi.amap.com).
const AMAP_ALLOWED_HOSTS = new Set(["restapi.amap.com", "webapi.amap.com"]);

export default defineEventHandler(event => {
  const config = useRuntimeConfig();

  if (!config.amapUseServerProxy) {
    throw createError({
      statusCode: 404,
      message: "AMap proxy is disabled.",
    });
  }

  // key/securityCode 不烘焙进包：运行时直接读 process.env（生产环境设 AMAP_KEY / AMAP_SECURITY_CODE 即可生效，无需重新打包）。
  const amapKey = process.env.AMAP_KEY || "";
  const amapSecurityCode = process.env.AMAP_SECURITY_CODE || "";

  if (!amapKey || !amapSecurityCode) {
    throw createError({
      statusCode: 503,
      message: "AMap proxy is not configured.",
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
      message: "Unknown AMap proxy path.",
    });
  }

  if (!AMAP_ALLOWED_HOSTS.has(target.hostname)) {
    throw createError({
      statusCode: 400,
      message: "Invalid AMap proxy target.",
    });
  }

  return proxyRequest(event, target.toString(), {
    fetchOptions: {
      // Do not follow redirects: AMap never issues them, and following a redirect to an
      // off-host target would bypass the hostname allowlist above.
      redirect: "error",
    },
    onResponse: () => {
      if (target.searchParams.has("callback")) {
        setResponseHeader(event, "Content-Type", "application/javascript; charset=utf-8");
      }
    },
  });
});
