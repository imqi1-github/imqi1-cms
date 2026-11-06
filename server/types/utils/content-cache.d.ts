/** 生成内容 URL 所需的最小字段（文章/独立页面 + 分类/标签关系） */
export interface ContentUrlRow {
  cid: number;
  slug: string | null;
  type: number;
  contentrelations: { metas: { slug: string | null; type: string } }[];
}

/**
 * 文章变更影响到的「展示面」——决定边缘刷哪些页面。
 *
 * 之前所有文章变更都刷同一套页面（首页/归档/关于/协议/留言板/站点地图 + 5 个接口 +
 * 平均 8.5 个「相关文章」页 ≈ 30 个 URL），但**只改正文时那些页面一个都没变** → 白刷 26 个额度。
 * 按展示面拆开后：只改正文 = 1 个 URL；改标题/封面 = 文章页 + 显示卡片的地方 + 引用它的页。
 */
export type ContentScope =
  /** 文章详情页（含改 slug 后的旧地址） */
  | "article"
  /** 显示文章卡片的页：首页/归档/站点地图 + 文章所在的分类/标签页 + /api/home-data */
  | "card"
  /** 引用了这篇文章的「相关文章」卡片（其它文章页） */
  | "related"
  /** 分类/标签列表目录：文章进出列表或归属变化 → 后续页码位移 */
  | "listDir"
  /** 与文章无关的固定页与公开接口（关于/协议/留言板/travels/blog-network/categories/tags） */
  | "fixed";

/** 内容变更后的缓存失效参数 */
export interface InvalidateContentCachesOptions {
  /** 受影响路由（Nitro 匹配串，`/**` 表示该前缀下全部页面）；不传 = 全站，传空数组 = 不按路由 */
  routes?: string[];
  /**
   * 精确到具体页面的**源站缓存**失效（与 routes 取并集）。
   *
   * 用于「只影响某几篇文章页」的高频变更（点赞、相关文章），避免按 `/content/**`
   * 把全部文章页的源站缓存清掉、逼出全站 Shiki 重渲染。
   */
  sourcePaths?: string[];
  /** 本次变更的内容 cid：用于把 `/content/**` 等通配展开成精确 URL，避免消耗目录刷新额度 */
  contentCids?: number[];
  /** 已确定的具体站内路径（如删除前查到的文章页/分类页），优先于通配目录刷新 */
  contentPaths?: string[];
  /** 显式的边缘刷新路由；传空数组 = 只刷 edgePaths，不刷路由 */
  edgeRoutes?: string[];
  /** 显式的边缘刷新路径（相对路径），与路由展开的结果合并提交 */
  edgePaths?: string[];
  /** 显式的边缘目录前缀（结构性变更：文章增删会让列表页码整体位移 → 刷整个列表目录） */
  edgeDirectories?: string[];
  /**
   * 本次变更影响到的展示面（决定刷哪些页面）。
   *
   * **不传 = 保守全刷**（老行为），保证没声明 scopes 的调用点不受影响。
   * 传了就按展示面精确展开：边缘刷什么，源站就清什么（两边必须同口径，
   * 否则边缘刷了但源站还是旧 HTML → 回源 304 → 旧内容复活）。
   */
  scopes?: ContentScope[];
  /**
   * 纯计数类变更（评论增删）：不刷路由派生的固定页，只刷「文章所在的那一页」。
   * 窗口内只要出现一次非 countOnly 变更，整窗就按内容类处理（见 scheduleCdnPurge）。
   */
  countOnly?: boolean;
}
