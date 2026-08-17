// 站点统计热力图：/api/heatmap 客户端响应类型（与服务端 server/types/apis/heatmap.d.ts 同构）
export interface HeatmapDayData {
  articles: number;
  comments: number;
}

export interface HeatmapData {
  totalArticles: number;
  totalComments: number;
  /** 出现的年份，降序（含当年） */
  years: number[];
  /** key 为本地时区 YYYY-MM-DD */
  days: Record<string, HeatmapDayData>;
}

export interface HeatmapResponse {
  success: boolean;
  data: HeatmapData;
}

// 分类/标签筛选下拉选项（/api/categories、/api/tags）
export interface CategoryOption {
  name: string;
  slug: string | null;
}

export interface TagOption {
  name: string;
  slug: string;
}
