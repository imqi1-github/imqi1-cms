export function getInternalRequestHeaders(): Record<string, string> {
  if (!import.meta.server) {
    return {};
  }

  // 应用层环境变量直接读 process.env，不经 Nuxt runtimeConfig 注入。
  // 未配置环境变量时回落固定默认值（与 server/middleware/referer-check.ts 保持一致），
  // 确保 SSR 内部请求在缺配环境下仍携带校验头通过 referer 门禁，而非被 403 拦截。
  // 运维可通过设置 SSR_INTERNAL_REQUEST_SECRET 覆盖默认值，换成随机长串以增强安全性。
  const secret = process.env.SSR_INTERNAL_REQUEST_SECRET || "imqi1-cms-ssr-internal-request";

  return {
    "x-ssr-internal-request": secret,
  };
}
