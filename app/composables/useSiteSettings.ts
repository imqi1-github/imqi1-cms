import type {SiteSettings} from "~/types/composables/setting";

// 加载状态（模块级，仅客户端有意义）
const isLoadingSettings = ref(false);
const errorSettings = ref<string | null>(null);
let fetchPromise: Promise<SiteSettings> | null = null;

// 获取站点设置
async function fetchSiteSettings(): Promise<SiteSettings> {
  // 站点设置存于 useState：SSR 插件预取后随 payload 传到客户端，
  // hydrate 时已有值，故首屏不闪烁、客户端也不会再发 /api/site 请求。
  const siteSettings = useState<SiteSettings | null>("site:settings", () => null);

  // 已有值（SSR 预取 / 之前已加载）直接返回，不发请求
  if (siteSettings.value) {
    return siteSettings.value;
  }

  // 服务端由 site-settings.server 插件直连数据库预取；若到这里仍无值，
  // 说明预取失败，返回空对象兜底而不发 HTTP（SSR 走 /api/site 会被 referer-check 拦成 403）。
  if (import.meta.server) {
    return siteSettings.value as unknown as SiteSettings;
  }

  // 正在加载，复用同一个 Promise
  if (fetchPromise) {
    return fetchPromise;
  }

  isLoadingSettings.value = true;
  errorSettings.value = null;

  fetchPromise = (async () => {
    try {
      // 客户端普通 $fetch：浏览器请求自带 referer，可过 referer-check
      const response = await $fetch("/api/site");
      if (response.success) {
        siteSettings.value = response.data;
        return response.data;
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      errorSettings.value = error instanceof Error ? error.message : "获取站点设置失败";
      console.error("获取站点设置失败:", error);
      throw error;
    } finally {
      isLoadingSettings.value = false;
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function useSiteSettings() {
  const siteSettings = useState<SiteSettings | null>("site:settings", () => null);
  return {
    siteSettings: computed(() => siteSettings.value),
    isLoadingSettings: readonly(isLoadingSettings),
    errorSettings: readonly(errorSettings),
    fetchSiteSettings,
  };
}
