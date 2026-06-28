/**
 * 自定义右键菜单类型定义
 * 统一 ContextMenu.vue、contextMenu.ts 和 useCustomContextMenu.ts 的类型
 */

/**
 * 单个菜单项
 */
export interface MenuItem {
  /** 图标名称（可选） */
  icon?: string;
  /** 菜单项文字（必需） */
  label: string;
  /** 点击执行的函数（必需） */
  action: (e: MouseEvent) => void;
  /** 是否为分隔线（可选） */
  divider?: boolean;
  /** 是否禁用（可选） */
  disabled?: boolean;
  /** 是否为危险操作（可选，红色样式） */
  danger?: boolean;
}

/**
 * 菜单项数组
 */
export type MenuItems = MenuItem[];

/**
 * 带有自定义菜单项的 DOM 元素
 */
export interface MenuElement extends HTMLElement {
  /** 自定义菜单项 */
  "_customMenuItems"?: MenuItems;
}

/**
 * 向后兼容的别名（用于 useCustomContextMenu.ts）
 */
export type CustomMenuItems = MenuItems;
export type CustomMenuItem = MenuItem;
