// 访客分布（足迹）聚合端的读者落点状态：
// placed=已落点国内城市，unknown=坐标解析不出，overseas=境外
export type IdStatus = "placed" | "unknown" | "overseas";

// 一个城市桶（TravelMap 打点用）
export interface FootprintPoint {
  id: number;
  name: string;
  count: number;
  longitude: number;
  latitude: number;
  readers: import("./reader").Reader[];
}

// /api/footprint 响应（自定义缓存 custom:footprint 中也存这份结构）
export interface FootprintPayload {
  success: true;
  data: {
    points: FootprintPoint[];
    overseas: number;
    unknown: number;
    total: number;
  };
}
