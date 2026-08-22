interface ResolveAmapRuntimeConfigOptions {
  nodeEnv?: string;
  useServerProxy: boolean;
}

// 开发环境确定直连：直接跳过读取 useServerProxy 配置（Nuxt dev 固定 NODE_ENV=development，
// 判定稳定可控）；仅生产环境才读取代理开关。
export function resolveAmapUseProxy(nodeEnv: string | undefined, useServerProxy: boolean) {
  if (nodeEnv !== "production") return false;
  return useServerProxy;
}

// 高德 key/securityCode 不在构建期烘焙（运行时由服务端从 process.env 读取，
// 见 /_AMapService 代理路由与 /api/amap/config）；这里只解析「是否走代理」这一布尔开关。
export function resolveAmapRuntimeConfig(options: ResolveAmapRuntimeConfigOptions) {
  return {
    useProxy: resolveAmapUseProxy(options.nodeEnv, options.useServerProxy),
  };
}
