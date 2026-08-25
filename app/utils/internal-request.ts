export function getInternalRequestHeaders(): Record<string, string> {
  if (!import.meta.server) {
    return {};
  }

  // 应用层环境变量直接读 process.env，不经 Nuxt runtimeConfig 注入。
  const secret = process.env.SSR_INTERNAL_REQUEST_SECRET || "";

  // 生产缺失 secret 时不再回退为可伪造的 "true"（见 referer-check 端 fail-closed）。
  // 未配置时留空：referer-check 在 production 下会按「无内部头 + 无 referer」正常校验，
  // 迫使运维配置随机 secret，而非暴露一个可被任意外部调用方伪造的放行标记。
  if (!secret) {
    console.warn("[internal-request] SSR_INTERNAL_REQUEST_SECRET 未配置，内部请求将不带校验头");
    return {};
  }

  return {
    "x-ssr-internal-request": secret,
  };
}
