/**
 * 右键菜单自定义指令
 * 使用方式：v-context-menu="menuItems"
 *
 * menuItems 类型：
 * Array<{
 *   icon?: string;                    // 图标名称（可选）
 *   label: string;                    // 菜单项文字
 *   action: (e: MouseEvent) => void;  // 点击执行的函数
 *   divider?: boolean;                // 是否为分隔线（可选）
 *   disabled?: boolean;               // 是否禁用（可选）
 *   danger?: boolean;                 // 是否为危险操作（可选，红色样式）
 * }>
 *
 * 注意：此指令会将自定义菜单项嵌入到全局右键菜单中，而不是创建独立的菜单
 */

import type { Directive } from "vue";

interface MenuItem {
  icon?: string;
  label: string;
  action: (e: MouseEvent) => void;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

type MenuItems = MenuItem[];

// 挂载在 DOM 元素上的属性名（导出供 ContextMenu 组件读取）
export const MENU_ITEMS_KEY = "_customMenuItems";

// 写入/更新挂载元素上的菜单项
function applyMenuItems(el: HTMLElement, items: unknown) {
  (el as any)[MENU_ITEMS_KEY] = items;
}

const contextMenuDirective: Directive<HTMLElement, MenuItems> = {
  // SSR 支持：服务端不渲染任何特殊属性
  getSSRProps() {
    return {};
  },

  mounted(el, binding) {
    if (!isValidItems(binding.value)) return;
    applyMenuItems(el, binding.value);
  },

  updated(el, binding) {
    if (!isValidItems(binding.value)) return;
    applyMenuItems(el, binding.value);
  },

  unmounted(el) {
    applyMenuItems(el, undefined);
  },
};

// 校验菜单项是否为非空数组
function isValidItems(value: unknown): value is MenuItems {
  if (!Array.isArray(value) || value.length === 0) {
    console.warn("[v-context-menu] 菜单项必须是非空数组");
    return false;
  }
  return true;
}

export default contextMenuDirective;

// 导出类型
export type { MenuItem, MenuItems };
