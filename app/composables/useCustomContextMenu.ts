/**
 * 自定义右键菜单的全局状态管理
 * 用于在指令和 ContextMenu 组件之间传递自定义菜单项
 */

interface CustomMenuItem {
  icon?: string;
  label: string;
  action: (e: MouseEvent) => void;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

type CustomMenuItems = CustomMenuItem[];

// 在模块顶层创建单例响应式状态
const customMenuItems = ref<CustomMenuItems | null>(null);
const customMenuTarget = ref<HTMLElement | null>(null);

/**
 * 设置自定义菜单项
 */
export const setCustomMenu = (items: CustomMenuItems, target: HTMLElement) => {
  customMenuItems.value = items;
  customMenuTarget.value = target;
};

/**
 * 清除自定义菜单项
 */
export const clearCustomMenu = () => {
  customMenuItems.value = null;
  customMenuTarget.value = null;
};

/**
 * 获取自定义菜单项（在组件中使用）
 */
export const useCustomContextMenu = () => {
  return {
    customMenuItems: readonly(customMenuItems),
    customMenuTarget: readonly(customMenuTarget),
    setCustomMenu,
    clearCustomMenu,
  };
};
