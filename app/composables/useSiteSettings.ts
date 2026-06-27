import type { InternalApi } from "nitropack/types";

// 从 InternalApi 推导站点设置的真实类型（与 server/api/site.get.ts 的 SiteSettings 对齐）
type SiteSettings = NonNullable<InternalApi["/api/site"]["get"]["data"]>;

// 全局站点设置状态
const siteSettings = ref<SiteSettings | null>(null);
const isLoadingSettings = ref(false);
const errorSettings = ref<string | null>(null);
let fetchPromise: Promise<SiteSettings> | null = null;

// 获取站点设置
async function fetchSiteSettings(): Promise<SiteSettings> {
  // 如果已经加载过，直接返回
  if (siteSettings.value) {
    return siteSettings.value;
  }

  // 如果正在加载，返回相同的 Promise
  if (fetchPromise) {
    return fetchPromise;
  }

  // 开始加载
  isLoadingSettings.value = true;
  errorSettings.value = null;

  fetchPromise = (async () => {
    try {
      const response = await $fetch('/api/site');
      if (response.success) {
        siteSettings.value = response.data;
        return response.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      errorSettings.value = error instanceof Error ? error.message : '获取站点设置失败';
      console.error('获取站点设置失败:', error);
      throw error;
    } finally {
      isLoadingSettings.value = false;
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function useSiteSettings() {
  return {
    siteSettings: computed(() => siteSettings.value),
    isLoadingSettings: readonly(isLoadingSettings),
    errorSettings: readonly(errorSettings),
    fetchSiteSettings,
  };
}
