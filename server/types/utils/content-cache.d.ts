/** 生成内容 URL 所需的最小字段（文章/独立页面 + 分类/标签关系） */
export interface ContentUrlRow {
  cid: number;
  slug: string | null;
  type: number;
  contentrelations: { metas: { slug: string | null; type: string } }[];
}

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
   * 纯计数类变更（评论增删）：不刷路由派生的固定页，只刷「文章所在的那一页」。
   * 窗口内只要出现一次非 countOnly 变更，整窗就按内容类处理（见 scheduleCdnPurge）。
   */
  countOnly?: boolean;
}
