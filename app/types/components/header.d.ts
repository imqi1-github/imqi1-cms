/**
 * Header 组件类型定义
 */

/** 面包屑数据 */
export interface BreadcrumbItem {
  /** 面包屑名称 */
  name: string;
  /** 面包屑图标 */
  icon?: string;
  /** 面包屑链接 */
  href?: string;
  /** 面包屑是否为当前页 */
  isCurrent?: boolean;
}