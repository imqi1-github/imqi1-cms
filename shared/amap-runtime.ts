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
  const enabled = Boolean(key && securityJsCode);
  const useProxy = resolveAmapUseProxy(options.nodeEnv, options.useNginxProxy);

  return {
    enabled,
    useProxy,
    publicKey: enabled && !useProxy ? key : "",
    publicSecurityJsCode: enabled && !useProxy ? securityJsCode : "",
  };
}
