export function getInternalRequestHeaders(): Record<string, string> {
  if (!import.meta.server) {
    return {};
  }

  // 应用层环境变量直接读 process.env，不经 Nuxt runtimeConfig 注入。
  const secret = process.env.SSR_INTERNAL_REQUEST_SECRET || "";

  return {
    "x-ssr-internal-request": secret || "true",
  };
}
