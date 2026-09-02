// 搜索索引（自定义缓存，非 ISR）相关端到端类型
export interface SearchIndexBuildResponse {
  success: boolean;
  count: number;
  durationMs: number;
  message?: string;
}

/** settings.get 下发的搜索索引状态（只读展示） */
export interface SearchIndexStatus {
  searchIndexExpire: number;
  searchIndexBuiltAt: string;
  searchIndexCount: number;
  searchIndexStatus: string;
}
