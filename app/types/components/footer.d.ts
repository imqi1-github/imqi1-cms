/**
 * Footer 组件类型定义
 */

/** 底部图标链接 */
export interface FooterIcon {
  /** 图标名称 */
  name: string;
  /** 图标图标 */
  icon: string;
  /** 图标链接 */
  href?: string;
  /** 图标链接标题 */
  title?: string;
  /** 图标链接目标 */
  target?: string;
}
