/**
 * AMap 工具类型定义
 */

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