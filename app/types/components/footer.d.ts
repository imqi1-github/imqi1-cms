/**
 * Footer 组件类型定义
 */

/** 底部图标链接 */
export interface FooterIcon {
  icon: string;
  to?: string;
  href?: string;
  title?: string;
  external?: boolean;
}