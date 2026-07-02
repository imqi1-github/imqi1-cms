// 归档页文章条目：按月份分组展示标题与日期中的天
export interface ArchiveArticle {
  /** 文章唯一 id，用作列表 key */
  id: number
  /** 日期中的天，两位数字文本 */
  day: string
  /** 文章标题 */
  title: string
}

/** 归档月份分组 */
export interface ArchiveMonthGroup {
  /** 月份标题，如 "2026 年 07 月" */
  title: string
  /** 该月文章列表 */
  items: ArchiveArticle[]
}
