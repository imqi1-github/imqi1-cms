/**
 * SEO 相关类型定义
 */

import type { ComputedRef, Ref } from "vue";

/** 可被 useHead 接受的元数据值类型 */
export type MetaValue = string | ComputedRef<string> | Ref<string>;

/** 页面 SEO 选项 */
export interface PageSeoOptions {
  /** 完整页面标题（通常包含站点名，如 "友情链接 - ImQi1"） */
  title: MetaValue;
  /** SEO description，同时用于 og:description / twitter:description */
  description?: MetaValue;
  /** SEO keywords */
  keywords?: MetaValue;
  /** og:type，默认 "website"，文章页传 "article" */
  ogType?: string;
}