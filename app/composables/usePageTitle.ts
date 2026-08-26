import type { PageCategory } from "~/types/composables/page";

export function usePageTitle() {
  // 页面标题状态：用 useState 按 SSR 请求隔离，避免生产环境模块级 ref 跨请求串号。
  const currentPageTitle = useState<string | null>("page-title:title", () => null);
  const currentPageIcon = useState<string | null>("page-title:icon", () => null);
  const currentPageCategory = useState<PageCategory | null>("page-title:category", () => null);

  // 设置页面标题
  function setPageTitle(title: string, icon?: string) {
    currentPageTitle.value = title;
    // 缺省 icon 时清空，避免 SPA 切换后残留上一页图标
    currentPageIcon.value = icon ?? null;
  }

  // 获取页面标题
  function getPageTitle() {
    return currentPageTitle;
  }

  // 获取页面图标
  function getPageIcon() {
    return currentPageIcon;
  }

  // 设置页面分类
  function setPageCategory(category: PageCategory) {
    currentPageCategory.value = category;
  }

  // 获取页面分类
  function getPageCategory() {
    return currentPageCategory;
  }

  // 清除页面标题
  function clearPageTitle() {
    currentPageTitle.value = null;
    currentPageIcon.value = null;
    currentPageCategory.value = null;
  }

  return {
    setPageTitle,
    getPageTitle,
    getPageIcon,
    setPageCategory,
    getPageCategory,
    clearPageTitle,
  };
}
