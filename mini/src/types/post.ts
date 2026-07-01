// 首页展示用的内容类型（与后端字段命名保持一致，便于后续替换为真实接口）

/** 首页文章卡片：仅展示封面、标题、发布时间 */
export interface ArticleCard {
  /** 文章唯一 id，用作列表 key */
  id: number
  /** 文章标题 */
  title: string
  /** 封面图地址（本地文件服务器，后续替换为真实接口） */
  cover: string
  /** 已格式化好的发布时间文本，如 "3 天前" */
  publishedAt: string
}
