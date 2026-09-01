import type { SiteSettings } from "~/types/composables/setting";

/**
 * SSR 阶段直接读数据库预取站点设置，填入 useState("site:settings")，随 payload 传到客户端。
 *
 * 不走 /api/site 的 HTTP（也就不受 referer-check 中间件拦截），直接调 server util getSiteSettings()。
 * 客户端 hydrate 后各处 fetchSiteSettings() 见到 useState 已有值即直接返回，
 * 不再发 /api/site 请求（前端 Network 不可见），首屏也不闪烁。
 *
 * 同时用服务端 runtimeConfig.buildHash（非 public）预取构建哈希到 useState("site:buildHash")，
 * 供 <meta name="build-hash"> / 页脚 / 后台仪表盘展示——不随 /api/site 二次请求，SSR 首屏即有值。
 * 注意：useState 必须在插件 callback 内调用（不能在模块顶层，否则 SSR 早期拿不到 Nuxt instance）。
 *
 * 仅服务端执行（.server 插件）。
 */
export default defineNuxtPlugin(async () => {
  const siteSettings = useState<SiteSettings | null>("site:settings", () => null);
  const buildHash = useState<string | null>("site:buildHash", () => null);

  // 构建哈希：非 public（不进 __NUXT__ 的 runtimeConfig），服务端直读，随 payload 下发。
  if (import.meta.server) {
    buildHash.value = useRuntimeConfig().buildHash ?? null;
  }

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
