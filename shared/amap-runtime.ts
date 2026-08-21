export interface AmapProxyModeConfig {
  development: boolean;
  production: boolean;
}

interface ResolveAmapRuntimeConfigOptions {
  nodeEnv?: string;
  key?: string;
  securityJsCode?: string;
  useNginxProxy: AmapProxyModeConfig;
}

export function resolveAmapUseProxy(nodeEnv: string | undefined, useNginxProxy: AmapProxyModeConfig) {
  return nodeEnv === "production" ? useNginxProxy.production : useNginxProxy.development;
}

export function resolveAmapRuntimeConfig(options: ResolveAmapRuntimeConfigOptions) {
  const key = options.key || "";
  const securityJsCode = options.securityJsCode || "";
  const useProxy = resolveAmapUseProxy(options.nodeEnv, options.useNginxProxy);

  return {
    // 地图能否加载改由运行时判断（见 TravelMap.vue），不再在构建期固化 enabled。
    useProxy,
    // 非代理模式才把 key 暴露给客户端；代理模式下 key 仅存在于服务端 runtimeConfig。
    publicKey: !useProxy ? key : "",
    publicSecurityJsCode: !useProxy ? securityJsCode : "",
  };
}
