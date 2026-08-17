// /api/heatmap 响应类型：按天聚合的文章/评论发布数
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
