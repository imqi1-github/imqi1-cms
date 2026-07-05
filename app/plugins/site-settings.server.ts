import type { SiteSettings } from "~/types/composables/setting";

/**
 * SSR 阶段直接读数据库预取站点设置，填入 useState("site:settings")，随 payload 传到客户端。
 *
 * 不走 /api/site 的 HTTP（也就不受 referer-check 中间件拦截），直接调 server util getSiteSettings()。
 * 客户端 hydrate 后各处 fetchSiteSettings() 见到 useState 已有值即直接返回，
 * 不再发 /api/site 请求（前端 Network 不可见），首屏也不闪烁。
 *
 * 仅服务端执行（.server 插件）。
 */
export default defineNuxtPlugin(async () => {
  const siteSettings = useState<SiteSettings | null>("site:settings", () => null);
  if (siteSettings.value) {
    return;
  }

  try {
    const { getSiteSettings } = await import("#server/utils/siteSettings");
    siteSettings.value = await getSiteSettings();
  } catch (error) {
    // 静默失败：客户端仍可回退到 /api/site 请求兜底
    console.error("SSR 预取站点设置失败:", error);
  }
});
