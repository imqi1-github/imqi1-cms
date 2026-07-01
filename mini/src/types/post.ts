// 首页展示用的内容类型（与后端字段命名保持一致，便于后续替换为真实接口）
export interface Category {
  name: string
  slug: string
}

export interface Post {
  cid: number
  title: string
  desc: string
  cover: string
  category: Category
  tags: string[]
  /** 已格式化好的相对时间文本，如 "3 天前" */
  created: string
  commentsNum: number
  /** 关联的旅行地点数，>0 时卡片右下角显示角标 */
  travelCount?: number
}

export interface Photo {
  id: number
  url: string
  desc: string
}

export interface QuickEntry {
  label: string
  icon: string
}

export interface HeroStat {
  label: string
  value: string
}
