/**
 * 右键菜单自定义指令
 * 使用方式：v-context-menu="menuItems"
 *
 * menuItems 类型：
 * Array<{
 *   icon?: string;          // 图标名称（可选）
 *   label: string;          // 菜单项文字
 *   action: () => void;     // 点击执行的函数
 *   divider?: boolean;      // 是否为分隔线（可选）
 *   disabled?: boolean;     // 是否禁用（可选）
 *   danger?: boolean;       // 是否为危险操作（可选，红色样式）
 * }>
 *
 * 注意：此指令会将自定义菜单项嵌入到全局右键菜单中，而不是创建独立的菜单
 */

import type { Directive, DirectiveBinding } from "vue";

interface MenuItem {
  icon?: string;
  label: string;
  action: (e: MouseEvent) => void;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

type MenuItems = MenuItem[];

const contextMenuDirective: Directive<HTMLElement, MenuItems> = {
  // SSR 支持
  getSSRProps(binding: DirectiveBinding<MenuItems>) {
    // 返回空对象，服务端不渲染任何特殊属性
    return {};
  },

  // 服务端不执行任何操作
  serverCreated() {},
  serverBeforeMounted() {},
  serverMounted() {},
  serverBeforeUnmount() {},
  serverUnmounted() {},

  mounted(el: HTMLElement, binding: DirectiveBinding<MenuItems>) {
    const menuItems = binding.value;

    if (!Array.isArray(menuItems) || menuItems.length === 0) {
      console.warn("[v-context-menu] 菜单项必须是非空数组");
      return;
    }

    // 存储菜单项到元素上，ContextMenu 组件会从这里读取
    (el as any)._customMenuItems = menuItems;
  },

  updated(el: HTMLElement, binding: DirectiveBinding<MenuItems>) {
    const menuItems = binding.value;
    if (!Array.isArray(menuItems)) {
      console.warn("[v-context-menu] 菜单项必须是数组");
      return;
    }

    // 更新存储的菜单项
    (el as any)._customMenuItems = menuItems;
  },

  unmounted(el: HTMLElement) {
    // 组件卸载时清除数据
    delete (el as any)._customMenuItems;
  },
};

export default contextMenuDirective;

// 导出类型
export type { MenuItem, MenuItems };
