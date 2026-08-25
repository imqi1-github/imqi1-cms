/** 站点地图条目：系统页面(about/messages 等)与 CMS 独立页面合并、按 path 去重后的项 */
export interface SitemapPageItem {
  path: string;
  name: string;
  icon: string;
  external?: boolean;
}
