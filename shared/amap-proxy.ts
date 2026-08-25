export const AMAP_PROXY_BASE_PATH = "/_AMapService";

const AMAP_SCRIPT_UPSTREAM = "https://webapi.amap.com/maps";
const AMAP_STYLE_UPSTREAM = "https://webapi.amap.com/v4/map/styles";
const AMAP_REST_UPSTREAM = "https://restapi.amap.com/";

interface BuildAmapProxyScriptUrlOptions {
  version?: string;
  plugins?: string[];
  callback?: string;
  basePath?: string;
}

interface BuildAmapDirectScriptUrlOptions {
  version?: string;
  plugins?: string[];
  callback?: string;
  key: string;
}

interface ResolveAmapProxyTargetOptions {
  pathname: string;
  search?: string;
  key: string;
  securityJsCode: string;
  basePath?: string;
}

function normalizeProxyBasePath(basePath: string) {
  const trimmed = (basePath || AMAP_PROXY_BASE_PATH).trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, "") || AMAP_PROXY_BASE_PATH;
}

function createSearchParams(search = "") {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function buildAmapProxyScriptUrl(options: BuildAmapProxyScriptUrlOptions = {}) {
  const params = new URLSearchParams();
  params.set("v", options.version || "2.0");

  if (options.plugins?.length) {
    params.set("plugin", options.plugins.join(","));
  }

  if (options.callback) {
    params.set("callback", options.callback);
  }

  return `${normalizeProxyBasePath(options.basePath || AMAP_PROXY_BASE_PATH)}/maps?${params.toString()}`;
}

export function buildAmapDirectScriptUrl(options: BuildAmapDirectScriptUrlOptions) {
  const params = new URLSearchParams();
  params.set("v", options.version || "2.0");
  params.set("key", options.key);

  if (options.plugins?.length) {
    params.set("plugin", options.plugins.join(","));
  }

  if (options.callback) {
    params.set("callback", options.callback);
  }

  return `${AMAP_SCRIPT_UPSTREAM}?${params.toString()}`;
}

export function buildAmapServiceHost(origin: string, basePath = AMAP_PROXY_BASE_PATH) {
  return new URL(normalizeProxyBasePath(basePath), origin).toString();
}

export function resolveAmapProxyTarget(options: ResolveAmapProxyTargetOptions) {
  const basePath = normalizeProxyBasePath(options.basePath || AMAP_PROXY_BASE_PATH);
  const params = createSearchParams(options.search);

  params.delete("key");
  params.delete("jscode");

  if (options.pathname === `${basePath}/maps`) {
    const target = new URL(AMAP_SCRIPT_UPSTREAM);
    params.set("key", options.key);
    target.search = params.toString();
    return target;
  }

  if (options.pathname === `${basePath}/v4/map/styles`) {
    const target = new URL(AMAP_STYLE_UPSTREAM);
    params.set("jscode", options.securityJsCode);
    target.search = params.toString();
    return target;
  }

  if (!options.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  const target = new URL(options.pathname.slice(basePath.length + 1), AMAP_REST_UPSTREAM);
  // SSRF 防御（下沉到 shared）：pathname 剩余段若以 //、https:// 等开头会覆盖固定上游 host，
  // 这里当场校验 hostname 命中白名单，避免未来调用方复用本函数而漏掉 hostname 回查。
  if (!(target.hostname === "restapi.amap.com" || target.hostname === "webapi.amap.com")) {
    return null;
  }
  params.set("jscode", options.securityJsCode);
  target.search = params.toString();
  return target;
}
