/**
 * Header 组件类型定义
 */

/** 面包屑数据 */
export interface BreadcrumbItem {
  name: string;
  icon?: string;
  href?: string;
  isCurrent?: boolean;
}