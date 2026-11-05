/** 生成内容 URL 所需的最小字段（文章/独立页面 + 分类/标签关系） */
export interface ContentUrlRow {
  cid: number;
  slug: string | null;
  type: number;
  contentrelations: { metas: { slug: string | null; type: string } }[];
}

/** 内容变更后的缓存失效参数 */
export interface InvalidateContentCachesOptions {
  /** 受影响路由（Nitro 匹配串，`/**` 表示该前缀下全部页面）；留空 = 清空整组 */
  routes?: string[];
  /** 本次变更的内容 cid：用于把 `/content/**` 等通配展开成精确 URL，避免消耗目录刷新额度 */
  contentCids?: number[];
  /** 已确定的具体站内路径（如删除前查到的文章页/分类页），优先于通配目录刷新 */
  contentPaths?: string[];
}
