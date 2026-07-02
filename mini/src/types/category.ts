// 分类页条目：用于展示分类名称、说明与文章数量
export interface CategoryItem {
  /** 分类唯一 id，用作列表 key */
  id: number
  /** 分类名称 */
  title: string
  /** 分类说明 */
  description: string
  /** 该分类文章数量 */
  count: number
  /** 分类视觉标识 */
  mark: string
}
