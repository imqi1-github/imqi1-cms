// /api/blog-network 响应类型（旅行网络地图访客分布）

/** 访问点来源：订阅源 或 友链 */
export type BlogNetworkPointSource = "subscribe" | "link";

/** 单个访客访问点 */
export interface BlogNetworkPoint {
  id: number;
  name: string;
  avatar: string | null;
  longitude: number;
  latitude: number;
  source: BlogNetworkPointSource;
  sourceId: number;
  targetUrl: string | null;
  serverLocation: string | null;
  serverIsp: string | null;
}

export interface BlogNetworkData {
  data?: {
    points: BlogNetworkPoint[];
    overseas: number;
    unknown: number;
    total: number;
  };
}
