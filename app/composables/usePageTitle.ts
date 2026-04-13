import { ref, type Ref } from "vue";

// 页面标题状态 - 使用 ref 确保响应式
const currentPageTitle: Ref<string | null> = ref(null);
const currentPageIcon: Ref<string | null> = ref(null);

// 页面分类状态（用于文章页面包屑）
interface PageCategory {
  name: string;
  slug: string;
}

const currentPageCategory: Ref<PageCategory | null> = ref(null);

export function usePageTitle() {
  // 设置页面标题
  function setPageTitle(title: string, icon?: string) {
    currentPageTitle.value = title;
    if (icon) {
      currentPageIcon.value = icon;
    }
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
