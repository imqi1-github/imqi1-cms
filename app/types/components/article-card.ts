/** 文章卡片用的封面 */
export interface ArticleCardCover {
  url: string;
  desc?: string;
}

/** 文章卡片用的标签 */
export interface ArticleCardTag {
  slug?: string | null;
  name: string;
}

/**
 * 分类/标签列表页文章卡片的数据。
 *
 * 两页 content 字段不完全一致：分类页含 tags、标签页含 categoryName/categorySlug，
 * 故除必填公共字段外，切换项字段均设为可选/可空。
 */
export interface ArticleCardContent {
  cid: number;
  title: string;
  slug: string | null;
  desc?: string | null;
  covers: ArticleCardCover[];
  many_covers: boolean;
  travelCount: number;
  /** SerializeObject 会把服务端 Date 序列化成 string，运行时可能是 string 或 Date */
  updated: string | Date;
  commentsNum: number;
  tags?: ArticleCardTag[];
  categoryName?: string | null;
  categorySlug?: string | null;
}
