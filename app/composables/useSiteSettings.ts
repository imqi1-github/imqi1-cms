// 全局站点设置状态
const siteSettings = ref<any>(null);
const isLoadingSettings = ref(false);
const errorSettings = ref<string | null>(null);
let fetchPromise: Promise<any> | null = null;

// 获取站点设置
async function fetchSiteSettings() {
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
      const response = await $fetch('/api/site') as any;
      if (response?.success && response?.data) {
        siteSettings.value = response.data;
        return response.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取站点设置失败';
      errorSettings.value = errorMessage;
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
