/**
 * AMap 工具类型定义
 */

/** 高德客户端配置（运行时获取，key 不烘焙进包） */
export interface AmapClientConfig {
  /** 是否走服务端 nitro 同源代理（true 时浏览器不持 key，由 /_AMapService 注入） */
  useProxy: boolean;
  /** 直连模式下的高德 JS API key（代理模式下为空串） */
  key: string;
  /** 直连模式下的安全密钥 securityJsCode（代理模式下为空串） */
  securityJsCode: string;
}

/** 高德地图加载选项 */
export interface LoadAmapOptions {
  version?: string;
  plugins?: string[];
  useProxy?: boolean;
  key?: string;
  securityJsCode?: string;
}

/** 公共资源加载选项 */
export interface PublicAssetOptions {
  path?: string;
  useProxy?: boolean;
}

/** 解析后的代理代理信息（从 AMap 响应中提取） */
export interface ParsedAgent {
  name?: string;
  server?: string;
}

type AmapWindow = Window & {
  AMap?: typeof AMap;

  _AMapSecurityConfig?: {
    serviceHost?: string;
    securityJsCode?: string;
  };

  __onAmapProxyLoaded?: (error?: unknown) => void;
};
